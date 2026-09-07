import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import { setItemRating } from '../../api/subsonic';
import { syncToggleExclusion } from '../../api/exclusions';
import { useHoladStore } from '../holadStore';
import type { Track } from '../../types';

export interface SocialSlice {
  likedTrackIds: string[];
  likedAlbumIds: string[];
  excludedTrackIds: string[];
  excludedAlbumIds: string[];

  setLikedItems: (tracks: string[], albums: string[]) => void;
  setExcludedItems: (tracks: string[], albums: string[]) => void;
  toggleTrackLike: (id: string) => void;
  toggleAlbumLike: (id: string) => void;
  toggleTrackExclude: (id: string) => void;
  toggleAlbumExclude: (id: string) => void;
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
  excludedTrackIds: [],
  excludedAlbumIds: [],

  setLikedItems: (tracks, albums) => set({ likedTrackIds: tracks, likedAlbumIds: albums }),
  setExcludedItems: (tracks, albums) => set({ excludedTrackIds: tracks, excludedAlbumIds: albums }),
  
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

  toggleTrackExclude: (id) => {
    let nextExcluded = false;
    set((state) => {
      const isExcluded = state.excludedTrackIds.includes(id);
      nextExcluded = !isExcluded;
      return {
        excludedTrackIds: isExcluded
          ? state.excludedTrackIds.filter(t => t !== id)
          : [...state.excludedTrackIds, id]
      };
    });
    try {
      useHoladStore.getState().sendRemoteCommand('exclusionToggled', {
        entityId: id,
        entityType: 'track',
        isExcluded: nextExcluded
      });
    } catch (e) {
      console.error('[Holad] Failed to send exclusionToggled over socket:', e);
    }
    syncToggleExclusion(id, 'track').catch(err => console.error(err));
  },

  toggleAlbumExclude: (id) => {
    let nextExcluded = false;
    set((state) => {
      const isExcluded = state.excludedAlbumIds.includes(id);
      nextExcluded = !isExcluded;
      return {
        excludedAlbumIds: isExcluded
          ? state.excludedAlbumIds.filter(a => a !== id)
          : [...state.excludedAlbumIds, id]
      };
    });
    try {
      useHoladStore.getState().sendRemoteCommand('exclusionToggled', {
        entityId: id,
        entityType: 'album',
        isExcluded: nextExcluded
      });
    } catch (e) {
      console.error('[Holad] Failed to send exclusionToggled over socket:', e);
    }
    syncToggleExclusion(id, 'album').catch(err => console.error(err));
  },

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
