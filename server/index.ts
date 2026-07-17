import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import md5 from 'md5';
import fs from 'fs';

import path from 'path';

dotenv.config();
// Fallback to root .env if running from server directory
if (!process.env.NAVIDROME_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // For development. In production, restrict this.
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e6 // 1 MB limit to prevent OOM DoS
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const PORT = process.env.PORT || 4000;

interface NavidromeAccount {
  url: string;
  user: string;
  pass?: string;
  token?: string;
  salt?: string;
}

let navidromeAccounts: NavidromeAccount[] = [];

try {
  if (process.env.NAVIDROME_ACCOUNTS) {
    const raw = process.env.NAVIDROME_ACCOUNTS;
    if (raw.trim().startsWith('[') || raw.trim().startsWith('{')) {
      navidromeAccounts = JSON.parse(raw);
    } else {
      navidromeAccounts = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
  }
} catch (e) {
  console.error('Failed to parse NAVIDROME_ACCOUNTS');
}

// Fallback for older configs
if (navidromeAccounts.length === 0 && process.env.NAVIDROME_URL) {
  navidromeAccounts.push({
    url: process.env.NAVIDROME_URL,
    user: process.env.NAVIDROME_USER || '',
    pass: process.env.NAVIDROME_PASS || ''
  });
}

function saveAccountsToEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const fallbackEnvPath = path.resolve(process.cwd(), '../.env');
  const targetPath = fs.existsSync(envPath) ? envPath : (fs.existsSync(fallbackEnvPath) ? fallbackEnvPath : envPath);

  try {
    let envContent = '';
    if (fs.existsSync(targetPath)) {
      envContent = fs.readFileSync(targetPath, 'utf8');
    }
    
    const accountsStr = Buffer.from(JSON.stringify(navidromeAccounts)).toString('base64');
    
    if (/^NAVIDROME_ACCOUNTS=/m.test(envContent)) {
      envContent = envContent.replace(/^NAVIDROME_ACCOUNTS=.*/gm, `NAVIDROME_ACCOUNTS='${accountsStr}'`);
    } else {
      envContent += `\nNAVIDROME_ACCOUNTS='${accountsStr}'\n`;
    }
    
    fs.writeFileSync(targetPath, envContent);
  } catch (error) {
    console.error('Failed to write to .env:', error);
  }
}

function getSubsonicAuthParams(account: NavidromeAccount) {
  if (account.token && account.salt) {
    return `u=${encodeURIComponent(account.user)}&t=${account.token}&s=${account.salt}&v=1.16.1&c=StreamNavi&f=json`;
  }
  const salt = Math.random().toString(36).substring(2, 15);
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

function isValidHttpUrl(string: string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

app.post('/api/save-credentials', async (req, res) => {
  const { url, username, token, salt } = req.body;
  if (!url || !username || !token || !salt) return res.status(400).send('Missing fields');
  if (!isValidHttpUrl(url)) return res.status(400).send('Invalid URL');
  
  if (navidromeAccounts.length > 0 && navidromeAccounts[0]!.url !== url) {
    return res.status(403).send('Proxy server is already bound to a different Navidrome URL.');
  }
  
  const authParams = `u=${encodeURIComponent(username)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
  
  try {
    const pingUrl = `${url}/rest/ping.view?${authParams}`;
    const response = await fetch(pingUrl);
    const data = await response.json();
    if (data['subsonic-response']?.status !== 'ok') {
       return res.status(401).send('Invalid credentials');
    }
    
    const existing = navidromeAccounts.find(a => a.user === username && a.url === url);
    if (!existing) {
      navidromeAccounts.unshift({ url, user: username, token, salt });
      if (navidromeAccounts.length > 5) {
        navidromeAccounts.pop();
      }
      saveAccountsToEnv();
    }
    res.send({ status: 'ok' });
  } catch (error) {
    res.status(500).send('Error verifying credentials');
  }
});

async function executeWithFailover(req: express.Request, res: express.Response, buildUrlFn: (account: NavidromeAccount) => string, handleResponseFn: (response: Response) => Promise<any>) {
  if (navidromeAccounts.length === 0) {
    return res.status(503).send('No available Navidrome accounts for guest access.');
  }

  const accountsToTry = [...navidromeAccounts];
  for (const account of accountsToTry) {
    try {
      const url = buildUrlFn(account);
      const headers: Record<string, string> = {};
      if (req.headers.range) headers['Range'] = req.headers.range;
      
      const response = await fetch(url, { headers });
      
      if (response.status === 401 || response.status === 403) {
        console.warn(`Account ${account.user} failed auth. Removing.`);
        navidromeAccounts = navidromeAccounts.filter(a => a.user !== account.user || a.url !== account.url);
        saveAccountsToEnv();
        continue;
      }
      
      if (response.ok || response.status === 206) {
         const contentType = response.headers.get('content-type') || '';
         if (contentType.includes('json')) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            if (data['subsonic-response']?.status === 'failed' && data['subsonic-response']?.error?.code === 40) {
               console.warn(`Account ${account.user} failed auth (code 40). Removing.`);
               navidromeAccounts = navidromeAccounts.filter(a => a.user !== account.user || a.url !== account.url);
               saveAccountsToEnv();
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

app.post('/api/holad/history/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const history = req.body;
  if (!Array.isArray(history)) {
    return res.status(400).send('Expected JSON array');
  }
  holadHistoryCache.set(roomId, history);
  io.to(`holad_${roomId}`).emit('holad_remoteCommand', { type: 'historyAvailable' });
  
  // Cleanup after 2 minutes
  setTimeout(() => {
    holadHistoryCache.delete(roomId);
  }, 2 * 60 * 1000);
  
  res.status(200).send('OK');
});

app.get('/api/holad/history/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const history = holadHistoryCache.get(roomId);
  if (history) {
    res.json(history);
  } else {
    res.status(404).send('Not found or expired');
  }
});

app.get('/api/subsonic/:endpoint', async (req, res) => {
  const { endpoint } = req.params;
  
  if (!ALLOWED_GUEST_ENDPOINTS.has(endpoint)) {
    console.warn(`Blocked unauthorized access attempt to endpoint: ${endpoint}`);
    return res.status(403).send('Forbidden: Endpoint not allowed for guest access');
  }
  
  const query = new URLSearchParams(req.query as any).toString();
  
  await executeWithFailover(req, res, 
    (account) => {
      const authParams = getSubsonicAuthParams(account);
      return `${account.url}/rest/${endpoint}?${query}&${authParams}`;
    },
    async (response) => {
      if (!response.ok) {
        return res.status(response.status).send('Failed to fetch from Subsonic');
      }
      const contentType = response.headers.get('content-type');
      if (contentType && (contentType.includes('image/') || contentType.includes('audio/'))) {
        res.set('Content-Type', contentType);
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
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).send('Missing track ID');
  }

  const { u, t, s, v, c, f, serverUrl } = req.query;

  // If client provided its own credentials, bypass failover
  if (u && t && s) {
    try {
      const authParams = `u=${u}&t=${t}&s=${s}&v=${v||'1.16.1'}&c=${c||'StreamNavi'}&f=${f||'json'}`;
      let targetServer = navidromeAccounts[0]?.url || '';
      if (serverUrl) {
        const decodedUrl = decodeURIComponent(serverUrl as string);
        if (isValidHttpUrl(decodedUrl) && !decodedUrl.includes('#') && !decodedUrl.includes('?')) {
          if (navidromeAccounts.some(a => a.url === decodedUrl)) {
            targetServer = decodedUrl;
          } else {
            return res.status(403).send('Target server is not in the allowed proxy pool.');
          }
        } else {
          return res.status(400).send('Invalid Server URL');
        }
      }
      const safeId = encodeURIComponent(id as string);
      const streamUrl = `${targetServer}/rest/stream?id=${safeId}&${authParams}`;
      
      const headers: Record<string, string> = {};
      if (req.headers.range) headers['Range'] = req.headers.range;
      
      const response = await fetch(streamUrl, { headers });
      if (!response.ok && response.status !== 206) return res.status(response.status).send('Failed to fetch stream');
      
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      res.set('Content-Length', response.headers.get('content-length') || '');
      if (response.headers.get('accept-ranges')) res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
      
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(err => { console.error('Stream error:', err); res.end(); });
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
      return `${account.url}/rest/stream?id=${id}&${authParams}`;
    },
    async (response) => {
      if (!response.ok && response.status !== 206) {
        return res.status(response.status).send('Failed to fetch stream');
      }
      res.status(response.status);
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      res.set('Content-Length', response.headers.get('content-length') || '');
      if (response.headers.get('accept-ranges')) res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
      
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(err => { console.error('Stream error:', err); res.end(); });
      } else {
        res.status(500).send('No response body');
      }
    }
  );
});

type Role = 'host' | 'cohost' | 'listener';
type Participant = { id: string; name: string; role: Role; sessionId?: string | undefined };

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
      role: p.role
    }));
    io.to(roomId).emit('participantsUpdated', safeParticipants);
  }
};

const isHostOrCohost = (room: Room, socketId: string) => {
  if (room.hostId === socketId) return true;
  const p = room.participants.find(p => p.id === socketId);
  return p && p.role === 'cohost';
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // --- Holad Connect Events ---
  socket.on('holad_joinRoom', (data: { roomId: string, deviceId: string, deviceName: string }) => {
    const { roomId, deviceId, deviceName } = data;
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
    
    io.to(`holad_${roomId}`).emit('holad_devices', { devices: room.devices, activeDeviceId: room.activeDeviceId });
    
    if (room.cachedState) {
      socket.emit('holad_syncState', room.cachedState);
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
    io.to(`holad_${data.roomId}`).emit('holad_remoteCommand', command);
  });
  socket.on('holad_syncTime', (data: any) => {
    const holadData = (socket as any).holadData;
    if (!holadData) return;
    socket.to(`holad_${holadData.roomId}`).emit('holad_syncTime', data);
  });
  // --- End Holad Connect Events ---

  socket.on('createRoom', (data: { name?: string; sessionId?: string } | string | undefined) => {
    let name: string | undefined;
    let sessionId: string | undefined;
    
    if (typeof data === 'object' && data !== null) {
      name = data.name;
      sessionId = data.sessionId;
    } else if (typeof data === 'string') {
      name = data;
    }

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    
    const hostName = name || 'Host';
    const newRoom: Room = { 
      hostId: socket.id, 
      currentTrackId: null, 
      currentTime: 0, 
      isPlaying: false, 
      queue: [], 
      currentIndex: 0,
      isAutoDjEnabled: false,
      stateVersion: 0,
      participants: [{ id: socket.id, name: hostName, role: 'host', sessionId }]
    };
    rooms.set(roomId, newRoom);
    
    socket.emit('roomCreated', { roomId, role: 'host' });
    broadcastParticipants(roomId);
    console.log(`Room ${roomId} created by host ${socket.id}`);
  });

  socket.on('joinRoom', (data: { roomId: string; name: string; sessionId?: string }) => {
    const { roomId, name, sessionId } = data;
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    socket.join(roomId);
    
    const guestName = name || 'Guest';
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
      socket.emit('roomJoined', { roomId, role: room.participants[existingIndex]!.role, state: room });
    } else {
      room.participants.push({ id: socket.id, name: guestName, role: 'listener', sessionId });
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
  socket.on('syncState', (data: { roomId: string, trackId: string, currentTime: number, isPlaying: boolean, currentIndex: number, isAutoDjEnabled: boolean, version?: number }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      // If version is provided, ensure it's not older than our stateVersion to prevent race condition reverting
      if (data.version !== undefined && data.version < room.stateVersion) {
        return; // Ignore outdated syncState
      }
      if (data.isPlaying !== room.isPlaying) {
        room.stateVersion += 1;
      }
      room.currentTrackId = data.trackId;
      room.currentTime = data.currentTime;
      room.isPlaying = data.isPlaying;
      room.currentIndex = data.currentIndex;
      if (data.isAutoDjEnabled !== undefined) {
        room.isAutoDjEnabled = data.isAutoDjEnabled;
      }
      // Broadcast to everyone else
      socket.to(data.roomId).emit('syncState', { ...room, version: room.stateVersion });
      // Send version back to sender so their next ping isn't outdated
      if (data.version !== undefined && room.stateVersion > data.version) {
        socket.emit('syncStateVersion', room.stateVersion);
      }
    }
  });

  socket.on('syncQueue', (data: { roomId: string, queue: any[], currentIndex: number }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      room.stateVersion += 1; // Increment version on major change
      room.queue = data.queue;
      room.currentIndex = data.currentIndex;
      socket.to(data.roomId).emit('syncQueue', { queue: data.queue, currentIndex: data.currentIndex, version: room.stateVersion });
      // Tell sender about the new version
      socket.emit('syncStateVersion', room.stateVersion);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);

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
const clientPath = path.resolve(process.cwd(), '../client/dist');
if (fs.existsSync(clientPath)) {
  app.use(express.static(clientPath));
  
  // SPA fallback (using regex for Express 5 compatibility)
  app.get(/^(.*)$/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`▶ Access Holad at: http://localhost:${PORT}/`);
});
