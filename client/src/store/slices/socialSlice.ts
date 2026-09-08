import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import { setItemRating } from '../../api/subsonic';
import { syncToggleExclusion, syncReconcileExclusion, type ExclusionMetaInput } from '../../api/exclusions';
import { generateTrackFingerprint, generateAlbumFingerprint } from '../../utils/trackFingerprint';
import { useHoladStore } from '../holadStore';
import type { Track } from '../../types';

export interface SocialSlice {
  likedTrackIds: string[];
  likedAlbumIds: string[];
  excludedTrackIds: string[];
  excludedAlbumIds: string[];
  excludedFingerprints: string[];

  setLikedItems: (tracks: string[], albums: string[]) => void;
  setExcludedItems: (tracks: string[], albums: string[], fingerprints?: string[]) => void;
  toggleTrackLike: (id: string) => void;
  toggleAlbumLike: (id: string) => void;
  toggleTrackExclude: (id: string, meta?: ExclusionMetaInput | Track) => void;
  toggleAlbumExclude: (id: string, meta?: { artist?: string; album?: string }) => void;
  reconcileTrackExclusion: (newTrackId: string, fingerprint?: string, oldTrackId?: string) => void;
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
  excludedFingerprints: [],

  setLikedItems: (tracks, albums) => set({ likedTrackIds: tracks, likedAlbumIds: albums }),
  setExcludedItems: (tracks, albums, fingerprints) => set({ 
    excludedTrackIds: tracks, 
    excludedAlbumIds: albums,
    excludedFingerprints: Array.isArray(fingerprints) ? fingerprints : []
  }),
  
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

  toggleTrackExclude: (id, meta) => {
    let nextExcluded = false;
    let fingerprint: string | undefined = meta?.fingerprint;
    let metaPayload: ExclusionMetaInput | undefined;

    set((state) => {
      const isIdExcluded = state.excludedTrackIds.includes(id);
      
      const trackObj: any = meta || state.queue.find(t => t.id === id) || state.originalQueue.find(t => t.id === id);
      if (trackObj) {
        if (!fingerprint) {
          fingerprint = trackObj.fingerprint || generateTrackFingerprint({
            id,
            title: trackObj.title,
            artist: trackObj.artist,
            album: trackObj.album,
            track: trackObj.track ?? trackObj.trackNumber,
            duration: trackObj.duration,
            path: trackObj.path ?? trackObj.fileName,
            lyrics: trackObj.lyrics,
            lyricsHash: trackObj.lyricsHash
          });
        }
        metaPayload = {
          title: trackObj.title,
          artist: trackObj.artist,
          album: trackObj.album,
          trackNumber: trackObj.track ?? trackObj.trackNumber,
          duration: trackObj.duration,
          path: trackObj.path,
          fileName: trackObj.fileName,
          lyrics: trackObj.lyrics,
          lyricsHash: trackObj.lyricsHash,
          fingerprint
        };
      }

      const isFpExcluded = fingerprint ? state.excludedFingerprints.includes(fingerprint) : false;
      const isExcluded = isIdExcluded || isFpExcluded;
      nextExcluded = !isExcluded;

      const nextTrackIds = isExcluded
        ? state.excludedTrackIds.filter(t => t !== id)
        : [...new Set([...state.excludedTrackIds, id])];

      let nextFingerprints = state.excludedFingerprints;
      if (fingerprint) {
        nextFingerprints = isExcluded
          ? state.excludedFingerprints.filter(fp => fp !== fingerprint)
          : [...new Set([...state.excludedFingerprints, fingerprint])];
      }

      return {
        excludedTrackIds: nextTrackIds,
        excludedFingerprints: nextFingerprints
      };
    });

    try {
      useHoladStore.getState().sendRemoteCommand('exclusionToggled', {
        entityId: id,
        entityType: 'track',
        isExcluded: nextExcluded,
        fingerprint
      });
    } catch (e) {
      console.error('[Holad] Failed to send exclusionToggled over socket:', e);
    }
    syncToggleExclusion(id, 'track', metaPayload).catch(err => console.error(err));
  },

  reconcileTrackExclusion: (newTrackId, fingerprint, oldTrackId) => {
    set((state) => {
      const updatedTrackIds = oldTrackId
        ? state.excludedTrackIds.map(t => t === oldTrackId ? newTrackId : t)
        : [...new Set([...state.excludedTrackIds, newTrackId])];
      const updatedFingerprints = fingerprint
        ? [...new Set([...state.excludedFingerprints, fingerprint])]
        : state.excludedFingerprints;
      return {
        excludedTrackIds: updatedTrackIds,
        excludedFingerprints: updatedFingerprints
      };
    });
    syncReconcileExclusion(oldTrackId || '', newTrackId, 'track', fingerprint).catch(err => console.error(err));
  },

  toggleAlbumExclude: (id, meta) => {
    let nextExcluded = false;
    let fingerprint: string | undefined;
    set((state) => {
      const isExcluded = state.excludedAlbumIds.includes(id);
      nextExcluded = !isExcluded;
      if (meta?.artist || meta?.album) {
        fingerprint = generateAlbumFingerprint(meta.artist, meta.album);
      }
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
        isExcluded: nextExcluded,
        fingerprint
      });
    } catch (e) {
      console.error('[Holad] Failed to send exclusionToggled over socket:', e);
    }
    syncToggleExclusion(id, 'album', { album: meta?.album, artist: meta?.artist, fingerprint }).catch(err => console.error(err));
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
