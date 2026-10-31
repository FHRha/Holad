import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';
import type { HistoryRecord } from '../types.js';

export function pruneUserHistory(userId: string, maxEntries = 5000): void {
  if (!userId) return;
  try {
    db.prepare(`
      DELETE FROM history 
      WHERE user_id = ? AND rowid NOT IN (
        SELECT rowid FROM history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?
      )
    `).run(userId, userId, maxEntries);
  } catch (err) {
    console.error(`[DB] Error pruning history for user ${userId}:`, err);
  }
}

export function addHistoryEntry(userId: string, entry: HistoryRecord): boolean {
  if (!userId || !entry || !entry.song_id) return false;
  ensureUserExists(userId);

  const playedAt = typeof entry.played_at === 'number' && !isNaN(entry.played_at) 
    ? entry.played_at 
    : Date.now();

  // Deduplication: check last played track for this user with same song_id
  const lastEntry = db.prepare(`
    SELECT song_id, played_at FROM history 
    WHERE user_id = ? AND song_id = ? 
    ORDER BY played_at DESC LIMIT 1
  `).get(userId, entry.song_id) as { song_id: string; played_at: number | string } | undefined;

  if (lastEntry) {
    const lastTime = typeof lastEntry.played_at === 'number' 
      ? lastEntry.played_at 
      : new Date(lastEntry.played_at).getTime();
    if (Math.abs(playedAt - lastTime) < 5 * 60 * 1000) {
      return false; // Skip duplicate within 5 mins
    }
  }

  const stmt = db.prepare(`
    INSERT INTO history (user_id, song_id, title, artist, album, album_id, artist_id, duration, cover_art, played_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    userId,
    entry.song_id,
    entry.title || '',
    entry.artist || '',
    entry.album || '',
    entry.album_id || null,
    entry.artist_id || null,
    entry.duration !== undefined && entry.duration !== null ? Math.round(Number(entry.duration)) : 0,
    entry.cover_art || null,
    playedAt
  );

  pruneUserHistory(userId, 5000);
  return true;
}

export function addHistoryBatch(userId: string, entries: HistoryRecord[]): number {
  if (!userId || !Array.isArray(entries) || entries.length === 0) return 0;
  ensureUserExists(userId);

  let insertedCount = 0;
  const insertStmt = db.prepare(`
    INSERT INTO history (user_id, song_id, title, artist, album, album_id, artist_id, duration, cover_art, played_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sorted = [...entries].sort((a, b) => (a.played_at || 0) - (b.played_at || 0));

  const transaction = db.transaction(() => {
    for (const entry of sorted) {
      if (!entry || !entry.song_id) continue;
      const playedAt = typeof entry.played_at === 'number' && !isNaN(entry.played_at) 
        ? entry.played_at 
        : Date.now();

      const lastEntry = db.prepare(`
        SELECT song_id, played_at FROM history 
        WHERE user_id = ? AND song_id = ? 
        ORDER BY played_at DESC LIMIT 1
      `).get(userId, entry.song_id) as { song_id: string; played_at: number | string } | undefined;

      if (lastEntry) {
        const lastTime = typeof lastEntry.played_at === 'number' 
          ? lastEntry.played_at 
          : new Date(lastEntry.played_at).getTime();
        if (Math.abs(playedAt - lastTime) < 5 * 60 * 1000) {
          continue;
        }
      }

      insertStmt.run(
        userId,
        entry.song_id,
        entry.title || '',
        entry.artist || '',
        entry.album || '',
        entry.album_id || null,
        entry.artist_id || null,
        entry.duration !== undefined && entry.duration !== null ? Math.round(Number(entry.duration)) : 0,
        entry.cover_art || null,
        playedAt
      );
      insertedCount++;
    }

    pruneUserHistory(userId, 5000);
  });

  transaction();
  return insertedCount;
}

export function getHistory(userId: string, since?: number, limit = 500): HistoryRecord[] {
  if (!userId) return [];
  ensureUserExists(userId);

  const safeLimit = Math.min(Math.max(1, limit), 5000);

  let rows: any[];
  if (since !== undefined && since !== null && !isNaN(since)) {
    rows = db.prepare(`
      SELECT rowid as id, song_id, title, artist, album, album_id, artist_id, duration, cover_art, played_at 
      FROM history 
      WHERE user_id = ? AND played_at > ? 
      ORDER BY played_at DESC 
      LIMIT ?
    `).all(userId, since, safeLimit);
  } else {
    rows = db.prepare(`
      SELECT rowid as id, song_id, title, artist, album, album_id, artist_id, duration, cover_art, played_at 
      FROM history 
      WHERE user_id = ? 
      ORDER BY played_at DESC 
      LIMIT ?
    `).all(userId, safeLimit);
  }

  return rows.map(r => ({
    id: r.id,
    song_id: r.song_id,
    title: r.title || '',
    artist: r.artist || '',
    album: r.album || '',
    album_id: r.album_id || undefined,
    artist_id: r.artist_id || undefined,
    duration: r.duration || 0,
    cover_art: r.cover_art || undefined,
    played_at: typeof r.played_at === 'number' ? r.played_at : new Date(r.played_at).getTime()
  }));
}

export function clearUserHistory(userId: string): void {
  if (!userId) return;
  db.prepare('DELETE FROM history WHERE user_id = ?').run(userId);
}
