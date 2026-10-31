import { db, type SqliteDatabase } from './connection.js';

export function initSchema(database: SqliteDatabase = db): void {
  // Initialize tables
  database.exec(`
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
      theme TEXT,
      accent_color TEXT,
      custom_colors TEXT,
      language TEXT,
      profiles TEXT,
      updated_at INTEGER,
      FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playback_state (
      user_id TEXT PRIMARY KEY,
      song_id TEXT,
      current_song_id TEXT,
      position INTEGER,
      volume REAL,
      is_playing INTEGER DEFAULT 0,
      queue TEXT DEFAULT '[]',
      queue_version TEXT DEFAULT '',
      current_index INTEGER DEFAULT 0,
      is_shuffled INTEGER DEFAULT 0,
      repeat_mode TEXT DEFAULT 'off',
      updated_at INTEGER DEFAULT 0,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      song_id TEXT NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      album_id TEXT,
      artist_id TEXT,
      duration INTEGER,
      cover_art TEXT,
      played_at INTEGER NOT NULL,
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
      enabled INTEGER DEFAULT 1,
      updated_at INTEGER,
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
    const userColumns = database.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    const colNames = new Set(userColumns.map(c => c.name));
    if (!colNames.has('username')) {
      database.exec('ALTER TABLE users ADD COLUMN username TEXT');
    }
    if (!colNames.has('tag')) {
      database.exec('ALTER TABLE users ADD COLUMN tag TEXT');
    }
    if (!colNames.has('avatar_url')) {
      database.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    }
    if (!colNames.has('last_seen')) {
      database.exec('ALTER TABLE users ADD COLUMN last_seen DATETIME');
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_users_username_tag ON users(username, tag)');
  } catch (err) {
    console.error('Failed to migrate users table columns:', err);
  }

  // Safely migrate existing playlists table if description or songs column is missing
  try {
    const playlistColumns = database.prepare("PRAGMA table_info(playlists)").all() as { name: string }[];
    const playlistColNames = new Set(playlistColumns.map(c => c.name));
    if (!playlistColNames.has('description')) {
      database.exec('ALTER TABLE playlists ADD COLUMN description TEXT');
    }
    if (!playlistColNames.has('songs')) {
      database.exec('ALTER TABLE playlists ADD COLUMN songs TEXT');
    }
  } catch (err) {
    console.error('Failed to migrate playlists table columns:', err);
  }

  // Safely migrate existing exclusions table if metadata columns are missing
  try {
    const exclusionColumns = database.prepare("PRAGMA table_info(exclusions)").all() as { name: string }[];
    const exclColNames = new Set(exclusionColumns.map(c => c.name));
    if (!exclColNames.has('fingerprint')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN fingerprint TEXT');
    }
    if (!exclColNames.has('title')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN title TEXT');
    }
    if (!exclColNames.has('artist')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN artist TEXT');
    }
    if (!exclColNames.has('album')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN album TEXT');
    }
    if (!exclColNames.has('track_number')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN track_number INTEGER');
    }
    if (!exclColNames.has('duration')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN duration INTEGER');
    }
    if (!exclColNames.has('file_name')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN file_name TEXT');
    }
    if (!exclColNames.has('lyrics_hash')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN lyrics_hash TEXT');
    }
    if (!exclColNames.has('updated_at')) {
      database.exec('ALTER TABLE exclusions ADD COLUMN updated_at DATETIME');
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_exclusions_fingerprint ON exclusions(user_id, fingerprint)');
  } catch (err) {
    console.error('Failed to migrate exclusions table columns:', err);
  }

  // Safely migrate existing history table if metadata columns or indexes are missing
  try {
    const historyColumns = database.prepare("PRAGMA table_info(history)").all() as { name: string }[];
    const histColNames = new Set(historyColumns.map(c => c.name));
    if (!histColNames.has('title')) {
      database.exec('ALTER TABLE history ADD COLUMN title TEXT');
    }
    if (!histColNames.has('artist')) {
      database.exec('ALTER TABLE history ADD COLUMN artist TEXT');
    }
    if (!histColNames.has('album')) {
      database.exec('ALTER TABLE history ADD COLUMN album TEXT');
    }
    if (!histColNames.has('album_id')) {
      database.exec('ALTER TABLE history ADD COLUMN album_id TEXT');
    }
    if (!histColNames.has('artist_id')) {
      database.exec('ALTER TABLE history ADD COLUMN artist_id TEXT');
    }
    if (!histColNames.has('duration')) {
      database.exec('ALTER TABLE history ADD COLUMN duration INTEGER');
    }
    if (!histColNames.has('cover_art')) {
      database.exec('ALTER TABLE history ADD COLUMN cover_art TEXT');
    }
    database.exec('CREATE INDEX IF NOT EXISTS idx_history_user_played ON history(user_id, played_at DESC)');
  } catch (err) {
    console.error('Failed to migrate history table columns:', err);
  }

  // Safely migrate existing preferences table if columns are missing
  try {
    const prefColumns = database.prepare("PRAGMA table_info(preferences)").all() as { name: string }[];
    const prefColNames = new Set(prefColumns.map(c => c.name));
    if (!prefColNames.has('theme')) {
      database.exec('ALTER TABLE preferences ADD COLUMN theme TEXT');
    }
    if (!prefColNames.has('accent_color')) {
      database.exec('ALTER TABLE preferences ADD COLUMN accent_color TEXT');
    }
    if (!prefColNames.has('custom_colors')) {
      database.exec('ALTER TABLE preferences ADD COLUMN custom_colors TEXT');
    }
    if (!prefColNames.has('language')) {
      database.exec('ALTER TABLE preferences ADD COLUMN language TEXT');
    }
    if (!prefColNames.has('profiles')) {
      database.exec('ALTER TABLE preferences ADD COLUMN profiles TEXT');
    }
    if (!prefColNames.has('updated_at')) {
      database.exec('ALTER TABLE preferences ADD COLUMN updated_at INTEGER');
    }
  } catch (err) {
    console.error('Failed to migrate preferences table columns:', err);
  }

  // Safely migrate existing playback_state table if columns are missing
  try {
    const pbColumns = database.prepare("PRAGMA table_info(playback_state)").all() as { name: string }[];
    const pbColNames = new Set(pbColumns.map(c => c.name));
    if (!pbColNames.has('song_id')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN song_id TEXT');
    }
    if (!pbColNames.has('current_song_id')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN current_song_id TEXT');
    }
    if (!pbColNames.has('is_playing')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN is_playing INTEGER DEFAULT 0');
    }
    if (!pbColNames.has('queue')) {
      database.exec("ALTER TABLE playback_state ADD COLUMN queue TEXT DEFAULT '[]'");
    }
    if (!pbColNames.has('queue_version')) {
      database.exec("ALTER TABLE playback_state ADD COLUMN queue_version TEXT DEFAULT ''");
    }
    if (!pbColNames.has('current_index')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN current_index INTEGER DEFAULT 0');
    }
    if (!pbColNames.has('is_shuffled')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN is_shuffled INTEGER DEFAULT 0');
    }
    if (!pbColNames.has('repeat_mode')) {
      database.exec("ALTER TABLE playback_state ADD COLUMN repeat_mode TEXT DEFAULT 'off'");
    }
    if (!pbColNames.has('updated_at')) {
      database.exec('ALTER TABLE playback_state ADD COLUMN updated_at INTEGER DEFAULT 0');
    }
  } catch (err) {
    console.error('Failed to migrate playback_state table columns:', err);
  }

  // Safely migrate existing integrations table if columns are missing
  try {
    const intColumns = database.prepare("PRAGMA table_info(integrations)").all() as { name: string }[];
    const intColNames = new Set(intColumns.map(c => c.name));
    if (!intColNames.has('enabled')) {
      database.exec('ALTER TABLE integrations ADD COLUMN enabled INTEGER DEFAULT 1');
    }
    if (!intColNames.has('updated_at')) {
      database.exec('ALTER TABLE integrations ADD COLUMN updated_at INTEGER');
    }
  } catch (err) {
    console.error('Failed to migrate integrations table columns:', err);
  }
}

// Automatically init schema when this module is loaded
initSchema(db);
