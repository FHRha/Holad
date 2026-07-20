import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import { setItemRating } from '../../api/subsonic';
import type { Track } from '../../types';

export interface SocialSlice {
  likedTrackIds: string[];
  likedAlbumIds: string[];

  setLikedItems: (tracks: string[], albums: string[]) => void;
  toggleTrackLike: (id: string) => void;
  toggleAlbumLike: (id: string) => void;
  setTrackRating: (id: string, rating: number) => void;
}

export const createSocialSlice: StateCreator<
  PlayerState,
  [],
  [],
  SocialSlice
> = (set) => ({
  likedTrackIds: [],
  likedAlbumIds: [],

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
    
    // Call the API lazily
    setItemRating(id, rating).catch((err: any) => console.error('Failed to set rating:', err));

    return {
      queue: updateQueue(state.queue),
      originalQueue: updateQueue(state.originalQueue)
    };
  }),
});
