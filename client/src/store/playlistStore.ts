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
  createPlaylist: (name: string, description?: string) => string;
  updatePlaylist: (id: string, name?: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  addTrack: (playlistId: string, trackId: string) => void;
  removeTrack: (playlistId: string, trackId: string) => void;
}

export async function syncCustomPlaylistToServer(playlist: CustomPlaylist): Promise<void> {
  const baseUrl = getHoladServerUrl();
  const safeTrackIds = Array.isArray(playlist.trackIds) ? playlist.trackIds.slice(0, 200) : [];
  const safeTracks = Array.isArray(playlist.tracks) ? playlist.tracks.slice(0, 200) : undefined;
  const res = await fetch(`${baseUrl}/api/custom-playlists`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      trackIds: safeTrackIds,
      tracks: safeTracks,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to sync custom playlist: ${res.statusText}`);
  }
}

export async function deleteCustomPlaylistFromServer(id: string): Promise<void> {
  try {
    const baseUrl = getHoladServerUrl();
    const res = await fetch(`${baseUrl}/api/custom-playlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
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
