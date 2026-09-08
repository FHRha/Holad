import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  generateTrackFingerprint,
  generateAlbumFingerprint,
  extractFileName,
  parseTrackNumber,
  generateLyricsHash
} from './utils/trackFingerprint.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure dotenv is loaded before anything else
dotenv.config();
if (!process.env.NAVIDROME_URL && !process.env.NAVIDROME_ACCOUNTS) {
  dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
}

function resolveDbPath(): string {
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  // If running in development (src/) vs production (dist/src/)
  // We want the DB to live in server root (e.g. /opt/holad/server/holad.sqlite or E:\Code\Holad\server\holad.sqlite)
  let serverRoot = path.resolve(__dirname, '..');
  if (serverRoot.endsWith(path.sep + 'dist') || serverRoot.endsWith('/dist')) {
    serverRoot = path.resolve(serverRoot, '..');
  }
  const rootDbPath = path.join(serverRoot, 'holad.sqlite');
  
  // Also check if legacy DB was created in dist/
  const distDbPath = path.resolve(__dirname, '../holad.sqlite');
  if (!fs.existsSync(rootDbPath) && fs.existsSync(distDbPath)) {
    try {
      fs.copyFileSync(distDbPath, rootDbPath);
    } catch (e) {
      return distDbPath;
    }
  }
  
  return rootDbPath;
}

