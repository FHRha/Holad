import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { getHoladServerUrl } from '../utils/serverConfig';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export interface CustomPlaylist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  tracks?: any[];
  pendingOfflineSync?: boolean;
}

interface PlaylistStore {
  playlists: CustomPlaylist[];
  pendingSyncIds: string[];
  setPlaylists: (playlists: CustomPlaylist[]) => void;
  mergeServerPlaylists: (serverPlaylists: CustomPlaylist[]) => void;
  createPlaylist: (name: string, description?: string) => string;
  updatePlaylist: (id: string, name?: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  addTrack: (playlistId: string, trackId: string) => void;
  removeTrack: (playlistId: string, trackId: string) => void;
}

import { useAuthStore } from './authStore';

const playlistSaveAbortControllers = new Map<string, AbortController>();

function getAuthHeaders(): Record<string, string> {
  const { user, token, salt, url } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (user) {
    headers['x-user'] = user;
    headers['x-user-id'] = user;
  }
  if (token) headers['x-token'] = token;
  if (salt) headers['x-salt'] = salt;
  if (url) headers['x-url'] = url;
  return headers;
}

export async function fetchUserCustomPlaylistsWithStatus(): Promise<{ ok: boolean; playlists: CustomPlaylist[] }> {
  try {
    const baseUrl = getHoladServerUrl();
    const user = useAuthStore.getState().user;
    if (!user) return { ok: false, playlists: [] };
    const headers: Record<string, string> = {
      ...getAuthHeaders(),
    };
    const res = await fetchWithTimeout(`${baseUrl}/api/custom-playlists`, {
      method: 'GET',
      headers,
      timeoutMs: 8000,
    });
    if (!res.ok) return { ok: false, playlists: [] };
    const data = await res.json();
    return {
      ok: true,
      playlists: Array.isArray(data?.playlists) ? data.playlists : [],
    };
  } catch (err) {
    console.error('Error fetching user custom playlists:', err);
    return { ok: false, playlists: [] };
  }
}

export async function fetchUserCustomPlaylists(): Promise<CustomPlaylist[]> {
  const { playlists } = await fetchUserCustomPlaylistsWithStatus();
  return playlists;
}

export async function syncPendingCustomPlaylists(): Promise<void> {
  const state = usePlaylistStore.getState();
  const pendingSet = new Set<string>(state.pendingSyncIds || []);
  for (const pl of state.playlists) {
    if (pl.pendingOfflineSync) {
      pendingSet.add(pl.id);
    }
  }
  if (pendingSet.size === 0) return;

  for (const id of pendingSet) {
    const pl = usePlaylistStore.getState().playlists.find(p => p.id === id);
    if (!pl) {
      usePlaylistStore.setState(s => ({
        pendingSyncIds: s.pendingSyncIds.filter(pid => pid !== id),
      }));
      continue;
    }
    try {
      await syncCustomPlaylistToServer(pl);
      usePlaylistStore.setState(s => ({
        pendingSyncIds: s.pendingSyncIds.filter(pid => pid !== id),
        playlists: s.playlists.map(p => p.id === id ? { ...p, pendingOfflineSync: false } : p),
      }));
    } catch {
      // Keep pending until next online sync
    }
  }
}

export async function syncCustomPlaylistToServer(playlist: CustomPlaylist): Promise<void> {
  const baseUrl = getHoladServerUrl();
  const user = useAuthStore.getState().user;
  const safeTrackIds = Array.isArray(playlist.trackIds) ? playlist.trackIds.slice(0, 200) : [];
  const safeTracks = Array.isArray(playlist.tracks) ? playlist.tracks.slice(0, 200) : undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };
  const existingController = playlistSaveAbortControllers.get(playlist.id);
  if (existingController) {
    existingController.abort();
    playlistSaveAbortControllers.delete(playlist.id);
  }
  const currentController = new AbortController();
  playlistSaveAbortControllers.set(playlist.id, currentController);

  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/custom-playlists`, {
      method: 'POST',
      headers,
      signal: currentController.signal,
      timeoutMs: 8000,
      body: JSON.stringify({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        trackIds: safeTrackIds,
        tracks: safeTracks,
        userId: user || undefined,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to sync custom playlist: ${res.statusText}`);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    throw err;
  } finally {
    if (playlistSaveAbortControllers.get(playlist.id) === currentController) {
      playlistSaveAbortControllers.delete(playlist.id);
    }
  }
}

export async function deleteCustomPlaylistFromServer(id: string): Promise<void> {
  try {
    const baseUrl = getHoladServerUrl();
    const user = useAuthStore.getState().user;
    const headers: Record<string, string> = {
      ...getAuthHeaders(),
    };
    const query = user ? `?userId=${encodeURIComponent(user)}` : '';
    const res = await fetchWithTimeout(`${baseUrl}/api/custom-playlists/${encodeURIComponent(id)}${query}`, {
      method: 'DELETE',
      headers,
      timeoutMs: 8000,
    });
    if (!res.ok && res.status !== 404) {
      console.error(`Failed to delete custom playlist from server: ${res.statusText}`);
    }
  } catch (err) {
    console.error('Error deleting custom playlist from server:', err);
  }
}

