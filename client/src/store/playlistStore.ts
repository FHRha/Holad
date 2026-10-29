import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import { getHoladServerUrl } from '../utils/serverConfig';

export interface CustomPlaylist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  tracks?: any[];
}

interface PlaylistStore {
  playlists: CustomPlaylist[];
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

export async function fetchUserCustomPlaylists(): Promise<CustomPlaylist[]> {
  try {
    const baseUrl = getHoladServerUrl();
    const user = useAuthStore.getState().user;
    if (!user) return [];
    const headers: Record<string, string> = {
      'x-user-id': encodeURIComponent(user)
    };
    const res = await fetch(`${baseUrl}/api/custom-playlists`, {
      method: 'GET',
      headers
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.playlists) ? data.playlists : [];
  } catch (err) {
    console.error('Error fetching user custom playlists:', err);
    return [];
  }
}

export async function syncCustomPlaylistToServer(playlist: CustomPlaylist): Promise<void> {
  const baseUrl = getHoladServerUrl();
  const user = useAuthStore.getState().user;
  const safeTrackIds = Array.isArray(playlist.trackIds) ? playlist.trackIds.slice(0, 200) : [];
  const safeTracks = Array.isArray(playlist.tracks) ? playlist.tracks.slice(0, 200) : undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    headers['x-user-id'] = encodeURIComponent(user);
  }
  const existingController = playlistSaveAbortControllers.get(playlist.id);
  if (existingController) {
    existingController.abort();
    playlistSaveAbortControllers.delete(playlist.id);
  }
  const currentController = new AbortController();
  playlistSaveAbortControllers.set(playlist.id, currentController);

  try {
    const res = await fetch(`${baseUrl}/api/custom-playlists`, {
      method: 'POST',
      headers,
      signal: currentController.signal,
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
    const headers: Record<string, string> = {};
    const query = user ? `?userId=${encodeURIComponent(user)}` : '';
    if (user) {
      headers['x-user-id'] = encodeURIComponent(user);
    }
    const res = await fetch(`${baseUrl}/api/custom-playlists/${encodeURIComponent(id)}${query}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok && res.status !== 404) {
      console.error(`Failed to delete custom playlist from server: ${res.statusText}`);
    }
  } catch (err) {
    console.error('Error deleting custom playlist from server:', err);
  }
}

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set, get) => ({
      playlists: [],
      
      setPlaylists: (playlists) => set({ playlists }),
      mergeServerPlaylists: (serverPlaylists) => {
        if (!Array.isArray(serverPlaylists) || serverPlaylists.length === 0) return;
        set((state) => {
          const localMap = new Map(state.playlists.map(p => [p.id, p]));
          for (const serverPl of serverPlaylists) {
            if (!localMap.has(serverPl.id)) {
              localMap.set(serverPl.id, serverPl);
            } else {
              const local = localMap.get(serverPl.id);
              if (local) {
                const mergedTrackIds = Array.from(new Set([...(local.trackIds || []), ...(serverPl.trackIds || [])]));
                localMap.set(serverPl.id, {
                  id: serverPl.id,
                  name: serverPl.name || local.name,
                  description: serverPl.description !== undefined ? serverPl.description : local.description,
                  trackIds: mergedTrackIds,
                  tracks: serverPl.tracks || local.tracks
                });
              }
            }
          }
          return { playlists: Array.from(localMap.values()) };
        });
      },
      
      createPlaylist: (name, description = '') => {
        const id = uuidv4();
        const newPlaylist: CustomPlaylist = { id, name, description, trackIds: [] };
        set((state) => ({
          playlists: [...state.playlists, newPlaylist]
        }));
        syncCustomPlaylistToServer(newPlaylist).catch(console.error);
        return id;
      },
      
      updatePlaylist: (id, name, description) => {
        set((state) => ({
          playlists: state.playlists.map(pl => pl.id === id ? {
            ...pl,
            name: name !== undefined ? name : pl.name,
            description: description !== undefined ? description : pl.description
          } : pl)
        }));
        const affected = get().playlists.find(pl => pl.id === id);
        if (affected) {
          syncCustomPlaylistToServer(affected).catch(console.error);
        }
      },
      
      deletePlaylist: (id) => {
        set((state) => ({
          playlists: state.playlists.filter(pl => pl.id !== id)
        }));
        deleteCustomPlaylistFromServer(id).catch(console.error);
      },
      
      addTrack: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map(pl => {
            if (pl.id === playlistId && !pl.trackIds.includes(trackId)) {
              return { ...pl, trackIds: [...pl.trackIds, trackId] };
            }
            return pl;
          })
        }));
        const affected = get().playlists.find(pl => pl.id === playlistId);
        if (affected) {
          syncCustomPlaylistToServer(affected).catch(console.error);
        }
      },
      
      removeTrack: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map(pl => {
            if (pl.id === playlistId) {
              return { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId) };
            }
            return pl;
          })
        }));
        const affected = get().playlists.find(pl => pl.id === playlistId);
        if (affected) {
          syncCustomPlaylistToServer(affected).catch(console.error);
        }
      }
    }),
    {
      name: 'holad-playlists-storage'
    }
  )
);
