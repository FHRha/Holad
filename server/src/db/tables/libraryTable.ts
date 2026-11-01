import { db } from '../connection.js';
import type {
  CachedTrack,
  CachedAlbum,
  CachedArtist,
  LibrarySyncState,
  LibraryQueryOptions,
} from '../types.js';

const ALLOWED_TRACK_SORTS: Record<string, string> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  duration: 'duration',
  year: 'year',
  created_at: 'created_at',
  track_number: 'track_number',
  disc_number: 'disc_number',
};

const ALLOWED_ALBUM_SORTS: Record<string, string> = {
  name: 'name',
  artist: 'artist',
  year: 'year',
  song_count: 'song_count',
  duration: 'duration',
  created_at: 'created_at',
};

const ALLOWED_ARTIST_SORTS: Record<string, string> = {
  name: 'name',
  album_count: 'album_count',
  starred: 'starred',
};

function getSafeOrder(order?: string): 'ASC' | 'DESC' {
  return order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
}

function sanitizeFtsQuery(query: string): string {
  if (!query) return '';
  const cleaned = query.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (!cleaned) return '';
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"*`).join(' ');
}

export function upsertTracksBatch(tracks: CachedTrack[]): void {
  if (!Array.isArray(tracks) || tracks.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO cached_tracks (
      id, user_id, title, artist, artist_id, album, album_id,
      duration, track_number, disc_number, year, genre,
      cover_art, bit_rate, suffix, created_at
    ) VALUES (
      @id, @user_id, @title, @artist, @artist_id, @album, @album_id,
      @duration, @track_number, @disc_number, @year, @genre,
      @cover_art, @bit_rate, @suffix, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      title = excluded.title,
      artist = excluded.artist,
      artist_id = excluded.artist_id,
      album = excluded.album,
      album_id = excluded.album_id,
      duration = excluded.duration,
      track_number = excluded.track_number,
      disc_number = excluded.disc_number,
      year = excluded.year,
      genre = excluded.genre,
      cover_art = excluded.cover_art,
      bit_rate = excluded.bit_rate,
      suffix = excluded.suffix,
      created_at = excluded.created_at
  `);

  const tx = db.transaction((items: CachedTrack[]) => {
    for (const item of items) {
      if (!item || !item.id || !item.title) continue;
      stmt.run({
        id: item.id,
        user_id: item.user_id || null,
        title: item.title,
        artist: item.artist || '',
        artist_id: item.artist_id || null,
        album: item.album || '',
        album_id: item.album_id || null,
        duration: typeof item.duration === 'number' ? Math.round(item.duration) : 0,
        track_number: typeof item.track_number === 'number' ? item.track_number : null,
        disc_number: typeof item.disc_number === 'number' ? item.disc_number : 1,
        year: typeof item.year === 'number' ? item.year : null,
        genre: item.genre || null,
        cover_art: item.cover_art || null,
        bit_rate: typeof item.bit_rate === 'number' ? item.bit_rate : null,
        suffix: item.suffix || null,
        created_at: item.created_at || Date.now(),
      });
    }
  });

  tx(tracks);
}

export function upsertAlbumsBatch(albums: CachedAlbum[]): void {
  if (!Array.isArray(albums) || albums.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO cached_albums (
      id, user_id, name, artist, artist_id, cover_art,
      song_count, duration, year, genre, created_at
    ) VALUES (
      @id, @user_id, @name, @artist, @artist_id, @cover_art,
      @song_count, @duration, @year, @genre, @created_at
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      artist = excluded.artist,
      artist_id = excluded.artist_id,
      cover_art = excluded.cover_art,
      song_count = excluded.song_count,
      duration = excluded.duration,
      year = excluded.year,
      genre = excluded.genre,
      created_at = excluded.created_at
  `);

  const tx = db.transaction((items: CachedAlbum[]) => {
    for (const item of items) {
      if (!item || !item.id || !item.name) continue;
      stmt.run({
        id: item.id,
        user_id: item.user_id || null,
        name: item.name,
        artist: item.artist || '',
        artist_id: item.artist_id || null,
        cover_art: item.cover_art || null,
        song_count: typeof item.song_count === 'number' ? item.song_count : 0,
        duration: typeof item.duration === 'number' ? Math.round(item.duration) : 0,
        year: typeof item.year === 'number' ? item.year : null,
        genre: item.genre || null,
        created_at: item.created_at || Date.now(),
      });
    }
  });

  tx(albums);
}

export function upsertArtistsBatch(artists: CachedArtist[]): void {
  if (!Array.isArray(artists) || artists.length === 0) return;

  const stmt = db.prepare(`
    INSERT INTO cached_artists (
      id, user_id, name, album_count, cover_art, starred
    ) VALUES (
      @id, @user_id, @name, @album_count, @cover_art, @starred
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      name = excluded.name,
      album_count = excluded.album_count,
      cover_art = excluded.cover_art,
      starred = excluded.starred
  `);

  const tx = db.transaction((items: CachedArtist[]) => {
    for (const item of items) {
      if (!item || !item.id || !item.name) continue;
      stmt.run({
        id: item.id,
        user_id: item.user_id || null,
        name: item.name,
        album_count: typeof item.album_count === 'number' ? item.album_count : 0,
        cover_art: item.cover_art || null,
        starred: item.starred ? 1 : 0,
      });
    }
  });

  tx(artists);
}

export function queryTracks(options: LibraryQueryOptions = {}): {
  tracks: CachedTrack[];
  total: number;
} {
  const limit = Math.min(Math.max(1, Number(options.limit) || 100), 1000);
  const offset = Math.max(0, Number(options.offset) || 0);
  const sortCol =
    options.sort && ALLOWED_TRACK_SORTS[options.sort]
      ? ALLOWED_TRACK_SORTS[options.sort]
      : 'title';
  const order = getSafeOrder(options.order);

  const conditions: string[] = [];
  const params: any[] = [];

  if (options.userId) {
    conditions.push('(user_id = ? OR user_id IS NULL)');
    params.push(options.userId);
  }

  if (options.artistId) {
    conditions.push('artist_id = ?');
    params.push(options.artistId);
  }

  if (options.albumId) {
    conditions.push('album_id = ?');
    params.push(options.albumId);
  }

  if (options.genre) {
    conditions.push('LOWER(genre) = LOWER(?)');
    params.push(options.genre);
  }

  if (options.search && options.search.trim()) {
    const sanitized = sanitizeFtsQuery(options.search);
    if (sanitized) {
      try {
        conditions.push('rowid IN (SELECT rowid FROM tracks_fts WHERE tracks_fts MATCH ?)');
        params.push(sanitized);
      } catch {
        conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ?)');
        const pat = `%${options.search.trim()}%`;
        params.push(pat, pat, pat);
      }
    } else {
      conditions.push('(title LIKE ? OR artist LIKE ? OR album LIKE ?)');
      const pat = `%${options.search.trim()}%`;
      params.push(pat, pat, pat);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM cached_tracks ${whereClause}`)
    .get(...params) as { count: number };
  const total = countRow?.count || 0;

  const rows = db
    .prepare(
      `
    SELECT * FROM cached_tracks
    ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as CachedTrack[];

  return { tracks: rows, total };
}

export function queryAlbums(options: LibraryQueryOptions = {}): {
  albums: CachedAlbum[];
  total: number;
} {
  const limit = Math.min(Math.max(1, Number(options.limit) || 50), 1000);
  const offset = Math.max(0, Number(options.offset) || 0);
  const sortCol =
    options.sort && ALLOWED_ALBUM_SORTS[options.sort]
      ? ALLOWED_ALBUM_SORTS[options.sort]
      : 'name';
  const order = getSafeOrder(options.order);

  const conditions: string[] = [];
  const params: any[] = [];

  if (options.userId) {
    conditions.push('(user_id = ? OR user_id IS NULL)');
    params.push(options.userId);
  }

  if (options.artistId) {
    conditions.push('artist_id = ?');
    params.push(options.artistId);
  }

  if (options.genre) {
    conditions.push('LOWER(genre) = LOWER(?)');
    params.push(options.genre);
  }

  if (options.search && options.search.trim()) {
    conditions.push('(name LIKE ? OR artist LIKE ?)');
    const pat = `%${options.search.trim()}%`;
    params.push(pat, pat);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM cached_albums ${whereClause}`)
    .get(...params) as { count: number };
  const total = countRow?.count || 0;

  const rows = db
    .prepare(
      `
    SELECT * FROM cached_albums
    ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as CachedAlbum[];

  return { albums: rows, total };
}

export function queryArtists(options: LibraryQueryOptions = {}): {
  artists: CachedArtist[];
  total: number;
} {
  const limit = Math.min(Math.max(1, Number(options.limit) || 100), 2000);
  const offset = Math.max(0, Number(options.offset) || 0);
  const sortCol =
    options.sort && ALLOWED_ARTIST_SORTS[options.sort]
      ? ALLOWED_ARTIST_SORTS[options.sort]
      : 'name';
  const order = getSafeOrder(options.order);

  const conditions: string[] = [];
  const params: any[] = [];

  if (options.userId) {
    conditions.push('(user_id = ? OR user_id IS NULL)');
    params.push(options.userId);
  }

  if (options.search && options.search.trim()) {
    conditions.push('name LIKE ?');
    params.push(`%${options.search.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM cached_artists ${whereClause}`)
    .get(...params) as { count: number };
  const total = countRow?.count || 0;

  const rows = db
    .prepare(
      `
    SELECT * FROM cached_artists
    ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as CachedArtist[];

  return { artists: rows, total };
}

export function searchTracksFts(query: string, limit = 50): CachedTrack[] {
  if (!query || !query.trim()) return [];
  const safeLimit = Math.min(Math.max(1, limit), 500);
  const sanitized = sanitizeFtsQuery(query);

  if (sanitized) {
    try {
      const stmt = db.prepare(`
        SELECT c.* FROM cached_tracks c
        JOIN tracks_fts f ON c.rowid = f.rowid
        WHERE tracks_fts MATCH ?
        LIMIT ?
      `);
      return stmt.all(sanitized, safeLimit) as CachedTrack[];
    } catch (e) {
      console.warn('[DB] FTS search failed, falling back to LIKE:', e);
    }
  }

  const likePattern = `%${query.trim()}%`;
  const stmt = db.prepare(`
    SELECT * FROM cached_tracks
    WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
    LIMIT ?
  `);
  return stmt.all(likePattern, likePattern, likePattern, safeLimit) as CachedTrack[];
}

export function getSyncState(userId?: string): LibrarySyncState | null {
  try {
    if (userId) {
      const row = db
        .prepare('SELECT * FROM library_sync_state WHERE user_id = ? OR id = ? LIMIT 1')
        .get(userId, userId);
      if (row) return row as LibrarySyncState;
    }
    const row = db
      .prepare('SELECT * FROM library_sync_state ORDER BY last_sync_time DESC LIMIT 1')
      .get();
    return (row as LibrarySyncState) || null;
  } catch (err) {
    console.error('[DB] Failed to get sync state:', err);
    return null;
  }
}

export function setSyncState(state: LibrarySyncState): void {
  if (!state || !state.id) return;
  const stmt = db.prepare(`
    INSERT INTO library_sync_state (
      id, user_id, status, progress, total_tracks, total_albums, total_artists, last_sync_time, error
    ) VALUES (
      @id, @user_id, @status, @progress, @total_tracks, @total_albums, @total_artists, @last_sync_time, @error
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      status = excluded.status,
      progress = excluded.progress,
      total_tracks = excluded.total_tracks,
      total_albums = excluded.total_albums,
      total_artists = excluded.total_artists,
      last_sync_time = excluded.last_sync_time,
      error = excluded.error
  `);

  stmt.run({
    id: state.id,
    user_id: state.user_id || null,
    status: state.status || 'idle',
    progress: typeof state.progress === 'number' ? state.progress : 0,
    total_tracks: typeof state.total_tracks === 'number' ? state.total_tracks : 0,
    total_albums: typeof state.total_albums === 'number' ? state.total_albums : 0,
    total_artists: typeof state.total_artists === 'number' ? state.total_artists : 0,
    last_sync_time:
      typeof state.last_sync_time === 'number' ? state.last_sync_time : Date.now(),
    error: state.error || null,
  });
}

export function getLibraryStats(userId?: string): {
  totalTracks: number;
  totalAlbums: number;
  totalArtists: number;
} {
  try {
    const trackCond = userId ? 'WHERE (user_id = ? OR user_id IS NULL)' : '';
    const albumCond = userId ? 'WHERE (user_id = ? OR user_id IS NULL)' : '';
    const artistCond = userId ? 'WHERE (user_id = ? OR user_id IS NULL)' : '';
    const params = userId ? [userId] : [];

    const tracks = db
      .prepare(`SELECT COUNT(*) as count FROM cached_tracks ${trackCond}`)
      .get(...params) as { count: number };
    const albums = db
      .prepare(`SELECT COUNT(*) as count FROM cached_albums ${albumCond}`)
      .get(...params) as { count: number };
    const artists = db
      .prepare(`SELECT COUNT(*) as count FROM cached_artists ${artistCond}`)
      .get(...params) as { count: number };

    return {
      totalTracks: tracks?.count || 0,
      totalAlbums: albums?.count || 0,
      totalArtists: artists?.count || 0,
    };
  } catch (err) {
    console.error('[DB] Failed to get library stats:', err);
    return { totalTracks: 0, totalAlbums: 0, totalArtists: 0 };
  }
}

export function clearLibrary(userId?: string): void {
  try {
    if (userId) {
      db.prepare('DELETE FROM cached_tracks WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM cached_albums WHERE user_id = ?').run(userId);
      db.prepare('DELETE FROM cached_artists WHERE user_id = ?').run(userId);
    } else {
      db.prepare('DELETE FROM cached_tracks').run();
      db.prepare('DELETE FROM cached_albums').run();
      db.prepare('DELETE FROM cached_artists').run();
    }
  } catch (err) {
    console.error('[DB] Failed to clear library:', err);
  }
}
