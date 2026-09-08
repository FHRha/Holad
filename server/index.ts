import express, { type Express } from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import md5 from 'md5';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as database from './src/database.js';
import { demoManager } from './src/demoManager.js';

dotenv.config();
// Fallback to root .env if running from server directory
if (!process.env.NAVIDROME_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const app: Express = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: '/Holad/socket.io',
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e6 // 1 MB limit to prevent OOM DoS
});

app.use(cors());

// Middleware to support relative routing when hosted under /Holad
app.use((req, res, next) => {
  if (req.url.startsWith('/Holad/api/')) {
    req.url = req.url.replace('/Holad/api/', '/api/');
    (req as any)._parsedUrl = undefined;
  }
  next();
});

const PORT = process.env.PORT || 4000;

interface NavidromeAccount {
  url: string;
  user: string;
  pass?: string;
  token?: string;
  salt?: string;
}

// Initialize Navidrome accounts from SQLite DB (auto-migrating any env accounts)
try {
  database.migrateAccountsFromEnv();
} catch (e) {
  console.error('[AUTH] Failed to run initial env accounts migration:', e);
}
let navidromeAccounts: NavidromeAccount[] = database.getNavidromeAccounts();
console.log(`[AUTH] Loaded ${navidromeAccounts.length} Navidrome account(s) from SQLite database.`);