const DB_PATH = resolveDbPath();
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    tag TEXT,
    avatar_url TEXT,
    last_seen DATETIME
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'blocked')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, friend_id),
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY(friend_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS preferences (
    user_id TEXT PRIMARY KEY,
    language TEXT,
    accent_color TEXT,
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS playback_state (
    user_id TEXT PRIMARY KEY,
    current_song_id TEXT,
    position INTEGER,
    volume REAL,
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exclusions (
    user_id TEXT,
    entity_id TEXT,
    entity_type TEXT,
    fingerprint TEXT,
    title TEXT,
    artist TEXT,
    album TEXT,
    track_number INTEGER,
    duration INTEGER,
    file_name TEXT,
    lyrics_hash TEXT,
    updated_at DATETIME,
    PRIMARY KEY(user_id, entity_id, entity_type),
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS history (
    user_id TEXT,
    song_id TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    description TEXT,
    songs TEXT,
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id TEXT,
    track_id TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(playlist_id, track_id),
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS integrations (
    user_id TEXT,
    integration_name TEXT,
    encrypted_token TEXT,
    PRIMARY KEY(user_id, integration_name),
    FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS navidrome_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    user TEXT NOT NULL,
    token TEXT,
    salt TEXT,
    pass TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(url, user)
  );
`);

// Safely migrate existing users table if columns are missing
try {
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const colNames = new Set(userColumns.map(c => c.name));
  if (!colNames.has('username')) {
    db.exec('ALTER TABLE users ADD COLUMN username TEXT');
  }
  if (!colNames.has('tag')) {
    db.exec('ALTER TABLE users ADD COLUMN tag TEXT');
  }
  if (!colNames.has('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  }
  if (!colNames.has('last_seen')) {
    db.exec('ALTER TABLE users ADD COLUMN last_seen DATETIME');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username_tag ON users(username, tag)');
} catch (err) {
  console.error('Failed to migrate users table columns:', err);
}

// Safely migrate existing playlists table if description or songs column is missing
try {
  const playlistColumns = db.prepare("PRAGMA table_info(playlists)").all() as { name: string }[];
  const playlistColNames = new Set(playlistColumns.map(c => c.name));
  if (!playlistColNames.has('description')) {
    db.exec('ALTER TABLE playlists ADD COLUMN description TEXT');
  }
  if (!playlistColNames.has('songs')) {
    db.exec('ALTER TABLE playlists ADD COLUMN songs TEXT');
  }
} catch (err) {
  console.error('Failed to migrate playlists table columns:', err);
}

// Safely migrate existing exclusions table if metadata columns are missing
try {
  const exclusionColumns = db.prepare("PRAGMA table_info(exclusions)").all() as { name: string }[];
  const exclColNames = new Set(exclusionColumns.map(c => c.name));
  if (!exclColNames.has('fingerprint')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN fingerprint TEXT');
  }
  if (!exclColNames.has('title')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN title TEXT');
  }
  if (!exclColNames.has('artist')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN artist TEXT');
  }
  if (!exclColNames.has('album')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN album TEXT');
  }
  if (!exclColNames.has('track_number')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN track_number INTEGER');
  }
  if (!exclColNames.has('duration')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN duration INTEGER');
  }
  if (!exclColNames.has('file_name')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN file_name TEXT');
  }
  if (!exclColNames.has('lyrics_hash')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN lyrics_hash TEXT');
  }
  if (!exclColNames.has('updated_at')) {
    db.exec('ALTER TABLE exclusions ADD COLUMN updated_at DATETIME');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_exclusions_fingerprint ON exclusions(user_id, fingerprint)');
} catch (err) {
  console.error('Failed to migrate exclusions table columns:', err);
}

// Helper to generate user_id
export function generateUserId(login: string, passwordHash: string): string {
  return crypto.createHash('sha256').update(`${login}:${passwordHash}`).digest('hex');
}

// Encryption helpers for integration tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.createHash('sha256').update(String(process.env.ENCRYPTION_KEY)).digest('base64').substring(0, 32)
  : 'default_secret_key_needs_change_'; // 32 bytes fallback

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string | null {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error('Decryption failed', e);
    return null;
  }
}

export function safeEncrypt(val: string | null | undefined): string | null {
  if (!val) return null;
  const parts = val.split(':');
  const iv = parts[0];
  if (parts.length === 2 && iv && iv.length === 32 && /^[0-9a-f]+$/i.test(iv)) {
    return val;
  }
  return encrypt(val);
}

export function safeDecrypt(val: string | null | undefined): string | undefined {
  if (!val) return undefined;
  const parts = val.split(':');
  const iv = parts[0];
  if (parts.length === 2 && iv && iv.length === 32 && /^[0-9a-f]+$/i.test(iv)) {
    const decrypted = decrypt(val);
    if (decrypted !== null) return decrypted;
  }
  return val;
}

// Ensure user exists before inserting related data
function ensureUserExists(userId: string) {
  const stmt = db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)');
  stmt.run(userId);
}

// Sync API implementations
export function getSyncData(userId: string) {
  const preferences = db.prepare('SELECT language, accent_color FROM preferences WHERE user_id = ?').get(userId) || {};
  const playbackState = db.prepare('SELECT current_song_id, position, volume FROM playback_state WHERE user_id = ?').get(userId) || {};
  const exclusions = db.prepare('SELECT entity_id, entity_type FROM exclusions WHERE user_id = ?').all(userId) || [];
  const history = db.prepare('SELECT song_id, played_at FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100').all(userId) || [];
  const playlistsRaw = db.prepare('SELECT id, name, description FROM playlists WHERE user_id = ?').all(userId) as any[];
  const playlists = playlistsRaw.map(pl => {
    const tracks = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY added_at ASC').all(pl.id) as any[];
    return { ...pl, trackIds: tracks.map(t => t.track_id) };
  });
  
  const integrationsRaw = db.prepare('SELECT integration_name, encrypted_token FROM integrations WHERE user_id = ?').all(userId) as any[];
  const integrations = integrationsRaw.map(i => ({
    integration_name: i.integration_name,
    token: decrypt(i.encrypted_token)
  }));

  return { preferences, playbackState, exclusions, history, playlists, integrations };
}

export function saveSyncData(userId: string, data: any) {
  ensureUserExists(userId);
  const transaction = db.transaction(() => {
    if (data.preferences) {
      const stmt = db.prepare(`
        INSERT INTO preferences (user_id, language, accent_color) 
        VALUES (?, ?, ?) 
        ON CONFLICT(user_id) DO UPDATE SET 
          language = excluded.language, 
          accent_color = excluded.accent_color
      `);
      stmt.run(userId, data.preferences.language, data.preferences.accent_color);
    }

    if (data.playbackState) {
      const stmt = db.prepare(`
        INSERT INTO playback_state (user_id, current_song_id, position, volume) 
        VALUES (?, ?, ?, ?) 
        ON CONFLICT(user_id) DO UPDATE SET 
          current_song_id = excluded.current_song_id, 
          position = excluded.position, 
          volume = excluded.volume
      `);
      stmt.run(userId, data.playbackState.current_song_id, data.playbackState.position, data.playbackState.volume);
    }

    if (data.exclusions) {
      db.prepare('DELETE FROM exclusions WHERE user_id = ?').run(userId);
      const stmt = db.prepare('INSERT INTO exclusions (user_id, entity_id, entity_type) VALUES (?, ?, ?)');
      for (const excl of data.exclusions) {
        stmt.run(userId, excl.entity_id, excl.entity_type);
      }
    }

    if (data.history) {
      const stmt = db.prepare('INSERT INTO history (user_id, song_id, played_at) VALUES (?, ?, ?)');
      for (const item of data.history) {
        stmt.run(userId, item.song_id, item.played_at);
      }
    }

    if (data.playlists) {
      const stmt = db.prepare(`
        INSERT INTO playlists (id, user_id, name, description) 
        VALUES (?, ?, ?, ?) 
        ON CONFLICT(id) DO UPDATE SET 
          name = excluded.name, 
          description = excluded.description
      `);
      const trackStmt = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)');
      for (const pl of data.playlists) {
        stmt.run(pl.id, userId, pl.name, pl.description || '');
        if (pl.trackIds && Array.isArray(pl.trackIds)) {
          db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(pl.id);
          for (const trackId of pl.trackIds) {
            trackStmt.run(pl.id, trackId);
          }
        }
      }
    }

    if (data.integrations) {
      const stmt = db.prepare(`
        INSERT INTO integrations (user_id, integration_name, encrypted_token) 
        VALUES (?, ?, ?) 
        ON CONFLICT(user_id, integration_name) DO UPDATE SET 
          encrypted_token = excluded.encrypted_token
      `);
      for (const intg of data.integrations) {
        if (intg.token) {
          stmt.run(userId, intg.integration_name, encrypt(intg.token));
        }
      }
    }
  });

  transaction();
}

export function createPlaylist(userId: string, id: string, name: string, description: string) {
  ensureUserExists(userId);
  db.prepare('INSERT INTO playlists (id, user_id, name, description) VALUES (?, ?, ?, ?)').run(id, userId, name, description || '');
}

export function updatePlaylist(userId: string, id: string, name?: string, description?: string) {
  if (name !== undefined && description !== undefined) {
    db.prepare('UPDATE playlists SET name = ?, description = ? WHERE id = ? AND user_id = ?').run(name, description, id, userId);
  } else if (name !== undefined) {
    db.prepare('UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?').run(name, id, userId);
  } else if (description !== undefined) {
    db.prepare('UPDATE playlists SET description = ? WHERE id = ? AND user_id = ?').run(description, id, userId);
  }
}

export function deletePlaylist(userId: string, id: string) {
  db.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?').run(id, userId);
}

export function addTrackToPlaylist(userId: string, playlistId: string, trackId: string) {
  const pl = db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId);
  if (pl) {
    db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)').run(playlistId, trackId);
  }
}

export function removeTrackFromPlaylist(userId: string, playlistId: string, trackId: string) {
  const pl = db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId);
  if (pl) {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, trackId);
  }
}

export function deleteCustomPlaylist(id: string): boolean {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);
    const res = db.prepare('DELETE FROM playlists WHERE id = ?').run(id);
    return res.changes > 0;
  });
  return transaction();
}

export function saveCustomPlaylist(
  id: string,
  name: string,
  description: string,
  trackIds: string[],
  userId?: string,
  tracks?: any[]
): void {
  if (userId) {
    ensureUserExists(userId);
  }
  const songsJson = tracks !== undefined && tracks !== null
    ? JSON.stringify(tracks)
    : (Array.isArray(trackIds) ? JSON.stringify(trackIds.map(tid => ({ id: tid }))) : null);

  const transaction = db.transaction(() => {
    const upsertStmt = db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, songs) 
      VALUES (?, ?, ?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET 
        name = excluded.name, 
        description = excluded.description, 
        songs = excluded.songs,
        user_id = COALESCE(excluded.user_id, playlists.user_id)
    `);
    upsertStmt.run(id, userId || null, name, description, songsJson);

    db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id);

    const trackStmt = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)');
    for (const trackId of trackIds) {
      trackStmt.run(id, trackId);
    }
  });

  transaction();
}

