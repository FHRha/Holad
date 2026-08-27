import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface CustomPlaylist {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
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

export const usePlaylistStore = create<PlaylistStore>()(
  persist(
    (set) => ({
      playlists: [],
      
      setPlaylists: (playlists) => set({ playlists }),
      
      createPlaylist: (name, description = '') => {
        const id = uuidv4();
        set((state) => ({
          playlists: [...state.playlists, { id, name, description, trackIds: [] }]
        }));
        return id;
      },
      
      updatePlaylist: (id, name, description) => set((state) => ({
        playlists: state.playlists.map(pl => pl.id === id ? {
          ...pl,
          name: name !== undefined ? name : pl.name,
          description: description !== undefined ? description : pl.description
        } : pl)
      })),
      
      deletePlaylist: (id) => set((state) => ({
        playlists: state.playlists.filter(pl => pl.id !== id)
      })),
      
      addTrack: (playlistId, trackId) => set((state) => ({
        playlists: state.playlists.map(pl => {
          if (pl.id === playlistId && !pl.trackIds.includes(trackId)) {
            return { ...pl, trackIds: [...pl.trackIds, trackId] };
          }
          return pl;
        })
      })),
      
      removeTrack: (playlistId, trackId) => set((state) => ({
        playlists: state.playlists.map(pl => {
          if (pl.id === playlistId) {
            return { ...pl, trackIds: pl.trackIds.filter(id => id !== trackId) };
          }
          return pl;
        })
      }))
    }),
    {
      name: 'holad-playlists-storage'
    }
  )
);