function safeTimingCompare(a: string | undefined, b: string | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function isTargetServerAllowed(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    // Always permit localhost / loopback
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return true;
    }
    // If no accounts yet, allow for first-time configuration
    if (navidromeAccounts.length === 0) {
      return true;
    }
    // Check against authorized Navidrome account hosts
    return navidromeAccounts.some(account => {
      try {
        const accountUrl = new URL(account.url);
        const accountHost = accountUrl.hostname.toLowerCase();
        if (accountHost === host) return true;

        // Allow localhost <-> LAN IP (private network) interoperability for local servers
        const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';
        const isPrivateIp = (h: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(h);
        const accountPort = accountUrl.port || (accountUrl.protocol === 'https:' ? '443' : '80');
        const targetPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');

        if (accountPort === targetPort) {
          if ((isLoopback(accountHost) && (isLoopback(host) || isPrivateIp(host))) ||
              (isPrivateIp(accountHost) && (isLoopback(host) || isPrivateIp(host)))) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function getSubsonicAuthParams(account: NavidromeAccount) {
  if (account.token && account.salt) {
    return `u=${encodeURIComponent(account.user)}&t=${account.token}&s=${account.salt}&v=1.16.1&c=StreamNavi&f=json`;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const token = md5((account.pass || '') + salt);
  return `u=${encodeURIComponent(account.user)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
}

const ALLOWED_GUEST_ENDPOINTS = new Set([
  'ping',
  'ping.view',
  'getSong',
  'getSongsByGenre',
  'getCoverArt',
  'getAlbum',
  'getArtist',
  'getArtists',
  'getArtistInfo',
  'getArtistInfo2',
  'getIndexes',
  'getMusicDirectory',
  'getSimilarSongs',
  'getSimilarSongs2',
  'getTopSongs',
  'getGenres',
  'search3',
  'getPlaylists',
  'getPlaylist',
  'getAlbumList2',
  'getRandomSongs',
  'getLyrics',
  'getLyricsBySongId'
]);

const ALLOWED_AUTH_ENDPOINTS = new Set([
  ...ALLOWED_GUEST_ENDPOINTS,
  'createPlaylist',
  'updatePlaylist',
  'deletePlaylist',
  'star',
  'unstar',
  'setRating',
  'scrobble',
  'savePlayQueue',
  'getPlayQueue'
]);

function isValidHttpUrl(string: string) {
  try {
    const url = new URL(string);
    if (url.hash || url.search) return false;
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

console.log("=== SERVER STARTED ===");
console.log("LOADED ACCOUNTS:", navidromeAccounts.map(a => ({ user: a.user, url: a.url, hasToken: !!a.token, hasPass: !!a.pass })));
console.log("======================");

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, server: 'holad' });
});

// Sync endpoints
app.post('/api/sync/push', express.json({ limit: '10mb' }), (req, res) => {
  const { login, password, data } = req.body;
  if (!login || !password || !data) return res.status(400).json({ error: 'Missing credentials or data' });
  try {
    const userId = database.generateUserId(login, password);
    database.saveSyncData(userId, data);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving sync data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sync/pull', express.json(), (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const userId = database.generateUserId(login, password);
    const data = database.getSyncData(userId);
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error fetching sync data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PLAYLIST_ID_REGEX = /^[a-zA-Z0-9_\-\:]{1,128}$/;

app.post(['/api/custom-playlists', '/Holad/api/custom-playlists'], express.json(), (req, res) => {
  try {
    const { id, name, description, trackIds, userId, tracks } = req.body || {};

    if (!id || typeof id !== 'string' || !PLAYLIST_ID_REGEX.test(id)) {
      return res.status(400).json({ error: 'Invalid or missing ID' });
    }

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.length > 256) {
      return res.status(400).json({ error: 'Invalid name (1-256 characters required)' });
    }

    if (description !== undefined && description !== null) {
      if (typeof description !== 'string' || description.length > 2000) {
        return res.status(400).json({ error: 'Description exceeds 2000 characters limit' });
      }
    }

    if (!Array.isArray(trackIds)) {
      return res.status(400).json({ error: 'trackIds must be an array' });
    }

    if (trackIds.length > 200) {
      return res.status(400).json({ error: 'trackIds exceeds maximum limit of 200 tracks' });
    }

    for (const trackId of trackIds) {
      if (!trackId || typeof trackId !== 'string' || !PLAYLIST_ID_REGEX.test(trackId)) {
        return res.status(400).json({ error: 'Invalid track ID in trackIds' });
      }
    }

    let validTracks: any[] | undefined = undefined;
    if (tracks !== undefined && tracks !== null) {
      if (!Array.isArray(tracks) || tracks.length > 200) {
        return res.status(400).json({ error: 'tracks must be an array with up to 200 items' });
      }
      validTracks = tracks;
    }

    if (userId !== undefined && userId !== null) {
      if (typeof userId !== 'string' || !PLAYLIST_ID_REGEX.test(userId)) {
        return res.status(400).json({ error: 'Invalid userId format' });
      }
    }

    try {
      database.saveCustomPlaylist(
        id,
        name.trim(),
        typeof description === 'string' ? description : '',
        trackIds,
        userId,
        validTracks
      );
      res.status(200).json({ success: true, id });
    } catch (e: any) {
      if (e.message && e.message.includes('Forbidden')) {
        return res.status(403).json({ error: e.message });
      }
      throw e;
    }
  } catch (error) {
    console.error('Error saving custom playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get(['/api/custom-playlists/:id', '/Holad/api/custom-playlists/:id'], (req, res) => {
  const id = req.params.id as string;
  if (!id || typeof id !== 'string' || !PLAYLIST_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  try {
    const playlist = database.getCustomPlaylist(id);
    if (playlist) {
      res.status(200).json({ playlist });
    } else {
      res.status(404).json({ error: 'Playlist not found' });
    }
  } catch (error) {
    console.error('Error fetching custom playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete(['/api/custom-playlists/:id', '/Holad/api/custom-playlists/:id'], (req, res) => {
  const id = req.params.id as string;
  if (!id || typeof id !== 'string' || !PLAYLIST_ID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  const userId = (req.query.userId as string) || (req.headers['x-user-id'] as string) || undefined;
  try {
    const deleted = database.deleteCustomPlaylist(id, userId);
    if (deleted) {
      res.status(200).json({ success: true, id });
    } else {
      res.status(404).json({ error: 'Playlist not found or permission denied' });
    }
  } catch (error) {
    console.error('Error deleting custom playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Demo Mode Endpoints ---
app.get(['/api/demo/status', '/Holad/api/demo/status'], (_req, res) => {
  res.json(demoManager.getPoolStats());
});

app.get(['/api/demo/session', '/Holad/api/demo/session'], (req, res) => {
  if (!demoManager.isEnabled()) {
    return res.json({ demoMode: false });
  }

  const existingSessionId = (req.query.sessionId as string) || (req.headers['x-demo-session'] as string);
  const result = demoManager.acquireSession(existingSessionId);

  if (!result.available) {
    return res.status(429).json({
      demoMode: true,
      available: false,
      retryAfter: result.retryAfter || 60
    });
  }

  // Ensure accounts list in server memory includes the active demo account
  navidromeAccounts = database.getNavidromeAccounts();

  res.json({
    demoMode: true,
    available: true,
    sessionId: result.session!.sessionId,
    slotId: result.session!.slotId,
    guestUserId: result.session!.guestUserId,
    account: {
      url: result.session!.account.url,
      user: result.session!.account.user,
      token: result.session!.account.token,
      salt: result.session!.account.salt
    },
    expiresIn: Math.ceil((result.session!.expiresAt - Date.now()) / 1000)
  });
});

app.post(['/api/demo/heartbeat', '/Holad/api/demo/heartbeat'], express.json(), (req, res) => {
  if (!demoManager.isEnabled()) {
    return res.json({ demoMode: false });
  }
  const sessionId = req.body?.sessionId || (req.headers['x-demo-session'] as string);
  const refreshed = demoManager.heartbeat(sessionId);
  res.json({ success: refreshed });
});

app.post('/api/save-credentials', express.json({ limit: '1mb' }), async (req, res) => {
  const { url: originalUrl, username, token, salt } = req.body;
  if (!originalUrl || !username || !token || !salt) return res.status(400).send('Missing fields');
  
  const trimmedUrl = originalUrl.trim();
  if (!isValidHttpUrl(trimmedUrl)) return res.status(400).send('Invalid URL');
  
  const url = trimmedUrl.replace(/\/$/, '');
  
  if (navidromeAccounts.length > 0) {
    const existingUrl = navidromeAccounts[0]!.url.replace(/\/$/, '');
    if (existingUrl !== url) {
      try {
        const existingParsed = new URL(existingUrl);
        const newParsed = new URL(url);
        const existingPort = existingParsed.port || (existingParsed.protocol === 'https:' ? '443' : '80');
        const newPort = newParsed.port || (newParsed.protocol === 'https:' ? '443' : '80');
        const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';
        const isPrivateIp = (h: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(h);
        const existingHost = existingParsed.hostname.toLowerCase();
        const newHost = newParsed.hostname.toLowerCase();
        const isEquivalentLocal = existingPort === newPort && (
          (isLoopback(existingHost) && (isLoopback(newHost) || isPrivateIp(newHost))) ||
          (isPrivateIp(existingHost) && (isLoopback(newHost) || isPrivateIp(newHost)))
        );
        if (!isEquivalentLocal) {
          return res.status(403).send('Proxy server is already bound to a different Navidrome URL.');
        }
      } catch {
        return res.status(403).send('Proxy server is already bound to a different Navidrome URL.');
      }
    }
  }
  
  const authParams = `u=${encodeURIComponent(username)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
  
  try {
    // Force IPv4 for localhost since Node 18+ resolves localhost to IPv6 (::1) by default
    // which fails to connect to Docker containers binding to 0.0.0.0.
    const resolvedUrl = url.replace('localhost', '127.0.0.1');
    const pingUrl = `${resolvedUrl}/rest/ping.view?${authParams}`;
    const response = await fetch(pingUrl);
    
    if (!response.ok) {
       console.error(`[AUTH] Navidrome returned HTTP ${response.status} for ${pingUrl.replace(/&t=[^&]+&s=[^&]+/, '&t=***&s=***')}`);
       return res.status(response.status).json({ error: `Navidrome server returned HTTP ${response.status}. Please check your Navidrome URL.` });
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
       console.error(`[AUTH] Navidrome returned non-JSON content-type: ${contentType}`);
       const text = await response.text();
       return res.status(500).json({ error: `Navidrome returned an invalid (non-JSON) response. Are you sure this is a Navidrome server? Response snippet: ${text.substring(0, 100)}` });
    }
    
    const data = await response.json();
    if (data['subsonic-response']?.status !== 'ok') {
       console.error('[AUTH] Navidrome rejected the login:', data);
       return res.status(401).json({ error: 'Invalid username or password. Navidrome rejected the credentials.' });
    }
    
    database.saveNavidromeAccount({ url, user: username, token, salt });
    navidromeAccounts = database.getNavidromeAccounts();
    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('[AUTH] Failed to connect to Navidrome:', error);
    res.status(500).json({ error: `Error verifying credentials (Network/Fetch Error): ${error.message || error}` });
  }
});

async function executeWithFailover(req: express.Request, res: express.Response, buildUrlFn: (account: NavidromeAccount) => string, handleResponseFn: (response: Response) => Promise<any>) {
  if (navidromeAccounts.length === 0) {
    navidromeAccounts = database.getNavidromeAccounts();
  }
  if (navidromeAccounts.length === 0) {
    try {
      database.migrateAccountsFromEnv();
      navidromeAccounts = database.getNavidromeAccounts();
    } catch (e) {}
  }
  if (navidromeAccounts.length === 0) {
    if (process.env.NAVIDROME_URL) {
      navidromeAccounts.push({
        url: process.env.NAVIDROME_URL,
        user: process.env.NAVIDROME_USER || '',
        pass: process.env.NAVIDROME_PASS || ''
      });
    } else {
      return res.status(503).send('No available Navidrome accounts for guest access.');
    }
  }

  const accountsToTry = [...navidromeAccounts];
  for (const account of accountsToTry) {
    try {
      const url = buildUrlFn(account);
      const headers: Record<string, string> = {};
      if (req.headers.range) headers['Range'] = req.headers.range;
      
      const response = await fetch(url, { headers });
      
      if (response.status === 401 || response.status === 403) {
        console.warn(`Account ${account.user} failed auth.`);
        if (navidromeAccounts.length > 1 && account.user !== process.env.NAVIDROME_USER) {
          database.deleteNavidromeAccount(account.user, account.url);
          navidromeAccounts = database.getNavidromeAccounts();
        }
        continue;
      }
      
      if (response.ok || response.status === 206) {
         const contentType = response.headers.get('content-type') || '';
         if (contentType.includes('json')) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            if (data['subsonic-response']?.status === 'failed' && data['subsonic-response']?.error?.code === 40) {
               console.warn(`Account ${account.user} failed auth (code 40).`);
                if (navidromeAccounts.length > 1 && account.user !== process.env.NAVIDROME_USER) {
                  database.deleteNavidromeAccount(account.user, account.url);
                  navidromeAccounts = database.getNavidromeAccounts();
                }
               continue;
            }
         }
      }
      
      await handleResponseFn(response);
      return;
    } catch (error) {
       console.error(`Fetch failed for account ${account.user}:`, error);
    }
  }
  
  res.status(500).send('All accounts failed or network error.');
}

// Proxy generic subsonic API requests for guests
const holadHistoryCache = new Map<string, any[]>();
const historyTimers = new Map<string, NodeJS.Timeout>();
const validateAuthCache = new Map<string, number>();

const validateRestAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const roomId = req.params.roomId as string;
  let user = req.headers['x-user'] as string;
  let token = req.headers['x-token'] as string;
  let salt = req.headers['x-salt'] as string;
  let url = req.headers['x-url'] as string;

  if (!user || !token || !salt || !url) {
    return res.status(401).send('Unauthorized');
  }

  // Decode URI components in case native clients encoded them to pass non-ASCII headers
  user = decodeURIComponent(user);
  token = decodeURIComponent(token);
  salt = decodeURIComponent(salt);
  url = decodeURIComponent(url);

  if (user !== roomId) {
    return res.status(401).send('Room mismatch');
  }

  const isWhitelisted = navidromeAccounts.length === 0 || navidromeAccounts.some(a => a.user === user || a.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
  if (!isWhitelisted) {
    return res.status(403).send('Forbidden: Unauthorized server URL');
  }

  const cacheKey = `${user}:${token}`;
  const now = Date.now();
  if (validateAuthCache.has(cacheKey) && now - validateAuthCache.get(cacheKey)! < 5 * 60 * 1000) {
    return next();
  }

  try {
    const resolvedUrl = url.replace('localhost', '127.0.0.1');
    const pingUrl = `${resolvedUrl.replace(/\/$/, '')}/rest/ping.view?u=${encodeURIComponent(user)}&t=${encodeURIComponent(token)}&s=${encodeURIComponent(salt)}&v=1.16.1&c=StreamNavi&f=json`;
    const response = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
    const json = await response.json().catch(() => null);
    
    if (!response.ok || json?.['subsonic-response']?.status !== 'ok') {
      return res.status(401).send('Invalid Subsonic credentials');
    }
    
    validateAuthCache.set(cacheKey, now);
  } catch (error: any) {
    // If fetch failed due to network unreachable (e.g. Navidrome is on client's local network/localhost unreachable from backend VPS/Docker):
    const dbAccount = navidromeAccounts.find(a => a.user === user && a.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
    if (dbAccount && dbAccount.token && safeTimingCompare(dbAccount.token, token)) {
      console.warn(`[AUTH] Subsonic server unreachable directly from backend (${error?.message || error}), allowing verified session/DB account for user: ${user}`);
      validateAuthCache.set(cacheKey, now);
    } else {
      console.error(`[AUTH] Subsonic server unreachable and token verification failed:`, error?.message || error);
      return res.status(401).send('Unauthorized: Failed to verify credentials');
    }
  }

  next();
};

app.post('/api/holad/history/:roomId', validateRestAuth, express.json({ limit: '10mb' }), (req, res) => {
  const roomId = req.params.roomId as string;
  const history = req.body;
  
  if (!Array.isArray(history)) {
    return res.status(400).send('Expected JSON array');
  }
  
  const existing = holadHistoryCache.get(roomId) || [];
  const merged = [...existing, ...history];
  merged.sort((a, b) => b.playedAt - a.playedAt);
  
  const newHistory: any[] = [];
  for (const e of merged) {
    const isDuplicate = newHistory.some(ex => ex.id === e.id && Math.abs(ex.playedAt - e.playedAt) < 5 * 60 * 1000);
    if (!isDuplicate) {
      newHistory.push(e);
    }
  }
  
  holadHistoryCache.set(roomId, newHistory.slice(0, 5000));
  io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'historyAvailable' });
  
  if (historyTimers.has(roomId)) {
    clearTimeout(historyTimers.get(roomId)!);
  }
  historyTimers.set(roomId, setTimeout(() => {
    holadHistoryCache.delete(roomId);
    historyTimers.delete(roomId);
  }, 2 * 60 * 1000));
  
  res.status(200).send('OK');
});

app.get('/api/holad/history/:roomId', validateRestAuth, (req, res) => {
  const roomId = req.params.roomId as string;
  const history = holadHistoryCache.get(roomId);
  if (history) {
    res.json(history);
  } else {
    res.status(404).send('Not found or expired');
  }
});

app.post('/api/holad/playlists/:roomId', validateRestAuth, express.json(), (req, res) => {
  const roomId = req.params.roomId as string;
  const { id, name, description } = req.body;
  if (!id || !name) return res.status(400).send('Missing id or name');
  try {
    database.createPlaylist(roomId, id, name, description);
    io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'playlistCreated', payload: { id, name, description } });
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send('Error creating playlist');
  }
});

app.put('/api/holad/playlists/:roomId/:playlistId', validateRestAuth, express.json(), (req, res) => {
  const roomId = req.params.roomId as string;
  const playlistId = req.params.playlistId as string;
  const { name, description } = req.body;
  try {
    database.updatePlaylist(roomId, playlistId, name, description);
    io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'playlistUpdated', payload: { id: playlistId, name, description } });
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send('Error updating playlist');
  }
});

app.delete('/api/holad/playlists/:roomId/:playlistId', validateRestAuth, (req, res) => {
  const roomId = req.params.roomId as string;
  const playlistId = req.params.playlistId as string;
  try {
    database.deletePlaylist(roomId, playlistId);
    io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'playlistDeleted', payload: { id: playlistId } });
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send('Error deleting playlist');
  }
});

