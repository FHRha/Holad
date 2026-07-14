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
  userRating?: number;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

interface PlayerState {
  queue: Track[];
  originalQueue: Track[];
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

  // Playback Modes
  isShuffle: boolean;
  repeatMode: 'none' | 'all' | 'one';

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
  setInitialPosition: (position: number) => void;
  toggleAutoDj: () => void;
  setSyncDrift: (drift: number) => void;
  toggleShuffle: () => void;
  cycleRepeatMode: () => void;
  
  // Playlist Actions
  createPlaylist: (name: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  
  // Jam Session Actions
  setRoomInfo: (roomId: string | null, role: 'host' | 'listener' | null) => void;
  
  // Likes and Ratings
  setLikedItems: (tracks: string[], albums: string[]) => void;
  toggleTrackLike: (id: string) => void;
  toggleAlbumLike: (id: string) => void;
  setTrackRating: (id: string, rating: number) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      isPlaying: false,
      volume: 1,
      initialPosition: 0,
      localPlaylists: [],
      
      likedTrackIds: [],
      likedAlbumIds: [],
      
      roomId: null,
      role: null,
      isAutoDjEnabled: false,
      syncDrift: 0,
      isShuffle: false,
      repeatMode: 'none',

      setQueue: (tracks) => set({ queue: tracks, originalQueue: tracks, currentIndex: tracks.length > 0 ? 0 : -1, isShuffle: false }),
      setQueueAndPlay: (tracks, startIndex = 0) => set({ queue: tracks, originalQueue: tracks, currentIndex: startIndex, isPlaying: true, isShuffle: false }),
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
        
        let newOriginalQueue = state.originalQueue;
        if (state.isShuffle) {
          newOriginalQueue = [...state.originalQueue];
          for (const id of trackIds) {
            const idx = newOriginalQueue.findIndex(t => t.id === id);
            if (idx !== -1) newOriginalQueue.splice(idx, 1);
          }
          const origIdx = newOriginalQueue.findIndex(t => t.id === state.queue[state.currentIndex]?.id);
          newOriginalQueue.splice(origIdx !== -1 ? origIdx + 1 : newOriginalQueue.length, 0, ...tracks);
        } else {
          newOriginalQueue = newQueue;
        }

        return { queue: newQueue, originalQueue: newOriginalQueue, currentIndex: newCurrentIndex, isPlaying: true };
      }),
      addToQueue: (tracks) => set((state) => ({ 
        queue: [...state.queue, ...tracks],
        originalQueue: [...(state.originalQueue.length > 0 ? state.originalQueue : state.queue), ...tracks],
        currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
        isPlaying: state.currentIndex === -1 ? true : state.isPlaying
      })),
      clearQueue: () => set({ queue: [], originalQueue: [], currentIndex: -1, isPlaying: false, isShuffle: false }),
      
      playTrack: (index) => set({ currentIndex: index, isPlaying: true }),
      
      nextTrack: () => set((state) => {
        if (state.repeatMode === 'one') {
          return { currentIndex: state.currentIndex, initialPosition: 0, isPlaying: true };
        }
        if (state.currentIndex < state.queue.length - 1) {
          return { currentIndex: state.currentIndex + 1, isPlaying: true };
        } else if (state.repeatMode === 'all') {
          return { currentIndex: 0, isPlaying: true };
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
      
      toggleShuffle: () => set((state) => {
        if (!state.isShuffle) {
          if (state.queue.length <= 1) return { isShuffle: true };
          
          const currentTrack = state.queue[state.currentIndex];
          const rest = state.queue.filter((_, idx) => idx !== state.currentIndex);
          
          // Fisher-Yates
          for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
          }
          
          return { 
            isShuffle: true, 
            originalQueue: state.queue, 
            queue: [currentTrack, ...rest], 
            currentIndex: 0 
          };
        } else {
          const currentTrack = state.queue[state.currentIndex];
          const origQueue = state.originalQueue.length > 0 ? state.originalQueue : state.queue;
          const newIndex = origQueue.findIndex(t => t.id === currentTrack?.id);
          
          return { 
            isShuffle: false, 
            queue: origQueue,
            currentIndex: newIndex !== -1 ? newIndex : 0
          };
        }
      }),
      
      cycleRepeatMode: () => set((state) => {
        const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
        const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        return { repeatMode: modes[nextIndex] };
      }),
      
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

      setTrackRating: (id, rating) => set((state) => {
        // Optimistically update rating in queues
        const updateQueue = (q: Track[]) => q.map(t => t.id === id ? { ...t, userRating: rating } : t);
        
        // Also call the API
        import('../api/subsonic').then(api => {
          api.setItemRating(id, rating).catch(err => console.error('Failed to set rating:', err));
        });

        return {
          queue: updateQueue(state.queue),
          originalQueue: updateQueue(state.originalQueue)
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
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
      }),
    }
  )
);