const playlistSyncEpoch = new Map<string, number>();

function pushPlaylistWithPendingTracking(playlist: CustomPlaylist): void {
  const epoch = (playlistSyncEpoch.get(playlist.id) || 0) + 1;
  playlistSyncEpoch.set(playlist.id, epoch);

  syncCustomPlaylistToServer(playlist)
    .then(() => {
      if (playlistSyncEpoch.get(playlist.id) !== epoch) return;
      usePlaylistStore.setState((state) => ({
        pendingSyncIds: state.pendingSyncIds.filter(pid => pid !== playlist.id),
        playlists: state.playlists.map(pl => pl.id === playlist.id ? { ...pl, pendingOfflineSync: false } : pl),
      }));
    })
    .catch(console.error);
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set, get) => ({
      playlists: [],
      pendingSyncIds: [],
      
      setPlaylists: (playlists) => set({ playlists }),
      mergeServerPlaylists: (serverPlaylists) => {
        if (!Array.isArray(serverPlaylists)) return;
        set((state) => {
          const pendingSet = new Set<string>(state.pendingSyncIds || []);
          const localPendingMap = new Map<string, CustomPlaylist>();
          for (const local of state.playlists) {
            if (pendingSet.has(local.id) || local.pendingOfflineSync) {
              localPendingMap.set(local.id, local);
            }
          }

          const nextPlaylists: CustomPlaylist[] = [];
          const seenIds = new Set<string>();

          for (const serverPl of serverPlaylists) {
            seenIds.add(serverPl.id);
            const pendingLocal = localPendingMap.get(serverPl.id);
            if (pendingLocal) {
              nextPlaylists.push(pendingLocal);
            } else {
              nextPlaylists.push({
                id: serverPl.id,
                name: serverPl.name || '',
                description: serverPl.description ?? '',
                trackIds: Array.isArray(serverPl.trackIds) ? serverPl.trackIds : [],
                tracks: serverPl.tracks,
                pendingOfflineSync: false,
              });
            }
          }

          for (const [id, pendingLocal] of localPendingMap.entries()) {
            if (!seenIds.has(id)) {
              nextPlaylists.push(pendingLocal);
            }
          }

          return { playlists: nextPlaylists };
        });
      },
      
      createPlaylist: (name, description = '') => {
        const id = uuidv4();
        const newPlaylist: CustomPlaylist = { id, name, description, trackIds: [], pendingOfflineSync: true };
        set((state) => ({
          playlists: [...state.playlists, newPlaylist],
          pendingSyncIds: state.pendingSyncIds.includes(id) ? state.pendingSyncIds : [...state.pendingSyncIds, id],
        }));
        pushPlaylistWithPendingTracking(newPlaylist);
        return id;
      },
      
      updatePlaylist: (id, name, description) => {
        set((state) => ({
          playlists: state.playlists.map(pl => pl.id === id ? {
            ...pl,
            name: name !== undefined ? name : pl.name,
            description: description !== undefined ? description : pl.description,
            pendingOfflineSync: true,
          } : pl),
          pendingSyncIds: state.pendingSyncIds.includes(id) ? state.pendingSyncIds : [...state.pendingSyncIds, id],
        }));
        const affected = get().playlists.find(pl => pl.id === id);
        if (affected) {
          pushPlaylistWithPendingTracking(affected);
        }
      },
      
      deletePlaylist: (id) => {
        playlistSyncEpoch.delete(id);
        set((state) => ({
          playlists: state.playlists.filter(pl => pl.id !== id),
          pendingSyncIds: state.pendingSyncIds.filter(pid => pid !== id),
        }));
        deleteCustomPlaylistFromServer(id).catch(console.error);
      },
      
      addTrack: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map(pl => {
            if (pl.id === playlistId && !pl.trackIds.includes(trackId)) {
              return { ...pl, trackIds: [...pl.trackIds, trackId], pendingOfflineSync: true };
            }
            return pl;
          }),
          pendingSyncIds: state.pendingSyncIds.includes(playlistId)
            ? state.pendingSyncIds
            : [...state.pendingSyncIds, playlistId],
        }));
        const affected = get().playlists.find(pl => pl.id === playlistId);
        if (affected) {
          pushPlaylistWithPendingTracking(affected);
        }
      },
      
      removeTrack: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map(pl => {
            if (pl.id === playlistId) {
              return { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId), pendingOfflineSync: true };
            }
            return pl;
          }),
          pendingSyncIds: state.pendingSyncIds.includes(playlistId)
            ? state.pendingSyncIds
            : [...state.pendingSyncIds, playlistId],
        }));
        const affected = get().playlists.find(pl => pl.id === playlistId);
        if (affected) {
          pushPlaylistWithPendingTracking(affected);
        }
      }
    }),
    {
      name: 'holad-playlists-storage'
    }
  )
);