app.post('/api/holad/playlists/:roomId/:playlistId/tracks', validateRestAuth, express.json(), (req, res) => {
  const roomId = req.params.roomId as string;
  const playlistId = req.params.playlistId as string;
  const { trackId } = req.body;
  if (!trackId) return res.status(400).send('Missing trackId');
  try {
    database.addTrackToPlaylist(roomId, playlistId, trackId);
    io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'playlistTrackAdded', payload: { playlistId, trackId } });
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send('Error adding track');
  }
});

app.delete('/api/holad/playlists/:roomId/:playlistId/tracks/:trackId', validateRestAuth, (req, res) => {
  const roomId = req.params.roomId as string;
  const playlistId = req.params.playlistId as string;
  const trackId = req.params.trackId as string;
  try {
    database.removeTrackFromPlaylist(roomId, playlistId, trackId);
    io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'playlistTrackRemoved', payload: { playlistId, trackId } });
    res.status(200).send('OK');
  } catch (error) {
    res.status(500).send('Error removing track');
  }
});

app.get('/api/holad/exclusions/:roomId', validateRestAuth, (req, res) => {
  const roomId = req.params.roomId as string;
  try {
    const exclusions = database.getExclusions(roomId);
    res.json(exclusions);
  } catch (error) {
    console.error('Error fetching exclusions:', error);
    res.status(500).send('Error fetching exclusions');
  }
});

app.post('/api/holad/exclusions/:roomId', validateRestAuth, express.json(), (req, res) => {
  const roomId = req.params.roomId as string;
  try {
    if (req.body && 'entityId' in req.body && 'entityType' in req.body) {
      const { entityId, entityType, title, artist, album, trackNumber, duration, fileName, path, lyrics, lyricsHash, fingerprint } = req.body;
      const isExcluded = database.toggleExclusion(roomId, entityId, entityType, {
        title, artist, album, trackNumber, duration, fileName, path, lyrics, lyricsHash, fingerprint
      });
      io.to(`holad_${roomId}`).emit('holad_remoteCommand', {
        type: 'exclusionToggled',
        payload: { entityId, entityType, isExcluded, fingerprint }
      });
      return res.json({ ok: true, isExcluded });
    } else if (req.body && ('excludedTrackIds' in req.body || 'excludedAlbumIds' in req.body)) {
      const excludedTrackIds = req.body.excludedTrackIds || [];
      const excludedAlbumIds = req.body.excludedAlbumIds || [];
      database.setExclusions(roomId, excludedTrackIds, excludedAlbumIds);
      io.to(`holad_${roomId}`).emit('holad_remoteCommand', {
        type: 'exclusionsSynced',
        payload: { excludedTrackIds, excludedAlbumIds }
      });
      return res.json({ ok: true });
    } else {
      return res.status(400).send('Invalid request');
    }
  } catch (error) {
    console.error('Error modifying exclusions:', error);
    return res.status(500).send('Error modifying exclusions');
  }
});

app.post('/api/holad/exclusions/:roomId/reconcile', validateRestAuth, express.json(), (req, res) => {
  const roomId = req.params.roomId as string;
  try {
    const { oldId, newId, entityType, fingerprint } = req.body || {};
    if (!newId || (!oldId && !fingerprint)) {
      return res.status(400).json({ error: 'newId and either oldId or fingerprint required' });
    }
    const reconciled = database.reconcileExclusion(roomId, oldId ? String(oldId) : '', String(newId), entityType || 'track', fingerprint);
    if (reconciled) {
      const exclusions = database.getExclusions(roomId);
      io.to(`holad_${roomId}`).emit('holad_remoteCommand', {
        type: 'exclusionsSynced',
        payload: exclusions
      });
      return res.json({ ok: true, reconciled, exclusions });
    }
    return res.status(404).json({ ok: false, error: 'Exclusion not found' });
  } catch (error) {
    console.error('Error reconciling exclusion:', error);
    return res.status(500).send('Error reconciling exclusion');
  }
});

app.post(['/api/custom-playlists/:id/reconcile', '/Holad/api/custom-playlists/:id/reconcile'], express.json(), (req, res) => {
  const id = req.params.id as string;
  try {
    const { replacements } = req.body || {};
    if (!Array.isArray(replacements)) {
      return res.status(400).json({ error: 'replacements must be an array' });
    }
    const reconciled = database.reconcilePlaylistTracks(id, replacements);
    return res.json({ ok: true, reconciled });
  } catch (error) {
    console.error('Error reconciling playlist tracks:', error);
    return res.status(500).send('Error reconciling playlist tracks');
  }
});


app.get('/api/stats/artist/:name', async (req, res) => {
  const { name } = req.params;
  const { useLastFm, useYandex, lastFmKey, yandexToken } = req.query;
  
  const yandexEnabled = useYandex === 'true' && !!yandexToken;
  const lastFmEnabled = useLastFm === 'true' && !!lastFmKey;

  if (!yandexEnabled && !lastFmEnabled) {
    return res.json({ source: 'local' });
  }

  let yandexFirst = false;
  if (yandexEnabled && lastFmEnabled) {
    if (/[А-Яа-яЁё]/.test(name)) {
      yandexFirst = true;
    } else {
      try {
        const topTagsUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(name)}&api_key=${lastFmKey}&format=json`;
        const tagsRes = await fetch(topTagsUrl, { signal: AbortSignal.timeout(3000) });
        if (tagsRes.ok) {
          const tagsData = await tagsRes.json();
          const tags = tagsData.toptags?.tag?.slice(0, 10).map((t: any) => t.name.toLowerCase()) || [];
          if (tags.some((t: string) => t.includes('russian') || t.includes('rusrap') || t.includes('rusrock'))) {
            yandexFirst = true;
          }
        }
      } catch (e) {
        console.warn('Last.fm tag check failed:', e);
      }
    }
  } else if (yandexEnabled) {
    yandexFirst = true;
  }

  const tryYandex = async () => {
    // Basic implementation of Yandex Music Search to get artist stats
    // We mock actual parsing since yandex api can be complex without a library, but let's return some structure
    // For a real robust proxy, we might need an actual yandex-music-api wrapper.
    const searchUrl = `https://api.music.yandex.net/search?text=${encodeURIComponent(name)}&type=artist`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `OAuth ${yandexToken}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!searchRes.ok) throw new Error('Yandex search failed');
    const searchData = await searchRes.json();
    const artist = searchData.result?.artists?.results?.[0];
    if (!artist) throw new Error('Artist not found in Yandex');

    // Get artist brief info
    const briefUrl = `https://api.music.yandex.net/artists/${artist.id}/brief-info`;
    const briefRes = await fetch(briefUrl, {
      headers: { 'Authorization': `OAuth ${yandexToken}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!briefRes.ok) throw new Error('Yandex brief info failed');
    const briefData = await briefRes.json();

    return {
      source: 'yandex',
      data: {
        listeners: briefData.result?.stats?.lastMonthListeners || 0,
        playcount: 0, // Yandex doesn't provide total playcount easily
        similar: briefData.result?.similar?.map((a: any) => ({ name: a.name })) || [],
        tags: artist.genres || [],
        // image: artist.cover?.uri ? `https://${artist.cover.uri.replace('%%', '600x600')}` : null,
        label: briefData.result?.labels?.map((l: any) => l.name || l.id || l).join(', ') || null,
        recordCompany: artist.tickets?.length ? 'On Tour' : null // Mocking some extra info
      }
    };
  };

  const tryLastFm = async () => {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(name)}&api_key=${lastFmKey}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('Last.fm getinfo failed');
    const data = await res.json();
    if (!data.artist) throw new Error('Artist not found in Last.fm');

    return {
      source: 'lastfm',
      data: {
        listeners: data.artist.stats?.listeners || 0,
        playcount: data.artist.stats?.playcount || 0,
        similar: data.artist.similar?.artist?.map((a: any) => ({ name: a.name })) || [],
        tags: data.artist.tags?.tag?.map((t: any) => t.name) || [],
        bio: data.artist.bio?.summary || '',
        // image: data.artist.image?.find((i: any) => i.size === 'mega')?.['#text'] || data.artist.image?.find((i: any) => i.size === 'extralarge')?.['#text'] || null,
        label: data.artist.tags?.tag?.length ? data.artist.tags.tag[0].name : null // Using tags for some extra info since Last.fm doesn't have label for artists
      }
    };
  };

  try {
    if (yandexFirst) {
      try {
        const yData = await tryYandex();
        return res.json(yData);
      } catch (e) {
        if (lastFmEnabled) {
          const lData = await tryLastFm();
          return res.json(lData);
        }
        throw e;
      }
    } else if (lastFmEnabled) {
      try {
        const lData = await tryLastFm();
        return res.json(lData);
      } catch (e) {
        if (yandexEnabled) {
          const yData = await tryYandex();
          return res.json(yData);
        }
        throw e;
      }
    } else {
      throw new Error('No external APIs enabled');
    }
  } catch (error: any) {
    console.error('Failed to get artist stats:', error.message);
    return res.json({ source: 'local', error: error.message });
  }
});

app.get('/api/stats/album/:artist/:album', async (req, res) => {
  const { artist, album } = req.params;
  const { useLastFm, useYandex, lastFmKey, yandexToken } = req.query;
  
  const yandexEnabled = useYandex === 'true' && !!yandexToken;
  const lastFmEnabled = useLastFm === 'true' && !!lastFmKey;

  if (!yandexEnabled && !lastFmEnabled) {
    return res.json({ source: 'local' });
  }

  const tryYandex = async () => {
    const searchUrl = `https://api.music.yandex.net/search?text=${encodeURIComponent(artist + ' ' + album)}&type=album`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'Authorization': `OAuth ${yandexToken}` },
      signal: AbortSignal.timeout(4000)
    });
    if (!searchRes.ok) throw new Error('Yandex search failed');
    const searchData = await searchRes.json();
    const result = searchData.result?.albums?.results?.[0];
    if (!result) throw new Error('Album not found in Yandex');

    // Muted image extraction to fallback strictly to Navidrome
    return {
      source: 'yandex',
      data: {
        // image: result.coverUri ? `https://${result.coverUri.replace('%%', '600x600')}` : null,
        label: result.labels?.map((l: any) => l.name || l.id || l).join(', ') || null,
        recordCompany: result.recordCompany || result.labels?.[0]?.name || null
      }
    };
  };

  const tryLastFm = async () => {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getinfo&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}&api_key=${lastFmKey}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error('Last.fm getinfo failed');
    const data = await res.json();
    if (!data.album) throw new Error('Album not found in Last.fm');

    // Muted image extraction to fallback strictly to Navidrome
    return {
      source: 'lastfm',
      data: {
        // image: data.album.image?.find((i: any) => i.size === 'mega')?.['#text'] || data.album.image?.find((i: any) => i.size === 'extralarge')?.['#text'] || null,
        label: data.album.wiki?.summary ? null : null, // Last.fm album.getinfo doesn't typically provide label natively, but we ensure structure
        recordCompany: data.album.tags?.tag?.map((t: any) => t.name).join(', ') || null // Using tags as extra info if label is unavailable
      }
    };
  };

  try {
    if (yandexEnabled) {
      try {
        const yData = await tryYandex();
        return res.json(yData);
      } catch (e) {
        if (lastFmEnabled) {
          const lData = await tryLastFm();
          return res.json(lData);
        }
        throw e;
      }
    } else if (lastFmEnabled) {
      try {
        const lData = await tryLastFm();
        return res.json(lData);
      } catch (e) {
        throw e;
      }
    } else {
      throw new Error('No external APIs enabled');
    }
  } catch (error: any) {
    console.error('Failed to get album stats:', error.message);
    return res.json({ source: 'local', error: error.message });
  }
});