export function getCustomPlaylist(id: string): { id: string; name: string; description: string; trackIds: string[]; tracks: any[] } | null {
  const pl = db.prepare('SELECT id, user_id, name, description, songs FROM playlists WHERE id = ?').get(id) as { id: string; user_id?: string; name: string; description?: string; songs?: string } | undefined;
  if (!pl) {
    return null;
  }
  const trackRows = db.prepare('SELECT track_id FROM playlist_tracks WHERE playlist_id = ? ORDER BY rowid ASC').all(id) as { track_id: string }[];

  let tracks: any[] | null = null;
  if (pl.songs) {
    try {
      const parsed = JSON.parse(pl.songs);
      if (Array.isArray(parsed)) {
        tracks = parsed;
      }
    } catch (e) {
      tracks = null;
    }
  }

  const trackIds = tracks && tracks.length > 0 
    ? tracks.map((t: any) => typeof t === 'string' ? t : t.id).filter(Boolean)
    : trackRows.map(t => t.track_id);

  if (!tracks) {
    tracks = trackIds.map(tId => ({ id: tId }));
  }

  return {
    id: pl.id,
    name: pl.name,
    description: pl.description || '',
    trackIds,
    tracks
  };
}

export interface ExclusionMeta {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number | string;
  duration?: number;
  fileName?: string;
  path?: string;
  lyrics?: string;
  lyricsHash?: string;
  fingerprint?: string;
}

