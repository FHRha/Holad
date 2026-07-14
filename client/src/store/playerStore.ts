import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  coverArt: string;
  duration: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  initialPosition: number; // For restoring position from Navidrome
  localPlaylists: Playlist[];
  
  // Likes
  likedTrackIds: string[];
  likedAlbumIds: string[];
  
  // Jam Session State
  roomId: string | null;
  role: 'host' | 'listener' | null;
  isAutoDjEnabled: boolean;
  syncDrift: number; // for tracking drift

  // Actions
  setQueue: (tracks: Track[]) => void;
  setQueueAndPlay: (tracks: Track[], startIndex?: number) => void;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  clearQueue: () => void;
  playTrack: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setIsPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  setInitialPosition: (pos: number) => void;
  toggleAutoDj: () => void;
  setSyncDrift: (drift: number) => void;
  
  // Playlist Actions
  createPlaylist: (name: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  
  // Jam Session Actions
  setRoomInfo: (roomId: string | null, role: 'host' | 'listener' | null) => void;
  
  // Likes Actions
  setLikedItems: (tracks: string[], albums: string[]) => void;
  toggleTrackLike: (id: string) => void;
  toggleAlbumLike: (id: string) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      volume: 1,
      initialPosition: 0,
      localPlaylists: [],
      
      likedTrackIds: [],
      likedAlbumIds: [],
      
      roomId: null,
      role: null,
      isAutoDjEnabled: true, // Default on like Feishin
      syncDrift: 0,

      setQueue: (tracks) => set({ queue: tracks, currentIndex: 0, isPlaying: true }),
      setQueueAndPlay: (tracks, startIndex = 0) => set({ queue: tracks, currentIndex: startIndex, isPlaying: true }),
      playNext: (tracks) => set((state) => {
        let newQueue = [...state.queue];
        let newCurrentIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
        
        // Remove tracks if they already exist to avoid duplicates
        const trackIds = tracks.map(t => t.id);
        for (const id of trackIds) {
          const idx = newQueue.findIndex(t => t.id === id);
          if (idx !== -1) {
            newQueue.splice(idx, 1);
            if (idx <= newCurrentIndex) newCurrentIndex--;
          }
        }
        
        newQueue.splice(newCurrentIndex + 1, 0, ...tracks);
        return { queue: newQueue, currentIndex: newCurrentIndex, isPlaying: true };
      }),
      addToQueue: (tracks) => set((state) => ({ 
        queue: [...state.queue, ...tracks],
        currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
        isPlaying: state.currentIndex === -1 ? true : state.isPlaying
      })),
      clearQueue: () => set({ queue: [], currentIndex: -1, isPlaying: false }),
      
      playTrack: (index) => set({ currentIndex: index, isPlaying: true }),
      
      nextTrack: () => set((state) => {
        if (state.currentIndex < state.queue.length - 1) {
          return { currentIndex: state.currentIndex + 1, isPlaying: true };
        }
        return state;
      }),
      
      prevTrack: () => set((state) => {
        if (state.currentIndex > 0) {
          return { currentIndex: state.currentIndex - 1, isPlaying: true };
        }
        return state;
      }),
      
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      
      setVolume: (volume) => set({ volume }),

      setInitialPosition: (initialPosition) => set({ initialPosition }),

      toggleAutoDj: () => set((state) => ({ isAutoDjEnabled: !state.isAutoDjEnabled })),

      setSyncDrift: (drift) => set({ syncDrift: drift }),
      
      createPlaylist: (name) => set((state) => ({
        localPlaylists: [...state.localPlaylists, { id: Date.now().toString(), name, tracks: [] }]
      })),
      
      addTrackToPlaylist: (playlistId, track) => set((state) => ({
        localPlaylists: state.localPlaylists.map(pl => 
          pl.id === playlistId ? { ...pl, tracks: [...pl.tracks, track] } : pl
        )
      })),

      setRoomInfo: (roomId, role) => set({ roomId, role }),

      setLikedItems: (tracks, albums) => set({ likedTrackIds: tracks, likedAlbumIds: albums }),
      
      toggleTrackLike: (id) => set((state) => {
        const isLiked = state.likedTrackIds.includes(id);
        return {
          likedTrackIds: isLiked 
            ? state.likedTrackIds.filter(t => t !== id)
            : [...state.likedTrackIds, id]
        };
      }),

      toggleAlbumLike: (id) => set((state) => {
        const isLiked = state.likedAlbumIds.includes(id);
        return {
          likedAlbumIds: isLiked 
            ? state.likedAlbumIds.filter(a => a !== id)
            : [...state.likedAlbumIds, id]
        };
      }),
    }),
    {
      name: 'streamnavi-storage',
      partialize: (state) => ({
        localPlaylists: state.localPlaylists,
        volume: state.volume,
        // Do not persist queue or jam session state across reloads by default,
        // or we could persist queue if requested. Let's persist queue and localPlaylists.
        queue: state.queue,
        currentIndex: state.currentIndex,
      }),
    }
  )
);