app.get(['/api/cover/:id', '/Holad/api/cover/:id'], async (req, res) => {
  const id = req.params.id as string;
  if (!id || id === 'undefined' || id === 'null' || !String(id).trim()) {
    return res.status(404).send('Cover art not found');
  }

  // Security: Prevent path traversal and enforce valid alphanumeric id format
  if (id.includes('..') || id.includes('/') || id.includes('\\') || !/^[a-zA-Z0-9_\-\.]+$/.test(id)) {
    return res.status(400).send('Invalid cover ID');
  }

  const rawSize = parseInt(req.query.size as string, 10);
  const size = (!isNaN(rawSize) && rawSize > 0) ? Math.min(1200, Math.max(50, rawSize)) : 300;

  const etag = `"${id}-${size}"`;
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end();
  }

  const { u, t, s, serverUrl } = req.query;

  // Direct fetch using client credentials if provided
  if (u && t && s) {
    let targetServer = navidromeAccounts[0]?.url || '';
    if (serverUrl) {
      const decodedUrl = decodeURIComponent(serverUrl as string).replace(/\/$/, '');
      if (isValidHttpUrl(decodedUrl) && !decodedUrl.includes('#') && !decodedUrl.includes('?')) {
        if (isTargetServerAllowed(decodedUrl)) {
          targetServer = decodedUrl;
        } else {
          return res.status(403).send('Forbidden: Proxy server is bound to authorized server URL');
        }
      }
    }
    if (targetServer) {
      try {
        const authParams = `u=${encodeURIComponent(u as string)}&t=${encodeURIComponent(t as string)}&s=${encodeURIComponent(s as string)}&v=1.16.1&c=StreamNavi&f=json`;
        const coverUrl = `${targetServer.replace(/\/$/, '')}/rest/getCoverArt?id=${encodeURIComponent(id)}&size=${size}&${authParams}`;
        const response = await fetch(coverUrl);
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('image/')) {
            res.set('Content-Type', contentType);
            res.set('ETag', etag);
            res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
            const arrayBuffer = await response.arrayBuffer();
            return res.send(Buffer.from(arrayBuffer));
          }
        }
      } catch (err) {
        console.warn(`[CoverArt] Direct fetch with client credentials failed:`, err);
      }
    }
  }

  await executeWithFailover(req, res,
    (account) => {
      const authParams = getSubsonicAuthParams(account);
      return `${account.url.replace(/\/$/, '')}/rest/getCoverArt?id=${encodeURIComponent(id)}&size=${size}&${authParams}`;
    },
    async (response) => {
      if (!response.ok) {
        return res.status(response.status).send('Cover art not found');
      }
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('image/')) {
        res.set('Content-Type', contentType);
        res.set('ETag', etag);
        res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      } else {
        res.status(404).send('Cover art not found');
      }
    }
  );
});

app.all(['/api/subsonic/:endpoint', '/api/subsonic/rest/:endpoint', '/Holad/api/subsonic/:endpoint', '/Holad/api/subsonic/rest/:endpoint'], async (req, res) => {
  const endpoint = req.params.endpoint as string;

  if (endpoint === 'getCoverArt') {
    const { id } = req.query;
    if (!id || id === 'undefined' || id === 'null' || !String(id).trim()) {
      return res.status(404).send('Cover art not found');
    }
  }

  const { u, t, s, serverUrl } = req.query;

  // If client provided its own credentials, proxy directly with authenticated whitelist
  if (u && t && s) {
    if (!ALLOWED_AUTH_ENDPOINTS.has(endpoint)) {
      console.warn(`Blocked unauthorized access attempt to endpoint: ${endpoint}`);
      return res.status(403).send('Forbidden: Endpoint not allowed');
    }
    let targetServer = navidromeAccounts[0]?.url || '';
    if (serverUrl) {
      const decodedUrl = decodeURIComponent(serverUrl as string).replace(/\/$/, '');
      if (isValidHttpUrl(decodedUrl) && !decodedUrl.includes('#') && !decodedUrl.includes('?')) {
        if (isTargetServerAllowed(decodedUrl)) {
          targetServer = decodedUrl;
        } else {
          return res.status(403).send('Forbidden: Proxy server is bound to authorized server URL');
        }
      }
    }
    if (targetServer) {
      const query = new URLSearchParams(req.query as any).toString();
      try {
        const fullUrl = `${targetServer.replace(/\/$/, '')}/rest/${endpoint}?${query}`;
        const response = await fetch(fullUrl);
        if (response.ok || response.status === 206) {
          const contentType = response.headers.get('content-type');
          if (contentType && (contentType.includes('image/') || contentType.includes('audio/'))) {
            res.set('Content-Type', contentType);
            if (contentType.includes('image/')) {
              res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
            }
            const arrayBuffer = await response.arrayBuffer();
            return res.send(Buffer.from(arrayBuffer));
          } else {
            const data = await response.json();
            return res.json(data);
          }
        }
      } catch (err) {
        console.warn(`[Subsonic Proxy] Direct fetch with client credentials failed:`, err);
      }
    }
  }
  
  if (!ALLOWED_GUEST_ENDPOINTS.has(endpoint)) {
    console.warn(`Blocked unauthorized access attempt to endpoint: ${endpoint}`);
    return res.status(403).send('Forbidden: Endpoint not allowed for guest access');
  }

  const query = new URLSearchParams(req.query as any).toString();
  
  await executeWithFailover(req, res, 
    (account) => {
      const authParams = getSubsonicAuthParams(account);
      return `${account.url.replace(/\/$/, '')}/rest/${endpoint}?${query}&${authParams}`;
    },
    async (response) => {
      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch from Subsonic');
      }
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('image/') || contentType.includes('audio/'))) {
        res.set('Content-Type', contentType);
        if (contentType.includes('image/')) {
          res.set('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=604800');
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
      } else {
        const data = await response.json();
        res.json(data);
      }
    }
  );
});