export interface DetailedExclusion {
  entityId: string;
  entityType: 'track' | 'album';
  fingerprint: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  duration: number | null;
  fileName: string | null;
  lyricsHash: string | null;
  updatedAt: string | null;
}

export function getExclusions(userId: string): { 
  excludedTrackIds: string[]; 
  excludedAlbumIds: string[]; 
  excludedFingerprints: string[];
  details: DetailedExclusion[];
} {
  ensureUserExists(userId);
  const rows = db.prepare('SELECT entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at FROM exclusions WHERE user_id = ?').all(userId) as any[];
  const excludedTrackIds: string[] = [];
  const excludedAlbumIds: string[] = [];
  const excludedFingerprints: string[] = [];
  const details: DetailedExclusion[] = [];

  for (const row of rows) {
    if (row.entity_type === 'track') {
      excludedTrackIds.push(row.entity_id);
    } else if (row.entity_type === 'album') {
      excludedAlbumIds.push(row.entity_id);
    }
    if (row.fingerprint) {
      excludedFingerprints.push(row.fingerprint);
    }
    details.push({
      entityId: row.entity_id,
      entityType: row.entity_type,
      fingerprint: row.fingerprint || null,
      title: row.title || null,
      artist: row.artist || null,
      album: row.album || null,
      trackNumber: row.track_number || null,
      duration: row.duration || null,
      fileName: row.file_name || null,
      lyricsHash: row.lyrics_hash || null,
      updatedAt: row.updated_at || null,
    });
  }
  return { excludedTrackIds, excludedAlbumIds, excludedFingerprints, details };
}

export function setExclusions(userId: string, excludedTrackIds: string[], excludedAlbumIds: string[]): void {
  ensureUserExists(userId);
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM exclusions WHERE user_id = ?').run(userId);
    const stmt = db.prepare('INSERT OR IGNORE INTO exclusions (user_id, entity_id, entity_type) VALUES (?, ?, ?)');
    for (const trackId of excludedTrackIds) {
      stmt.run(userId, trackId, 'track');
    }
    for (const albumId of excludedAlbumIds) {
      stmt.run(userId, albumId, 'album');
    }
  });
  transaction();
}

