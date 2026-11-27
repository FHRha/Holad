import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';
import { useHistoryStore, type PlayHistoryEntry } from '../store/historyStore';
import type { Track } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

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

  const entry: PlayHistoryEntry = {
    ...track,
    playedAt
  };

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

    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      timeoutMs: 8000
    });

    if (res.ok) {
      useHistoryStore.getState().removePendingOfflineHistory(track.id, playedAt);
      return true;
    }
    useHistoryStore.getState().addPendingOfflineHistory(entry);
    return false;
  } catch (error) {
    console.warn('[History API] Failed to push history entry:', error);
    useHistoryStore.getState().addPendingOfflineHistory(entry);
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
    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(entries),
      timeoutMs: 8000
    });

    return res.ok;
  } catch (error) {
    console.warn('[History API] Failed to push history batch:', error);
    return false;
  }
}

export async function fetchHistoryDeltaWithStatus(
  since?: number,
  limit = 500
): Promise<{ ok: boolean; entries: PlayHistoryEntry[] }> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return { ok: false, entries: [] };

  try {
    const params = new URLSearchParams();
    if (since !== undefined && since !== null && !isNaN(since)) {
      params.set('since', since.toString());
    }
    if (limit) {
      params.set('limit', limit.toString());
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}${query}`, {
      method: 'GET',
      headers: getHeaders(),
      timeoutMs: 8000
    });

    if (!res.ok) {
      return { ok: false, entries: [] };
    }

    const data = await res.json();
    return { ok: true, entries: Array.isArray(data) ? data : [] };
  } catch (error) {
    console.warn('[History API] Failed to fetch history delta:', error);
    return { ok: false, entries: [] };
  }
}

/**
 * Fetches history delta from server SQLite database.
 * If `since` is specified, only returns tracks played after that timestamp.
 */
export async function fetchHistoryDelta(since?: number, limit = 500): Promise<PlayHistoryEntry[]> {
  const { entries } = await fetchHistoryDeltaWithStatus(since, limit);
  return entries;
}

/**
 * Clears user history in the server SQLite database.
 */
export async function deleteServerHistory(): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  try {
    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(user)}`, {
      method: 'DELETE',
      headers: getHeaders(),
      timeoutMs: 8000
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
    const historyStore = useHistoryStore.getState();
    const pendingOffline = historyStore.pendingOfflineHistory || [];

    if (pendingOffline.length > 0) {
      console.log('[History API] Pushing pending offline tracks to server:', pendingOffline.length);
      const pushed = await pushHistoryBatch(pendingOffline);
      if (pushed) {
        historyStore.clearPendingOfflineHistory();
      }
    }

    const { ok, entries: serverEntries } = await fetchHistoryDeltaWithStatus(undefined, 500);
    if (!ok) {
      return;
    }

    if (useHistoryStore.getState().pendingOfflineHistory.length === 0) {
      // Online without pending offline-recorded history: accept server history as SSOT
      useHistoryStore.getState().setHistory(serverEntries);
    } else if (serverEntries.length > 0) {
      useHistoryStore.getState().syncHistoryData(serverEntries);
    }
  } catch (error) {
    console.warn('[History API] Error syncing history with server:', error);
  } finally {
    isSyncing = false;
  }
}