// Proxy audio stream to protect Navidrome credentials
app.get(['/api/stream/:id', '/Holad/api/stream/:id'], async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  
  const { id } = req.params;
  if (!id) {
    return res.status(400).send('Missing track ID');
  }

  const { u, t, s, v, c, f, format, estimateContentLength, serverUrl } = req.query;

  // If client provided its own credentials, bypass failover
  if (u && t && s) {
    try {
      const streamFormat = format ? `&format=${encodeURIComponent(format as string)}` : '&format=raw';
      const streamEstLen = estimateContentLength !== undefined ? `&estimateContentLength=${encodeURIComponent(estimateContentLength as string)}` : '&estimateContentLength=true';
      const authParams = `u=${u}&t=${t}&s=${s}&v=${v||'1.16.1'}&c=${c||'StreamNavi'}&f=${f||'json'}${streamFormat}${streamEstLen}`;
      let targetServer = navidromeAccounts[0]?.url || '';
      if (serverUrl) {
        const decodedUrl = decodeURIComponent(serverUrl as string);
        if (isValidHttpUrl(decodedUrl) && !decodedUrl.includes('#') && !decodedUrl.includes('?')) {
          const cleanUrl = decodedUrl.replace(/\/$/, '');
          if (isTargetServerAllowed(cleanUrl)) {
            targetServer = cleanUrl;
          } else {
            return res.status(403).send('Forbidden: Proxy server is bound to authorized server URL');
          }
        } else {
          return res.status(400).send('Invalid Server URL');
        }
      } else if (!targetServer && navidromeAccounts.length > 0) {
        targetServer = navidromeAccounts[0]!.url;
      }

      if (!targetServer) {
        return res.status(400).send('Missing target server URL for stream');
      }

      const safeId = encodeURIComponent(id as string);
      const streamUrl = `${targetServer.replace(/\/$/, '')}/rest/stream?id=${safeId}&${authParams}`;
      
      const headers: Record<string, string> = {};
      if (req.headers.range) headers['Range'] = req.headers.range;
      
      const response = await fetch(streamUrl, { headers });
      if (!response.ok && response.status !== 206) return res.status(response.status).send('Failed to fetch stream');
      
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      const contentLength1 = response.headers.get('content-length');
      if (contentLength1) res.set('Content-Length', contentLength1);
      if (response.headers.get('accept-ranges')) res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
      if (response.headers.get('content-range')) res.set('Content-Range', response.headers.get('content-range') || '');
      
      if (response.body) {
        const reader = response.body.getReader();
        let isClosed = false;
        req.on('close', () => {
          isClosed = true;
          try { reader.cancel(); } catch {}
        });
        const pump = async () => {
          try {
            while (!isClosed) {
              const { done, value } = await reader.read();
              if (done || isClosed) break;
              const canWrite = res.write(value);
              if (!canWrite) {
                await new Promise<void>(resolve => res.once('drain', resolve));
              }
            }
            if (!isClosed) res.end();
          } catch (err) {
            if (!isClosed) {
              console.error('Stream error:', err);
              res.end();
            }
          }
        };
        pump();
      } else {
        res.status(500).send('No response body');
      }
    } catch (err) {
      console.error(err);
      res.status(500).send('Stream error');
    }
    return;
  }

  // Use failover for guests
  await executeWithFailover(req, res,
    (account) => {
      const authParams = getSubsonicAuthParams(account);
      return `${account.url.replace(/\/$/, '')}/rest/stream?id=${id}&${authParams}&format=raw&estimateContentLength=true`;
    },
    async (response) => {
      if (!response.ok && response.status !== 206) {
        return res.status(response.status).send('Failed to fetch stream');
      }
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      const contentLength2 = response.headers.get('content-length');
      if (contentLength2) res.set('Content-Length', contentLength2);
      if (response.headers.get('accept-ranges')) res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
      if (response.headers.get('content-range')) res.set('Content-Range', response.headers.get('content-range') || '');
      
      if (response.body) {
        const reader = response.body.getReader();
        let isClosed = false;
        req.on('close', () => {
          isClosed = true;
          try { reader.cancel(); } catch {}
        });
        const pump = async () => {
          try {
            while (!isClosed) {
              const { done, value } = await reader.read();
              if (done || isClosed) break;
              const canWrite = res.write(value);
              if (!canWrite) {
                await new Promise<void>(resolve => res.once('drain', resolve));
              }
            }
            if (!isClosed) res.end();
          } catch (err) {
            if (!isClosed) {
              console.error('Stream error:', err);
              res.end();
            }
          }
        };
        pump();
      } else {
        res.status(500).send('No response body');
      }
    }
  );
});

type Role = 'host' | 'cohost' | 'listener';
type Participant = { id: string; name: string; role: Role; sessionId?: string | undefined; userId?: string | undefined; tag?: string | undefined };

interface Room {
  hostId: string;
  currentTrackId: string | null;
  currentTime: number;
  isPlaying: boolean;
  queue: any[];
  currentIndex: number;
  isAutoDjEnabled: boolean;
  stateVersion: number;
  participants: Participant[];
  isCrossfadeEnabled?: boolean;
  crossfadeDuration?: number;
  crossfadeCurve?: string;
  isGaplessEnabled?: boolean;
  repeatMode?: 'none' | 'all' | 'one';
  lastTrackChangeTime?: number;
  hostAudioMode?: 'speaker_dj' | 'synced_audio';
}

const rooms = new Map<string, Room>();

// Holad Connect
interface HoladDevice {
  id: string;
  name: string;
  socketId: string;
}

interface HoladRoom {
  activeDeviceId: string | null;
  devices: HoladDevice[];
  cachedState: any | null;
}

const holadRooms = new Map<string, HoladRoom>();

const broadcastParticipants = (roomId: string) => {
  const room = rooms.get(roomId);
  if (room) {
    const safeParticipants = room.participants.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      userId: p.userId,
      tag: p.tag
    }));
    io.to(roomId).emit('participantsUpdated', safeParticipants);
  }
};

const isHostOrCohost = (room: Room, socketId: string) => {
  if (room.hostId === socketId) return true;
  const p = room.participants.find(p => p.id === socketId);
  return p && p.role === 'cohost';
};

// --- Social & Presence State ---
interface PlayingTrackInfo {
  trackId?: string;
  id?: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
}

const onlineUsers = new Map<string, Set<string>>(); // userId -> Set<socketId>
const socketToUser = new Map<string, { userId: string; username: string; tag: string }>(); // socketId -> user info
const userPlayingTracks = new Map<string, PlayingTrackInfo | null>(); // userId -> track info

function notifyFriendsOnlineStatus(userId: string, isOnline: boolean) {
  try {
    const friends = database.getFriends(userId);
    const nowPlaying = userPlayingTracks.get(userId) || null;
    for (const friend of friends) {
      const friendSockets = onlineUsers.get(friend.user_id);
      if (friendSockets && friendSockets.size > 0) {
        for (const sId of friendSockets) {
          io.to(sId).emit('social_friendPresence', {
            userId,
            isOnline,
            nowPlaying: isOnline ? nowPlaying : null
          });
        }
      }
    }
  } catch (e) {
    console.error('Error notifying friends of online status:', e);
  }
}

function getFriendsWithPresence(userId: string) {
  const friends = database.getFriends(userId);
  return friends.map(f => ({
    ...f,
    isOnline: (onlineUsers.get(f.user_id)?.size ?? 0) > 0,
    nowPlaying: userPlayingTracks.get(f.user_id) || null
  }));
}

function registerUserPresence(socket: Socket, userId: string, username: string, tag: string) {
  const wasOnline = (onlineUsers.get(userId)?.size ?? 0) > 0;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId)!.add(socket.id);
  socketToUser.set(socket.id, { userId, username, tag });

  // Backfill userId & tag to room participants if already in a room
  for (const [rId, room] of rooms.entries()) {
    let updated = false;
    for (const p of room.participants) {
      if (p.id === socket.id && (!p.userId || !p.tag)) {
        p.userId = userId;
        p.tag = tag;
        updated = true;
      }
    }
    if (updated) {
      broadcastParticipants(rId);
    }
  }

  if (!wasOnline) {
    notifyFriendsOnlineStatus(userId, true);
  }
}

function unregisterUserPresence(socketId: string) {
  const user = socketToUser.get(socketId);
  if (!user) return;
  socketToUser.delete(socketId);
  const sockets = onlineUsers.get(user.userId);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(user.userId);
      userPlayingTracks.delete(user.userId);
      notifyFriendsOnlineStatus(user.userId, false);
    }
  }
}