export function toggleExclusion(
  userId: string, 
  entityId: string, 
  entityType: 'track' | 'album',
  meta?: ExclusionMeta
): boolean {
  ensureUserExists(userId);
  const existing = db.prepare('SELECT 1 FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').get(userId, entityId, entityType);
  if (existing) {
    db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').run(userId, entityId, entityType);
    return false;
  } else {
    let fp = meta?.fingerprint;
    if (!fp) {
      if (entityType === 'track') {
        fp = generateTrackFingerprint({
          id: entityId,
          title: meta?.title,
          artist: meta?.artist,
          album: meta?.album,
          track: meta?.trackNumber,
          duration: meta?.duration,
          path: meta?.path || meta?.fileName,
          lyrics: meta?.lyrics,
          lyricsHash: meta?.lyricsHash
        });
      } else {
        fp = generateAlbumFingerprint(meta?.artist, meta?.album || meta?.title);
      }
    }

    const title = meta?.title || null;
    const artist = meta?.artist || null;
    const album = meta?.album || null;
    const trackNumber = parseTrackNumber(meta?.trackNumber) ?? null;
    const duration = meta?.duration !== undefined && meta?.duration !== null ? Math.round(Number(meta.duration)) : null;
    const fileName = extractFileName(meta?.path || meta?.fileName) || null;
    const lyricsHash = meta?.lyricsHash || (meta?.lyrics ? generateLyricsHash(meta.lyrics) : null);

    db.prepare(`
      INSERT OR REPLACE INTO exclusions (
        user_id, entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(userId, entityId, entityType, fp || null, title, artist, album, trackNumber, duration, fileName, lyricsHash);
    return true;
  }
}

export function reconcileExclusion(
  userId: string, 
  oldEntityId: string, 
  newEntityId: string, 
  entityType: 'track' | 'album' = 'track',
  fingerprint?: string
): boolean {
  ensureUserExists(userId);
  let existing: any = null;
  if (oldEntityId) {
    existing = db.prepare('SELECT * FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').get(userId, oldEntityId, entityType) as any;
  }
  if (!existing && fingerprint) {
    existing = db.prepare('SELECT * FROM exclusions WHERE user_id = ? AND fingerprint = ? AND entity_type = ?').get(userId, fingerprint, entityType) as any;
  }
  if (!existing) {
    return false;
  }
  const prevId = existing.entity_id;
  db.transaction(() => {
    db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').run(userId, prevId, entityType);
    db.prepare(`
      INSERT OR REPLACE INTO exclusions (
        user_id, entity_id, entity_type, fingerprint, title, artist, album, track_number, duration, file_name, lyrics_hash, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      userId, 
      newEntityId, 
      entityType, 
      existing.fingerprint, 
      existing.title, 
      existing.artist, 
      existing.album, 
      existing.track_number, 
      existing.duration, 
      existing.file_name, 
      existing.lyrics_hash
    );
  })();
  return true;
}

export function reconcilePlaylistTracks(
  playlistId: string,
  replacements: { oldId: string; newId: string }[]
): boolean {
  const pl = db.prepare('SELECT id, songs FROM playlists WHERE id = ?').get(playlistId) as { id: string; songs?: string } | undefined;
  if (!pl || !Array.isArray(replacements) || replacements.length === 0) {
    return false;
  }

  const repMap = new Map<string, string>();
  for (const r of replacements) {
    if (r.oldId && r.newId && r.oldId !== r.newId) {
      repMap.set(r.oldId, r.newId);
    }
  }

  if (repMap.size === 0) return false;

  db.transaction(() => {
    const updateTrackStmt = db.prepare('UPDATE playlist_tracks SET track_id = ? WHERE playlist_id = ? AND track_id = ?');
    for (const [oldId, newId] of repMap.entries()) {
      try {
        updateTrackStmt.run(newId, playlistId, oldId);
      } catch (e) {
        db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(playlistId, oldId);
      }
    }

    if (pl.songs) {
      try {
        const parsed = JSON.parse(pl.songs);
        if (Array.isArray(parsed)) {
          let modified = false;
          for (const item of parsed) {
            if (item && item.id && repMap.has(item.id)) {
              item.id = repMap.get(item.id)!;
              modified = true;
            }
          }
          if (modified) {
            db.prepare('UPDATE playlists SET songs = ? WHERE id = ?').run(JSON.stringify(parsed), playlistId);
          }
        }
      } catch {}
    }
  })();

  return true;
}

