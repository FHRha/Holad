import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';
import { useHistoryStore, type PlayHistoryEntry } from '../store/historyStore';
import type { Track } from '../types';

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
};

/**
 * Pushes a single played track to the server SQLite database.
 * Extremely lightweight payload (~250 bytes).
 */
export async function pushHistoryEntry(track: Track, playedAt: number): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const payload = {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumId: track.albumId,
      artistId: track.artistId,
      duration: track.duration,
      coverArt: track.coverArt,
      playedAt
    };

    const res = await fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    return res.ok;
  } catch (error) {
    console.warn('[History API] Failed to push history entry:', error);
    return false;
  }
}

/**
 * Pushes a batch of history entries to the server SQLite database.
 * Useful for initial sync / migration from localStorage.
 */
export async function pushHistoryBatch(entries: PlayHistoryEntry[]): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user || !Array.isArray(entries) || entries.length === 0) return false;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(entries)
    });

    return res.ok;
  } catch (error) {
    console.warn('[History API] Failed to push history batch:', error);
    return false;
  }
}

/**
 * Fetches history delta from server SQLite database.
 * If `since` is specified, only returns tracks played after that timestamp.
 */
export async function fetchHistoryDelta(since?: number, limit = 500): Promise<PlayHistoryEntry[]> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return [];

  try {
    const params = new URLSearchParams();
    if (since !== undefined && since !== null && !isNaN(since)) {
      params.set('since', since.toString());
    }
    if (limit) {
      params.set('limit', limit.toString());
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}${query}`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('[History API] Failed to fetch history delta:', error);
    return [];
  }
}

/**
 * Clears user history in the server SQLite database.
 */
export async function deleteServerHistory(): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'DELETE',
      headers: getHeaders()
    });

    return res.ok;
  } catch (error) {
    console.warn('[History API] Failed to delete history on server:', error);
    return false;
  }
}

let isSyncing = false;

/**
 * Smart bidirectional sync between client localStorage and server SQLite database:
 * 1. If client history is empty, fetches recent 500 tracks from server.
 * 2. If client has history that hasn't been uploaded yet, pushes it to server once.
 * 3. Pulls any new tracks from server played on other devices (delta since latest playedAt).
 */
export async function syncHistoryWithServer(): Promise<void> {
  if (isSyncing) return;
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return;

  isSyncing = true;
  try {
    const localHistory = useHistoryStore.getState().history;
    const initialPushKey = `holad_history_migrated_${user}`;
    const hasPushedInitial = localStorage.getItem(initialPushKey) === 'true';

    // If client has local history and hasn't uploaded initial batch to server yet
    if (localHistory.length > 0 && !hasPushedInitial) {
      const serverSample = await fetchHistoryDelta(undefined, 1);
      if (serverSample.length === 0) {
        console.log('[History API] Migrating local history to server SQLite DB:', localHistory.length);
        await pushHistoryBatch(localHistory);
      }
      localStorage.setItem(initialPushKey, 'true');
    }

    if (localHistory.length === 0) {
      // New device or cleared storage: pull initial history
      const serverEntries = await fetchHistoryDelta(undefined, 500);
      if (serverEntries.length > 0) {
        console.log('[History API] Loaded history from server SQLite DB:', serverEntries.length);
        useHistoryStore.getState().syncHistoryData(serverEntries);
      }
      localStorage.setItem(initialPushKey, 'true');
    } else {
      // Delta sync: fetch only tracks played after our newest track
      const newestPlayedAt = localHistory[0]?.playedAt;
      const newEntries = await fetchHistoryDelta(newestPlayedAt, 500);
      if (newEntries.length > 0) {
        console.log('[History API] Merged new history tracks from server:', newEntries.length);
        useHistoryStore.getState().syncHistoryData(newEntries);
      }
    }
  } catch (error) {
    console.warn('[History API] Error syncing history with server:', error);
  } finally {
    isSyncing = false;
  }
}
