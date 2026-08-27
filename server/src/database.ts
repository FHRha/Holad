import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../holad.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY
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
`);

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