async function verifySubsonicCredentials(user: string, token: string, salt: string, url: string): Promise<boolean> {
  const cacheKey = `${url.replace(/\/$/, '')}:${user}:${token}:${salt}`;
  const now = Date.now();
  if (validateAuthCache.has(cacheKey) && now - validateAuthCache.get(cacheKey)! < 5 * 60 * 1000) {
    return true;
  }

  const isWhitelisted = navidromeAccounts.some(a => a.user === user || a.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
  if (navidromeAccounts.length > 0 && !isWhitelisted && process.env.NODE_ENV !== 'test') {
    return false;
  }

  try {
    const resolvedUrl = url.replace('localhost', '127.0.0.1');
    const pingUrl = `${resolvedUrl.replace(/\/$/, '')}/rest/ping.view?u=${encodeURIComponent(user)}&t=${encodeURIComponent(token)}&s=${encodeURIComponent(salt)}&v=1.16.1&c=StreamNavi&f=json`;
    const response = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
    const json = await response.json().catch(() => null);
    if (response.ok && json?.['subsonic-response']?.status === 'ok') {
      validateAuthCache.set(cacheKey, now);
      try {
        database.saveNavidromeAccount({ url: url.replace(/\/$/, ''), user, token, salt });
        navidromeAccounts = database.getNavidromeAccounts();
      } catch (e) {}
      return true;
    }
    return false;
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      validateAuthCache.set(cacheKey, now);
      return true;
    }
    const dbAccount = navidromeAccounts.find(a => a.user === user && a.url.replace(/\/$/, '') === url.replace(/\/$/, ''));
    if (dbAccount && dbAccount.token && safeTimingCompare(dbAccount.token, token)) {
      validateAuthCache.set(cacheKey, now);
      return true;
    }
    return false;
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // --- Holad Connect Events ---
  socket.on('holad_joinRoom', async (data: { roomId: string, deviceId: string, deviceName: string, auth?: { user: string, salt: string, token: string, url: string }, demoSessionId?: string }) => {
    const { roomId, deviceId, deviceName, auth, demoSessionId } = data;
    
    if (!auth || typeof auth.user !== 'string' || typeof auth.salt !== 'string' || typeof auth.token !== 'string' || typeof auth.url !== 'string') {
      socket.emit('holad_authError', 'Missing or invalid authentication credentials');
      socket.disconnect();
      return;
    }

    const demoSession = demoManager.isEnabled()
      ? (demoSessionId ? demoManager.getSession(demoSessionId) : demoManager.getSessionByGuestUserId(roomId))
      : null;

    const isDemoMatch = !!demoSession && (roomId === demoSession.guestUserId || (auth.user === demoSession.account.user && roomId === demoSession.guestUserId));

    if (!isDemoMatch && auth.user !== roomId) {
      socket.emit('holad_authError', 'Room mismatch: You can only join your own room');
      socket.disconnect();
      return;
    }
    
    const isWhitelisted = navidromeAccounts.length === 0 || navidromeAccounts.some(a => a.user === auth.user || a.url.replace(/\/$/, '') === auth.url.replace(/\/$/, ''));
    if (!isWhitelisted) {
      socket.emit('holad_authError', 'Unauthorized server URL');
      socket.disconnect();
      return;
    }

    try {
      const resolvedUrl = auth.url.replace('localhost', '127.0.0.1');
      const pingUrl = `${resolvedUrl.replace(/\/$/, '')}/rest/ping.view?u=${encodeURIComponent(auth.user)}&t=${encodeURIComponent(auth.token)}&s=${encodeURIComponent(auth.salt)}&v=1.16.1&c=StreamNavi&f=json`;
      const response = await fetch(pingUrl, { signal: AbortSignal.timeout(5000) });
      const json = await response.json().catch(() => null);
      
      if (!response.ok || json?.['subsonic-response']?.status !== 'ok') {
        socket.emit('holad_authError', 'Invalid Subsonic credentials');
        socket.disconnect();
        return;
      }
    } catch (error: any) {
      const dbAccount = navidromeAccounts.find(a => a.user === auth.user && a.url.replace(/\/$/, '') === auth.url.replace(/\/$/, ''));
      if (!dbAccount || !dbAccount.token || !safeTimingCompare(dbAccount.token, auth.token)) {
        socket.emit('holad_authError', 'Failed to reach Subsonic server for validation');
        socket.disconnect();
        return;
      }
      console.warn(`[AUTH] Subsonic server unreachable directly from backend (${error?.message || error}), allowing socket connection for DB-verified user: ${auth.user}`);
    }

    // Register or refresh account in DB so covers and streams can immediately use it
    try {
      const cleanAuthUrl = auth.url.replace(/\/$/, '');
      database.saveNavidromeAccount({
        url: cleanAuthUrl,
        user: auth.user,
        token: auth.token,
        salt: auth.salt
      });
      navidromeAccounts = database.getNavidromeAccounts();
    } catch (e) {
      console.warn('[Holad] Failed to auto-save account on joinRoom:', e);
    }

    socket.join(`holad_${roomId}`);
    
    let room = holadRooms.get(roomId);
    if (!room) {
      room = { activeDeviceId: null, devices: [], cachedState: null };
      holadRooms.set(roomId, room);
    }
    
    room.devices = room.devices.filter(d => d.id !== deviceId);
    room.devices.push({ id: deviceId, name: deviceName, socketId: socket.id });
    
    if (!room.activeDeviceId) {
      room.activeDeviceId = deviceId;
    }
    
    (socket as any).holadData = { roomId, deviceId };
    
    // Register user presence for social features
    const socialUserId = demoSession ? demoSession.guestUserId : auth.user;
    const socialUsername = demoSession ? `Гость #${demoSession.slotId}` : auth.user;
    const userRecord = database.ensureUserWithTag(socialUserId, socialUsername);
    registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);
    
    io.to(`holad_${roomId}`).emit('holad_devices', { devices: room.devices, activeDeviceId: room.activeDeviceId });
    
    if (room.cachedState) {
      socket.emit('holad_syncState', room.cachedState);
    }

    // Sync current exclusions from DB to newly joined device
    try {
      const userExclusions = database.getExclusions(roomId);
      socket.emit('holad_remoteCommand', {
        type: 'exclusionsSynced',
        payload: userExclusions
      });
    } catch (e) {
      console.error('[Holad] Failed to sync exclusions on joinRoom:', e);
    }
  });

  socket.on('holad_setActiveDevice', (deviceId: string) => {
    const data = (socket as any).holadData;
    if (!data) return;
    const room = holadRooms.get(data.roomId);
    if (room) {
      room.activeDeviceId = deviceId;
      io.to(`holad_${data.roomId}`).emit('holad_devices', { devices: room.devices, activeDeviceId: room.activeDeviceId });
    }
  });

  socket.on('holad_updateState', (state: any) => {
    const data = (socket as any).holadData;
    if (!data) return;
    const room = holadRooms.get(data.roomId);
    if (room && room.activeDeviceId === data.deviceId) {
      room.cachedState = { ...room.cachedState, ...state };
      socket.to(`holad_${data.roomId}`).emit('holad_syncState', state);
    }
  });

  socket.on('holad_updateSettings', (settings: any) => {
    const data = (socket as any).holadData;
    if (!data) return;
    const room = holadRooms.get(data.roomId);
    if (room) {
      room.cachedState = { ...room.cachedState, ...settings };
      io.to(`holad_${data.roomId}`).emit('holad_syncSettings', settings);
    }
  });

  socket.on('holad_remoteCommand', (command: { type: string, payload?: any }) => {
    const data = (socket as any).holadData;
    if (!data) return;
    io.to(`holad_${data.roomId}`).emit('holad_remoteCommand', {
      ...command,
      fromUserId: data.roomId,
      fromDeviceId: data.deviceId
    });
  });
  socket.on('holad_syncTime', (data: any) => {
    const holadData = (socket as any).holadData;
    if (!holadData) return;
    socket.to(`holad_${holadData.roomId}`).emit('holad_syncTime', data);
  });
  // --- End Holad Connect Events ---

  // --- Social & Presence Events ---
  const handleSocialInit = async (payload: { user: string, token: string, salt: string, url: string, demoSessionId?: string }, callback?: Function) => {
    if (!payload || !payload.user || !payload.token || !payload.salt || !payload.url) {
      socket.emit('social_error', 'Missing authentication payload');
      if (typeof callback === 'function') callback({ error: 'Missing authentication payload' });
      return;
    }

    const isValid = await verifySubsonicCredentials(payload.user, payload.token, payload.salt, payload.url);
    if (!isValid) {
      socket.emit('social_authError', 'Invalid Subsonic credentials');
      if (typeof callback === 'function') callback({ error: 'Invalid Subsonic credentials' });
      return;
    }

    const demoSession = (demoManager.isEnabled() && payload.demoSessionId)
      ? demoManager.getSession(payload.demoSessionId)
      : null;

    const socialUserId = demoSession ? demoSession.guestUserId : payload.user;
    const socialUsername = demoSession ? `Гость #${demoSession.slotId}` : payload.user;

    const userRecord = database.ensureUserWithTag(socialUserId, socialUsername);
    registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);

    const friends = getFriendsWithPresence(userRecord.user_id);
    const pendingRequests = database.getPendingRequests(userRecord.user_id);

    const responseData = {
      user: userRecord,
      tag: userRecord.tag,
      username: userRecord.username,
      friends,
      pendingRequests
    };

    socket.emit('social_init_success', responseData);
    if (typeof callback === 'function') callback({ success: true, ...responseData });
  };

  socket.on('social_init', handleSocialInit);
  socket.on('social_auth', handleSocialInit);

  socket.on('social_getFriends', (callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Not authenticated');
      if (typeof callback === 'function') callback({ error: 'Not authenticated' });
      return;
    }
    const friends = getFriendsWithPresence(user.userId);
    socket.emit('social_friendsList', friends);
    if (typeof callback === 'function') callback(friends);
  });

  socket.on('social_sendFriendRequest', (data: { target: string }, callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Not authenticated');
      if (typeof callback === 'function') callback({ error: 'Not authenticated' });
      return;
    }
    if (!data || !data.target) {
      socket.emit('social_error', 'Missing target');
      if (typeof callback === 'function') callback({ error: 'Missing target' });
      return;
    }
    try {
      const targetUser = database.sendFriendRequest(user.userId, data.target);
      const targetSockets = onlineUsers.get(targetUser.user_id);
      if (targetSockets && targetSockets.size > 0) {
        for (const sId of targetSockets) {
          io.to(sId).emit('social_friendRequestReceived', {
            fromUserId: user.userId,
            fromUsername: user.username,
            fromTag: user.tag
          });
        }
      }
      socket.emit('social_friendRequestSent', { targetUser });
      if (typeof callback === 'function') callback({ success: true, targetUser });
    } catch (err: any) {
      socket.emit('social_error', err.message || 'Failed to send friend request');
      if (typeof callback === 'function') callback({ error: err.message || 'Failed to send friend request' });
    }
  });

  socket.on('social_respondFriendRequest', (data: { requesterId: string, action: 'accept' | 'reject' }, callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Not authenticated');
      if (typeof callback === 'function') callback({ error: 'Not authenticated' });
      return;
    }
    if (!data || !data.requesterId || !data.action) {
      socket.emit('social_error', 'Missing parameters');
      if (typeof callback === 'function') callback({ error: 'Missing parameters' });
      return;
    }
    try {
      database.respondFriendRequest(user.userId, data.requesterId, data.action);
      if (data.action === 'accept') {
        const requesterSockets = onlineUsers.get(data.requesterId);
        if (requesterSockets && requesterSockets.size > 0) {
          const requesterFriends = getFriendsWithPresence(data.requesterId);
          for (const sId of requesterSockets) {
            io.to(sId).emit('social_friendAccepted', {
              friend: {
                user_id: user.userId,
                username: user.username,
                tag: user.tag,
                isOnline: true,
                nowPlaying: userPlayingTracks.get(user.userId) || null
              }
            });
            io.to(sId).emit('social_friendsList', requesterFriends);
          }
        }
        const userSockets = onlineUsers.get(user.userId);
        if (userSockets) {
          const myFriends = getFriendsWithPresence(user.userId);
          for (const sId of userSockets) {
            io.to(sId).emit('social_friendsList', myFriends);
          }
        }
      }
      socket.emit('social_respondSuccess', { requesterId: data.requesterId, action: data.action });
      if (typeof callback === 'function') callback({ success: true, requesterId: data.requesterId, action: data.action });
    } catch (err: any) {
      socket.emit('social_error', err.message || 'Failed to respond to friend request');
      if (typeof callback === 'function') callback({ error: err.message || 'Failed to respond to friend request' });
    }
  });

  socket.on('social_removeFriend', (data: { friendId: string }, callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Not authenticated');
      if (typeof callback === 'function') callback({ error: 'Not authenticated' });
      return;
    }
    if (!data || !data.friendId) {
      socket.emit('social_error', 'Missing friendId');
      if (typeof callback === 'function') callback({ error: 'Missing friendId' });
      return;
    }
    try {
      database.removeFriend(user.userId, data.friendId);
      const userSockets = onlineUsers.get(user.userId);
      if (userSockets) {
        const myFriends = getFriendsWithPresence(user.userId);
        for (const sId of userSockets) {
          io.to(sId).emit('social_friendsList', myFriends);
        }
      }
      const friendSockets = onlineUsers.get(data.friendId);
      if (friendSockets) {
        const friendFriends = getFriendsWithPresence(data.friendId);
        for (const sId of friendSockets) {
          io.to(sId).emit('social_friendsList', friendFriends);
          io.to(sId).emit('social_friendRemoved', { friendId: user.userId });
        }
      }
      socket.emit('social_removeSuccess', { friendId: data.friendId });
      if (typeof callback === 'function') callback({ success: true, friendId: data.friendId });
    } catch (err: any) {
      socket.emit('social_error', err.message || 'Failed to remove friend');
      if (typeof callback === 'function') callback({ error: err.message || 'Failed to remove friend' });
    }
  });

  socket.on('social_searchUsers', (data: { query: string } | string, callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Authentication required to search users');
      if (typeof callback === 'function') callback({ error: 'Authentication required' });
      return;
    }
    const currentUserId = user.userId;
    try {
      const q = typeof data === 'string' ? data : data?.query || '';
      const rawResults = database.searchUsers(q, currentUserId);
      const results = rawResults.map(r => ({
        ...r,
        isOnline: onlineUsers.has(r.user_id) && (onlineUsers.get(r.user_id)?.size || 0) > 0
      }));
      socket.emit('social_searchResults', results);
      if (typeof callback === 'function') callback(results);
    } catch (err: any) {
      socket.emit('social_error', err.message || 'Search failed');
      if (typeof callback === 'function') callback({ error: err.message || 'Search failed' });
    }
  });

  socket.on('social_presenceUpdate', (data: { track?: any }) => {
    const user = socketToUser.get(socket.id);
    if (!user) return;

    let trackInfo: PlayingTrackInfo | null = null;
    if (data && data.track) {
      trackInfo = {
        trackId: data.track.id || data.track.trackId,
        id: data.track.id || data.track.trackId,
        title: data.track.title || '',
        artist: data.track.artist || '',
        album: data.track.album,
        coverArt: data.track.coverArt
      };
    }

    userPlayingTracks.set(user.userId, trackInfo);

    try {
      const friends = database.getFriends(user.userId);
      for (const friend of friends) {
        const friendSockets = onlineUsers.get(friend.user_id);
        if (friendSockets && friendSockets.size > 0) {
          for (const sId of friendSockets) {
            io.to(sId).emit('social_friendPresence', {
              userId: user.userId,
              isOnline: true,
              nowPlaying: trackInfo
            });
          }
        }
      }
    } catch (e) {
      console.error('Error broadcasting presence update:', e);
    }
  });

  socket.on('jam_inviteFriend', (data: { friendId: string, roomId: string, track?: any }, callback?: Function) => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('social_error', 'Not authenticated');
      if (typeof callback === 'function') callback({ error: 'Not authenticated' });
      return;
    }
    if (!data || !data.friendId || !data.roomId) {
      socket.emit('social_error', 'Missing friendId or roomId');
      if (typeof callback === 'function') callback({ error: 'Missing friendId or roomId' });
      return;
    }

    const friendSockets = onlineUsers.get(data.friendId);
    if (!friendSockets || friendSockets.size === 0) {
      socket.emit('social_error', 'Friend is offline');
      if (typeof callback === 'function') callback({ error: 'Friend is offline' });
      return;
    }

    for (const sId of friendSockets) {
      io.to(sId).emit('jam_inviteReceived', {
        fromUser: user.username,
        fromTag: user.tag,
        fromUserId: user.userId,
        roomId: data.roomId,
        track: data.track
      });
    }

    socket.emit('jam_inviteSent', { friendId: data.friendId, roomId: data.roomId });
    if (typeof callback === 'function') callback({ success: true, friendId: data.friendId, roomId: data.roomId });
  });

  socket.on('createRoom', (data: { name?: string; sessionId?: string; demoSessionId?: string } | string | undefined) => {
    let name: string | undefined;
    let sessionId: string | undefined;
    let demoSessionId: string | undefined;
    
    if (typeof data === 'object' && data !== null) {
      name = data.name;
      sessionId = data.sessionId;
      demoSessionId = (data as any).demoSessionId;
    } else if (typeof data === 'string') {
      name = data;
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randBytes = crypto.randomBytes(6);
    let roomId = '';
    for (let i = 0; i < 6; i++) {
      const b = randBytes[i] ?? 0;
      roomId += chars.charAt(b % chars.length);
    }
    socket.join(roomId);
    
    let hostUser = socketToUser.get(socket.id);
    if (demoManager.isEnabled()) {
      const dSession = demoSessionId ? demoManager.getSession(demoSessionId) : null;
      if (dSession) {
        const guestName = `Гость #${dSession.slotId}`;
        const userRecord = database.ensureUserWithTag(dSession.guestUserId, guestName);
        registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);
        hostUser = { userId: userRecord.user_id, username: userRecord.username, tag: userRecord.tag };
      }
    }

    const hostName = (demoManager.isEnabled() && hostUser?.username)
      ? hostUser.username 
      : (name || hostUser?.username || 'Host');

    const newRoom: Room = { 
      hostId: socket.id, 
      currentTrackId: null, 
      currentTime: 0, 
      isPlaying: false, 
      queue: [], 
      currentIndex: 0,
      isAutoDjEnabled: false,
      stateVersion: 0,
      participants: [{ id: socket.id, name: hostName, role: 'host', sessionId, userId: hostUser?.userId, tag: hostUser?.tag }],
      lastTrackChangeTime: 0
    };
    rooms.set(roomId, newRoom);
    
    socket.emit('roomCreated', { roomId, role: 'host' });
    broadcastParticipants(roomId);
    console.log(`Room ${roomId} created by host ${socket.id} (${hostName})`);
  });

  socket.on('joinRoom', async (data: { roomId: string; name?: string; sessionId?: string; auth?: any; demoSessionId?: string }) => {
    const { roomId, name, sessionId, auth, demoSessionId } = data;
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    const demoSession = (demoManager.isEnabled() && demoSessionId)
      ? demoManager.getSession(demoSessionId)
      : null;

    if (auth && typeof auth.user === 'string' && typeof auth.token === 'string' && typeof auth.salt === 'string' && typeof auth.url === 'string') {
      try {
        const isValid = await verifySubsonicCredentials(auth.user, auth.token, auth.salt, auth.url);
        if (isValid) {
          const socialUserId = demoSession ? demoSession.guestUserId : auth.user;
          const socialUsername = demoSession ? `Гость #${demoSession.slotId}` : auth.user;
          const userRecord = database.ensureUserWithTag(socialUserId, socialUsername);
          registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);
        }
      } catch (e) {
        // Ignore auth error for guest fallback
      }
    }

    socket.join(roomId);
    
    let currentUser = socketToUser.get(socket.id);
    if (demoSession && (!currentUser || currentUser.username !== `Гость #${demoSession.slotId}`)) {
      const guestName = `Гость #${demoSession.slotId}`;
      const userRecord = database.ensureUserWithTag(demoSession.guestUserId, guestName);
      registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);
      currentUser = { userId: userRecord.user_id, username: userRecord.username, tag: userRecord.tag };
    }

    const guestName = (demoSession && currentUser?.username) 
      ? currentUser.username 
      : (name || currentUser?.username || 'Guest');
    const existingIndex = room.participants.findIndex(p => p.sessionId === sessionId && sessionId !== undefined);
    if (existingIndex !== -1) {
      const oldId = room.participants[existingIndex]!.id;
      // Disconnect the old socket to prevent duplicates
      const oldSocket = io.sockets.sockets.get(oldId);
      if (oldSocket && oldId !== socket.id) {
        oldSocket.emit('error', 'Открыта новая вкладка с этим именем');
        oldSocket.leave(roomId);
      }
      room.participants[existingIndex]!.id = socket.id;
      if (currentUser?.userId) {
        room.participants[existingIndex]!.userId = currentUser.userId;
        room.participants[existingIndex]!.tag = currentUser.tag;
      }
      socket.emit('roomJoined', { roomId, role: room.participants[existingIndex]!.role, state: room });
    } else {
      room.participants.push({ id: socket.id, name: guestName, role: 'listener', sessionId, userId: currentUser?.userId, tag: currentUser?.tag });
      socket.emit('roomJoined', { roomId, role: 'listener', state: room });
    }
    
    broadcastParticipants(roomId);
    console.log(`Client ${socket.id} joined room ${roomId}`);
  });

  socket.on('leaveRoom', (roomId: string) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.hostId === socket.id) {
        // Host leaves -> destroy room
        io.to(roomId).emit('error', 'Сессия была завершена хостом');
        rooms.delete(roomId);
      } else {
        // Guest leaves
        socket.leave(roomId);
        const index = room.participants.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.participants.splice(index, 1);
          broadcastParticipants(roomId);
        }
      }
    }
  });

  socket.on('grantRole', (data: { roomId: string, userId: string, role: Role }) => {
    const room = rooms.get(data.roomId);
    if (room && room.hostId === socket.id) {
      const p = room.participants.find(p => p.id === data.userId);
      if (p && p.id !== room.hostId) {
        p.role = data.role;
        io.to(p.id).emit('roleChanged', data.role);
        broadcastParticipants(data.roomId);
      }
    }
  });

  socket.on('kickParticipant', (data: { roomId: string, userId: string }) => {
    const room = rooms.get(data.roomId);
    if (room && room.hostId === socket.id) {
      const index = room.participants.findIndex(p => p.id === data.userId);
      const participant = room.participants[index];
      if (participant && participant.id !== room.hostId) {
        const kickedId = participant.id;
        room.participants.splice(index, 1);
        io.to(kickedId).emit('kicked');
        broadcastParticipants(data.roomId);
      }
    }
  });

  // Sync events
  socket.on('syncState', (data: { roomId: string, trackId: string, currentTime: number, isPlaying: boolean, currentIndex: number, isAutoDjEnabled: boolean, version?: number, isCrossfadeEnabled?: boolean, crossfadeDuration?: number, crossfadeCurve?: string, isGaplessEnabled?: boolean, isSeek?: boolean, repeatMode?: 'none' | 'all' | 'one', hostAudioMode?: 'speaker_dj' | 'synced_audio' }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      // If version is provided, ensure it's not older than our stateVersion to prevent race condition reverting
      if (data.version !== undefined && data.version < room.stateVersion) {
        return; // Ignore outdated syncState
      }
      // Prevent out-of-sync clients from reverting the room's current track index
      if (data.currentIndex !== undefined && data.currentIndex !== room.currentIndex) {
        return;
      }
      if (data.isPlaying !== room.isPlaying || data.isSeek) {
        room.stateVersion += 1;
      }
      room.currentTrackId = data.trackId;
      room.currentTime = data.currentTime;
      room.isPlaying = data.isPlaying;
      room.currentIndex = data.currentIndex;
      if (data.hostAudioMode !== undefined) room.hostAudioMode = data.hostAudioMode;
      if (data.repeatMode !== undefined) room.repeatMode = data.repeatMode;
      if (data.isAutoDjEnabled !== undefined) {
        room.isAutoDjEnabled = data.isAutoDjEnabled;
      }
      if (data.isCrossfadeEnabled !== undefined) room.isCrossfadeEnabled = data.isCrossfadeEnabled;
      if (data.crossfadeDuration !== undefined) room.crossfadeDuration = data.crossfadeDuration;
      if (data.crossfadeCurve !== undefined) room.crossfadeCurve = data.crossfadeCurve;
      if (data.isGaplessEnabled !== undefined) room.isGaplessEnabled = data.isGaplessEnabled;
      // Broadcast to everyone else
      socket.to(data.roomId).emit('syncState', { ...room, version: room.stateVersion, isSeek: data.isSeek });
      // Send version back to sender so their next ping isn't outdated
      if (data.version !== undefined && room.stateVersion >= data.version) {
        socket.emit('syncStateVersion', room.stateVersion);
      }
    }
  });

  socket.on('syncQueue', (data: { roomId: string, queue: any[], currentIndex: number }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      const indexChanged = room.currentIndex !== data.currentIndex;
      room.stateVersion += 1; // Increment version on major change
      room.queue = data.queue;
      room.currentIndex = data.currentIndex;
      room.currentTrackId = data.queue[data.currentIndex]?.id || null;
      if (indexChanged) {
        room.lastTrackChangeTime = Date.now();
      }
      socket.to(data.roomId).emit('syncQueue', { queue: data.queue, currentIndex: data.currentIndex, version: room.stateVersion });
      // Tell sender about the new version
      socket.emit('syncStateVersion', room.stateVersion);
    }
  });

  socket.on('jam_trackEnded', (data: { roomId: string; trackId?: string; currentIndex: number; repeatMode?: 'none' | 'all' | 'one' }) => {
    const room = rooms.get(data.roomId);
    if (!room || !isHostOrCohost(room, socket.id)) return;

    // 1. Guard against duplicate / late end signals: client must match current room track index
    if (room.currentIndex !== data.currentIndex) {
      return; // Already advanced by another participant!
    }

    const currentTrack = room.queue[room.currentIndex];
    if (data.trackId && currentTrack && currentTrack.id !== data.trackId) {
      return; // Track ID mismatch
    }

    // 2. Debounce window: ignore another track change signal within 1500ms
    const now = Date.now();
    if (room.lastTrackChangeTime && (now - room.lastTrackChangeTime < 1500)) {
      return;
    }

    // 3. Determine next track index based on queue length and repeat mode
    const effectiveRepeat = data.repeatMode || room.repeatMode || 'none';
    let nextIndex = room.currentIndex + 1;

    if (effectiveRepeat === 'one') {
      nextIndex = room.currentIndex;
    } else if (nextIndex >= room.queue.length) {
      if (effectiveRepeat === 'all') {
        nextIndex = 0;
      } else {
        // Reached end of queue without repeat
        room.isPlaying = false;
        room.currentTime = 0;
        room.stateVersion += 1;
        io.to(data.roomId).emit('syncState', { ...room, version: room.stateVersion });
        return;
      }
    }

    // 4. Update room state atomically on the server
    room.currentIndex = nextIndex;
    room.currentTrackId = room.queue[nextIndex]?.id || null;
    room.currentTime = 0;
    room.lastTrackChangeTime = now;
    room.stateVersion += 1;

    // 5. Broadcast authoritative update to ALL participants in the room (including sender)
    io.to(data.roomId).emit('syncQueue', {
      queue: room.queue,
      currentIndex: room.currentIndex,
      version: room.stateVersion
    });
    io.to(data.roomId).emit('syncState', {
      ...room,
      version: room.stateVersion
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

    // Social presence disconnect
    unregisterUserPresence(socket.id);

    // Holad Connect disconnect
    const holadData = (socket as any).holadData;
    if (holadData) {
      const room = holadRooms.get(holadData.roomId);
      if (room) {
        room.devices = room.devices.filter(d => d.socketId !== socket.id);
        
        if (room.activeDeviceId === holadData.deviceId) {
          room.activeDeviceId = null;
        }
        
        io.to(`holad_${holadData.roomId}`).emit('holad_devices', { devices: room.devices, activeDeviceId: room.activeDeviceId });
        
        if (room.devices.length === 0) {
          holadRooms.delete(holadData.roomId);
        }
      }
    }

    // Jam disconnect
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        io.to(roomId).emit('error', 'Host disconnected');
        rooms.delete(roomId);
      } else {
        const index = room.participants.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.participants.splice(index, 1);
          broadcastParticipants(roomId);
        }
      }
    }
  });
});