// Social & Friends Types and Functions
export interface UserRecord {
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  last_seen: string | null;
}

export interface FriendRecord {
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  created_at: string;
}

export interface PendingRequest {
  id: number;
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  created_at: string;
}

export function ensureUserWithTag(userId: string, username: string, avatarUrl?: string): UserRecord {
  const finalUsername = username || userId;

  db.prepare('INSERT OR IGNORE INTO users (user_id, username) VALUES (?, ?)').run(userId, finalUsername);

  let user = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE user_id = ?').get(userId) as UserRecord;

  let currentTag = user.tag;
  if (!currentTag) {
    let attempts = 0;
    while (attempts < 10000) {
      const candidateTag = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const collision = db.prepare('SELECT 1 FROM users WHERE username = ? AND tag = ? AND user_id != ?').get(finalUsername, candidateTag, userId);
      if (!collision) {
        currentTag = candidateTag;
        break;
      }
      attempts++;
    }
    if (!currentTag) {
      currentTag = Math.floor(1000 + Math.random() * 9000).toString();
    }
  }

  const updatedAvatar = avatarUrl !== undefined ? avatarUrl : user.avatar_url;
  db.prepare(`
    UPDATE users 
    SET username = ?, tag = ?, avatar_url = ?, last_seen = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).run(finalUsername, currentTag, updatedAvatar, userId);

  return db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE user_id = ?').get(userId) as UserRecord;
}

export function searchUsers(query: string, currentUserId: string): Array<{ user_id: string; username: string; tag: string; avatar_url: string | null }> {
  if (!query || !query.trim()) return [];
  const trimmed = query.trim();
  const pattern = `%${trimmed}%`;
  return db.prepare(`
    SELECT user_id, COALESCE(username, user_id) AS username, tag, avatar_url 
    FROM users 
    WHERE user_id != ? 
      AND (LOWER(COALESCE(username, user_id)) LIKE LOWER(?) OR LOWER(COALESCE(username, user_id) || '#' || tag) LIKE LOWER(?))
    LIMIT 20
  `).all(currentUserId, pattern, pattern) as any[];
}

export function getFriends(userId: string): FriendRecord[] {
  return db.prepare(`
    SELECT 
      u.user_id, 
      COALESCE(u.username, u.user_id) AS username, 
      u.tag, 
      u.avatar_url, 
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END)
    WHERE (f.user_id = ? OR f.friend_id = ?) 
      AND f.status = 'accepted'
    ORDER BY u.username COLLATE NOCASE ASC
  `).all(userId, userId, userId) as FriendRecord[];
}

export function getPendingRequests(userId: string): { incoming: PendingRequest[]; outgoing: PendingRequest[] } {
  const incoming = db.prepare(`
    SELECT 
      f.id,
      u.user_id,
      COALESCE(u.username, u.user_id) AS username,
      u.tag,
      u.avatar_url,
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId) as PendingRequest[];

  const outgoing = db.prepare(`
    SELECT 
      f.id,
      u.user_id,
      COALESCE(u.username, u.user_id) AS username,
      u.tag,
      u.avatar_url,
      f.created_at
    FROM friends f
    JOIN users u ON u.user_id = f.friend_id
    WHERE f.user_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId) as PendingRequest[];

  return { incoming, outgoing };
}

export function sendFriendRequest(userId: string, targetTagOrName: string): UserRecord {
  if (!targetTagOrName || !targetTagOrName.trim()) {
    throw new Error('User not found');
  }
  const trimmed = targetTagOrName.trim();
  let targetUser: UserRecord | undefined;

  if (trimmed.includes('#')) {
    const hashIndex = trimmed.lastIndexOf('#');
    const uname = trimmed.substring(0, hashIndex).trim();
    const tag = trimmed.substring(hashIndex + 1).trim();
    targetUser = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE username = ? COLLATE NOCASE AND tag = ?').get(uname, tag) as UserRecord | undefined;
  } else {
    targetUser = db.prepare('SELECT user_id, username, tag, avatar_url, last_seen FROM users WHERE username = ? COLLATE NOCASE OR user_id = ?').get(trimmed, trimmed) as UserRecord | undefined;
  }

  if (!targetUser) {
    throw new Error('User not found');
  }

  if (targetUser.user_id === userId) {
    throw new Error('Cannot send friend request to yourself');
  }

  ensureUserExists(userId);

  const existing = db.prepare(`
    SELECT id, user_id, friend_id, status 
    FROM friends 
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).get(userId, targetUser.user_id, targetUser.user_id, userId) as any;

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error('Already friends');
    }
    if (existing.status === 'blocked') {
      throw new Error('User is blocked');
    }
    if (existing.status === 'pending') {
      if (existing.user_id === userId) {
        throw new Error('Friend request already sent');
      } else {
        db.prepare("UPDATE friends SET status = 'accepted' WHERE id = ?").run(existing.id);
        return targetUser;
      }
    }
  }

  db.prepare(`
    INSERT INTO friends (user_id, friend_id, status)
    VALUES (?, ?, 'pending')
  `).run(userId, targetUser.user_id);

  return targetUser;
}

