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

export function getExclusions(userId: string): { excludedTrackIds: string[], excludedAlbumIds: string[] } {
  ensureUserExists(userId);
  const rows = db.prepare('SELECT entity_id, entity_type FROM exclusions WHERE user_id = ?').all(userId) as { entity_id: string; entity_type: string }[];
  const excludedTrackIds: string[] = [];
  const excludedAlbumIds: string[] = [];
  for (const row of rows) {
    if (row.entity_type === 'track') {
      excludedTrackIds.push(row.entity_id);
    } else if (row.entity_type === 'album') {
      excludedAlbumIds.push(row.entity_id);
    }
  }
  return { excludedTrackIds, excludedAlbumIds };
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

export function toggleExclusion(userId: string, entityId: string, entityType: 'track' | 'album'): boolean {
  ensureUserExists(userId);
  const existing = db.prepare('SELECT 1 FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').get(userId, entityId, entityType);
  if (existing) {
    db.prepare('DELETE FROM exclusions WHERE user_id = ? AND entity_id = ? AND entity_type = ?').run(userId, entityId, entityType);
    return false;
  } else {
    db.prepare('INSERT OR IGNORE INTO exclusions (user_id, entity_id, entity_type) VALUES (?, ?, ?)').run(userId, entityId, entityType);
    return true;
  }
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