// Serve frontend for production (when Nginx is not used)
const possibleClientPaths = [
  path.resolve(process.cwd(), '../client/dist'), // If run from server folder
  path.resolve(process.cwd(), 'client/dist'),    // If run from root folder
  path.resolve(process.cwd(), '../../client/dist') // If run from server/dist folder
];

let clientPath: string = possibleClientPaths[0] || path.resolve(process.cwd(), '../client/dist'); // Default fallback
for (const p of possibleClientPaths) {
  if (p && fs.existsSync(p)) {
    clientPath = p;
    break;
  }
}

// Safe favicon endpoint
const getFaviconPath = (): string | null => {
  const candidates = [
    path.join(clientPath, 'favicon.ico'),
    path.resolve(process.cwd(), '../client/public/favicon.ico'),
    path.resolve(process.cwd(), 'client/public/favicon.ico'),
    path.resolve(process.cwd(), '../../client/public/favicon.ico')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
};

const handleFavicon = (_req: express.Request, res: express.Response) => {
  const faviconFile = getFaviconPath();
  if (faviconFile) {
    res.setHeader('Content-Type', 'image/x-icon');
    res.sendFile(faviconFile);
  } else {
    res.status(404).end();
  }
};

app.get('/favicon.ico', handleFavicon);
app.get('/Holad/favicon.ico', handleFavicon);

if (fs.existsSync(clientPath)) {
  const basePath = process.env.BASE_PATH || '/Holad/';
  if (basePath === '/Holad/' || basePath.startsWith('/Holad')) {
    app.get(['/', '/index.html'], (_req, res) => {
      res.redirect('/Holad/');
    });
  }
  app.use(express.static(clientPath));
  app.use('/Holad', express.static(clientPath));
  
  // SPA fallback (using regex for Express 5 compatibility)
  app.get(/^(.*)$/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/Holad/api') || req.path.startsWith('/Holad/socket.io')) {
      return next();
    }
    // Exclude static assets with file extensions from SPA fallback so they return 404 instead of index.html
    if (path.extname(req.path)) {
      return next();
    }
    // Prevent caching of index.html so users don't get white screens after deployments
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`▶ Access Holad at: http://localhost:${PORT}/`);
});

export { app, httpServer, io, navidromeAccounts };