export function respondFriendRequest(userId: string, requesterUserId: string, action: 'accept' | 'reject'): void {
  if (action === 'accept') {
    const res = db.prepare(`
      UPDATE friends 
      SET status = 'accepted' 
      WHERE user_id = ? AND friend_id = ? AND status = 'pending'
    `).run(requesterUserId, userId);
    if (res.changes === 0) {
      db.prepare(`
        UPDATE friends 
        SET status = 'accepted' 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `).run(userId, requesterUserId);
    }
  } else if (action === 'reject') {
    db.prepare(`
      DELETE FROM friends 
      WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) 
        AND status = 'pending'
    `).run(requesterUserId, userId, userId, requesterUserId);
  }
}

export function removeFriend(userId: string, friendId: string): void {
  db.prepare(`
    DELETE FROM friends 
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).run(userId, friendId, friendId, userId);
}

// Navidrome Accounts Storage and Migration
export interface NavidromeAccountRecord {
  url: string;
  user: string;
  pass?: string;
  token?: string;
  salt?: string;
}

export function getNavidromeAccounts(): NavidromeAccountRecord[] {
  try {
    const rows = db.prepare('SELECT url, user, token, salt, pass FROM navidrome_accounts ORDER BY id ASC').all() as any[];
    return rows.map(r => {
      const token = safeDecrypt(r.token);
      const salt = safeDecrypt(r.salt);
      const pass = safeDecrypt(r.pass);
      return {
        url: r.url,
        user: r.user,
        ...(token ? { token } : {}),
        ...(salt ? { salt } : {}),
        ...(pass ? { pass } : {})
      };
    });
  } catch (err) {
    console.error('Failed to get Navidrome accounts from DB:', err);
    return [];
  }
}

export function saveNavidromeAccount(account: NavidromeAccountRecord): void {
  if (!account.url || !account.user) return;
  const cleanUrl = account.url.trim().replace(/\/$/, '');
  const cleanUser = account.user.trim();
  
  const stmt = db.prepare(`
    INSERT INTO navidrome_accounts (url, user, token, salt, pass, updated_at)
    VALUES (@url, @user, @token, @salt, @pass, CURRENT_TIMESTAMP)
    ON CONFLICT(url, user) DO UPDATE SET
      token = excluded.token,
      salt = excluded.salt,
      pass = excluded.pass,
      updated_at = CURRENT_TIMESTAMP
  `);

  stmt.run({
    url: cleanUrl,
    user: cleanUser,
    token: safeEncrypt(account.token),
    salt: safeEncrypt(account.salt),
    pass: safeEncrypt(account.pass)
  });
}

export function deleteNavidromeAccount(user: string, url: string): void {
  const cleanUrl = url.trim().replace(/\/$/, '');
  const cleanUser = user.trim();
  db.prepare('DELETE FROM navidrome_accounts WHERE user = ? AND url = ?').run(cleanUser, cleanUrl);
}

export function migrateAccountsFromEnv(): { migratedCount: number } {
  let migratedCount = 0;
  const accountsToMigrate: NavidromeAccountRecord[] = [];

  try {
    if (process.env.NAVIDROME_ACCOUNTS) {
      const raw = process.env.NAVIDROME_ACCOUNTS.trim();
      let parsed: any[] = [];
      if (raw.startsWith('[') || raw.startsWith('{')) {
        parsed = JSON.parse(raw);
      } else {
        parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      }
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.url && item.user) {
            accountsToMigrate.push({
              url: item.url,
              user: item.user,
              pass: item.pass,
              token: item.token,
              salt: item.salt
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('[DB Migration] Failed to parse NAVIDROME_ACCOUNTS from env:', e);
  }

  if (process.env.NAVIDROME_URL) {
    accountsToMigrate.push({
      url: process.env.NAVIDROME_URL,
      user: process.env.NAVIDROME_USER || '',
      pass: process.env.NAVIDROME_PASS || ''
    });
  }

  if (accountsToMigrate.length > 0) {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO navidrome_accounts (url, user, token, salt, pass, updated_at)
      VALUES (@url, @user, @token, @salt, @pass, CURRENT_TIMESTAMP)
    `);
    const transaction = db.transaction(() => {
      for (const acc of accountsToMigrate) {
        if (!acc.url || !acc.user) continue;
        const res = insertStmt.run({
          url: acc.url.trim().replace(/\/$/, ''),
          user: acc.user.trim(),
          token: safeEncrypt(acc.token),
          salt: safeEncrypt(acc.salt),
          pass: safeEncrypt(acc.pass)
        });
        if (res.changes > 0) {
          migratedCount++;
        }
      }
    });
    transaction();
    if (migratedCount > 0) {
      console.log(`[DB Migration] Successfully migrated ${migratedCount} Navidrome account(s) from environment to SQLite.`);
    }
  }

  // Ensure any existing unencrypted legacy rows are encrypted at rest
  try {
    const isEncrypted = (val: string) => {
      const parts = val.split(':');
      const iv = parts[0];
      return parts.length === 2 && !!iv && iv.length === 32 && /^[0-9a-f]+$/i.test(iv);
    };
    const rows = db.prepare('SELECT id, token, salt, pass FROM navidrome_accounts').all() as any[];
    const updateStmt = db.prepare('UPDATE navidrome_accounts SET token = ?, salt = ?, pass = ? WHERE id = ?');
    for (const row of rows) {
      let changed = false;
      let encToken = row.token;
      let encSalt = row.salt;
      let encPass = row.pass;
      if (row.token && !isEncrypted(row.token)) {
        encToken = encrypt(row.token);
        changed = true;
      }
      if (row.salt && !isEncrypted(row.salt)) {
        encSalt = encrypt(row.salt);
        changed = true;
      }
      if (row.pass && !isEncrypted(row.pass)) {
        encPass = encrypt(row.pass);
        changed = true;
      }
      if (changed) {
        updateStmt.run(encToken, encSalt, encPass, row.id);
      }
    }
  } catch (err) {
    console.error('[DB Migration] Failed to re-encrypt legacy navidrome accounts:', err);
  }

  return { migratedCount };
}

// Automatically migrate environment variables on boot if present
try {
  migrateAccountsFromEnv();
} catch (err) {
  console.error('[DB Migration] Error during initial environment migration:', err);
}



