import { db } from '../connection.js';
import { ensureUserExists } from './socialTable.js';
import type { PlaybackStateRecord, PlaybackState } from '../types.js';

export function getPlaybackState(userId: string): PlaybackStateRecord | null {
  const row = db.prepare(`
    SELECT 
      COALESCE(song_id, current_song_id) as song_id,
      position,
      volume,
      is_playing,
      queue,
      queue_version,
      current_index,
      is_shuffled,
      repeat_mode,
      updated_at
    FROM playback_state
    WHERE user_id = ?
  `).get(userId) as any;

  if (!row) return null;

  let parsedQueue: any[] = [];
  if (row.queue) {
    if (typeof row.queue === 'string') {
      try {
        parsedQueue = JSON.parse(row.queue);
        if (!Array.isArray(parsedQueue)) {
          parsedQueue = [];
        }
      } catch {
        parsedQueue = [];
      }
    } else if (Array.isArray(row.queue)) {
      parsedQueue = row.queue;
    }
  }

  return {
    song_id: row.song_id ?? null,
    current_song_id: row.song_id ?? null,
    position: row.position !== null && row.position !== undefined ? row.position : 0,
    volume: row.volume !== null && row.volume !== undefined ? row.volume : 1,
    is_playing: Boolean(row.is_playing),
    queue: parsedQueue,
    queue_version: row.queue_version || '',
    current_index: row.current_index !== null && row.current_index !== undefined ? row.current_index : 0,
    is_shuffled: Boolean(row.is_shuffled),
    repeat_mode: row.repeat_mode || 'off',
    updated_at: row.updated_at || 0
  };
}

export function savePlaybackState(userId: string, state: Partial<PlaybackStateRecord>): void {
  ensureUserExists(userId);
  const anyState = state as any;
  const now = anyState.updated_at || anyState.updatedAt || Date.now();
  const existing = db.prepare('SELECT * FROM playback_state WHERE user_id = ?').get(userId) as any;

  // Song ID
  const songId = anyState.song_id !== undefined 
    ? anyState.song_id 
    : (anyState.songId !== undefined 
      ? anyState.songId 
      : (existing?.song_id ?? existing?.current_song_id ?? null));

  // Position
  const position = anyState.position !== undefined 
    ? Math.round(anyState.position) 
    : (existing?.position ?? 0);

  // Volume
  const volume = anyState.volume !== undefined 
    ? anyState.volume 
    : (existing?.volume ?? 1);

  // Is Playing
  const isPlayingVal = anyState.is_playing !== undefined ? anyState.is_playing : anyState.isPlaying;
  const isPlaying = isPlayingVal !== undefined ? (isPlayingVal ? 1 : 0) : (existing?.is_playing ?? 0);

  // Queue
  const rawQueue = anyState.queue;
  let queueStr: string;
  if (rawQueue !== undefined) {
    if (typeof rawQueue === 'string') {
      queueStr = rawQueue;
    } else {
      try {
        queueStr = JSON.stringify(rawQueue);
      } catch {
        queueStr = '[]';
      }
    }
  } else {
    queueStr = existing?.queue ?? '[]';
  }

  // Queue Version
  const qv = anyState.queue_version !== undefined ? anyState.queue_version : anyState.queueVersion;
  const queueVersion = qv !== undefined ? String(qv) : (existing?.queue_version ?? '');

  // Current Index
  const ci = anyState.current_index !== undefined ? anyState.current_index : anyState.currentIndex;
  const currentIndex = ci !== undefined ? Number(ci) : (existing?.current_index ?? 0);

  // Is Shuffled
  const isShuffledVal = anyState.is_shuffled !== undefined ? anyState.is_shuffled : anyState.isShuffled;
  const isShuffled = isShuffledVal !== undefined ? (isShuffledVal ? 1 : 0) : (existing?.is_shuffled ?? 0);

  // Repeat Mode
  const rm = anyState.repeat_mode !== undefined ? anyState.repeat_mode : anyState.repeatMode;
  const repeatMode = rm !== undefined ? String(rm) : (existing?.repeat_mode ?? 'off');

  db.prepare(`
    INSERT INTO playback_state (
      user_id, song_id, current_song_id, position, volume,
      is_playing, queue, queue_version, current_index, is_shuffled, repeat_mode, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      song_id = excluded.song_id,
      current_song_id = excluded.current_song_id,
      position = excluded.position,
      volume = excluded.volume,
      is_playing = excluded.is_playing,
      queue = excluded.queue,
      queue_version = excluded.queue_version,
      current_index = excluded.current_index,
      is_shuffled = excluded.is_shuffled,
      repeat_mode = excluded.repeat_mode,
      updated_at = excluded.updated_at
  `).run(
    userId, songId, songId, position, volume,
    isPlaying, queueStr, queueVersion, currentIndex, isShuffled, repeatMode, now
  );
}

export function updatePlaybackProgress(
  userId: string,
  currentIndex: number,
  songId: string,
  position: number,
  isPlaying: boolean,
  updatedAt: number
): void {
  ensureUserExists(userId);
  const now = updatedAt || Date.now();
  const playingInt = isPlaying ? 1 : 0;
  const posInt = Math.round(position || 0);
  const idx = Number(currentIndex || 0);
  const song = songId || null;

  db.prepare(`
    INSERT INTO playback_state (
      user_id, song_id, current_song_id, current_index, position, is_playing, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      song_id = excluded.song_id,
      current_song_id = excluded.current_song_id,
      current_index = excluded.current_index,
      position = excluded.position,
      is_playing = excluded.is_playing,
      updated_at = excluded.updated_at
  `).run(userId, song, song, idx, posInt, playingInt, now);
}

