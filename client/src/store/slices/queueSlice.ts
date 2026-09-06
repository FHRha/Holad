import i18n from '../../i18n';
import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import type { Track } from '../../types';
import { useHoladStore } from '../holadStore';
import { useAudioStore } from '../audioStore';

const triggerPlay = () => {
  const store = useHoladStore.getState();
  const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || store.activeDeviceId === null;
  if (isDeviceActive) {
    // Use DOM to ensure we definitely catch the element even if store is lagging
    const players = document.querySelectorAll('.main-audio-player');
    if (players.length > 0) {
      players.forEach(p => (p as HTMLAudioElement).play().catch(() => {}));
    } else {
      const storeAudioEl = useAudioStore.getState().audioElement;
      if (storeAudioEl) storeAudioEl.play().catch(() => {});
    }
  }
};

export const sanitizeTracks = (tracks: Track[]): Track[] => {
  if (!Array.isArray(tracks)) return [];
  return tracks.map((track) => {
    if (typeof track.coverArt === 'string') {
      if (track.coverArt.includes('/api/cover/')) {
        const match = track.coverArt.match(/\/api\/cover\/([a-zA-Z0-9_\-\.]+)/);
        if (match && match[1]) {
          return { ...track, coverArt: match[1] };
        }
        return { ...track, coverArt: track.albumId || track.id };
      }
      if (track.coverArt.includes('getCoverArt')) {
        try {
          const url = new URL(track.coverArt, 'http://dummy.local');
          const id = url.searchParams.get('id');
          if (id && id !== 'undefined' && id !== 'null' && !id.includes('getCoverArt')) {
            return { ...track, coverArt: id };
          }
          return { ...track, coverArt: track.albumId || track.id };
        } catch {
          return { ...track, coverArt: track.albumId || track.id };
        }
      }
    }
    return track;
  });
};

let lastNextTrackTime = 0;
let lastPrevTrackTime = 0;


export interface QueueSlice {
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  isShuffle: boolean;
  isAutoDjEnabled: boolean;
  isProcessing: boolean;
  playActionId: number;

  setQueue: (tracks: Track[]) => void;
  setQueueAndPlay: (tracks: Track[], index: number) => void;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number) => void;
  playTrack: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleAutoDj: () => void;
  toggleShuffle: () => void;
  reorderQueue: (oldIndex: number, newIndex: number) => void;
  setIsProcessing: (val: boolean) => void;
}

export const createQueueSlice: StateCreator<
  PlayerState,
  [],
  [],
  QueueSlice
> = (set, get) => ({
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  isShuffle: false,
  isAutoDjEnabled: true,
  isProcessing: false,
  playActionId: 0,

  setQueue: (tracks) => set((state) => {
    const sanitized = sanitizeTracks(tracks);
    const isJamGuest = state.roomId && state.role !== 'host';
    const filtered = isJamGuest ? sanitized : sanitized.filter(t => !state.excludedTrackIds.includes(t.id) && !(t.albumId && state.excludedAlbumIds.includes(t.albumId)));
    return { queue: filtered, originalQueue: filtered, currentIndex: filtered.length > 0 ? 0 : -1, isShuffle: false };
  }),
  setQueueAndPlay: (tracks, startIndex = 0) => {
    const state = get();
    const sanitized = sanitizeTracks(tracks);
    const targetTrack = sanitized[startIndex];
    if (targetTrack && (state.excludedTrackIds.includes(targetTrack.id) || (targetTrack.albumId && state.excludedAlbumIds.includes(targetTrack.albumId)))) {
      if (window.confirm(i18n.t('common.unignore_and_play', { defaultValue: 'Этот трек находится в игноре. Хотите убрать его из игнора и начать воспроизведение?' }))) {
        if (state.excludedTrackIds.includes(targetTrack.id)) state.toggleTrackExclude(targetTrack.id);
        if (targetTrack.albumId && state.excludedAlbumIds.includes(targetTrack.albumId)) state.toggleAlbumExclude(targetTrack.albumId);
      } else {
        return;
      }
    }
    
    set((state) => {
      triggerPlay();
      const targetTrackId = sanitized[startIndex]?.id;
      const isJamGuest = state.roomId && state.role !== 'host';
      const filtered = isJamGuest ? sanitized : sanitized.filter(t => !state.excludedTrackIds.includes(t.id) && !(t.albumId && state.excludedAlbumIds.includes(t.albumId)));
      let newIndex = filtered.findIndex(t => t.id === targetTrackId);
      if (newIndex === -1) newIndex = 0;
      return { queue: filtered, originalQueue: filtered, currentIndex: newIndex, isPlaying: true, isShuffle: false, playActionId: state.playActionId + 1 };
    });
  },
  playNext: (tracks) => {
    let state = get();
    const sanitized = sanitizeTracks(tracks);
    // Assuming tracks[0] is the target since playNext often takes an array of 1
    const targetTrack = sanitized[0];
    if (targetTrack && (state.excludedTrackIds.includes(targetTrack.id) || (targetTrack.albumId && state.excludedAlbumIds.includes(targetTrack.albumId)))) {
      if (window.confirm(i18n.t('common.unignore_and_queue', { defaultValue: 'Этот трек находится в игноре. Хотите убрать его из игнора и добавить в очередь?' }))) {
        if (state.excludedTrackIds.includes(targetTrack.id)) state.toggleTrackExclude(targetTrack.id);
        if (targetTrack.albumId && state.excludedAlbumIds.includes(targetTrack.albumId)) state.toggleAlbumExclude(targetTrack.albumId);
      } else {
        return;
      }
    }
    
    set((state) => {
      triggerPlay();
      const isJamGuest = state.roomId && state.role !== 'host';
      const filtered = isJamGuest ? sanitized : sanitized.filter(t => !state.excludedTrackIds.includes(t.id) && !(t.albumId && state.excludedAlbumIds.includes(t.albumId)));
      if (filtered.length === 0) return state;

      let newQueue = [...state.queue];
      let newCurrentIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
      
      // Remove tracks if they already exist to avoid duplicates
    const trackIds = filtered.map(t => t.id);
    for (const id of trackIds) {
      const idx = newQueue.findIndex(t => t.id === id);
      if (idx !== -1) {
        newQueue.splice(idx, 1);
        if (idx <= newCurrentIndex) newCurrentIndex--;
      }
    }
    
    newQueue.splice(newCurrentIndex + 1, 0, ...filtered);
    
    let newOriginalQueue = state.originalQueue;
    if (state.isShuffle) {
      newOriginalQueue = [...state.originalQueue];
      for (const id of trackIds) {
        const idx = newOriginalQueue.findIndex(t => t.id === id);
        if (idx !== -1) newOriginalQueue.splice(idx, 1);
      }
      const origIdx = newOriginalQueue.findIndex(t => t.id === state.queue[state.currentIndex]?.id);
      newOriginalQueue.splice(origIdx !== -1 ? origIdx + 1 : newOriginalQueue.length, 0, ...filtered);
    } else {
      newOriginalQueue = newQueue;
    }

    return { queue: newQueue, originalQueue: newOriginalQueue, currentIndex: newCurrentIndex, isPlaying: true };
    });
  },
  addToQueue: (tracks) => set((state) => {
    const sanitized = sanitizeTracks(tracks);
    const isJamGuest = state.roomId && state.role !== 'host';
    const filtered = isJamGuest ? sanitized : sanitized.filter(t => !state.excludedTrackIds.includes(t.id) && !(t.albumId && state.excludedAlbumIds.includes(t.albumId)));
    if (filtered.length === 0) return state;
    return { 
      queue: [...state.queue, ...filtered],
      originalQueue: [...(state.originalQueue.length > 0 ? state.originalQueue : state.queue), ...filtered],
      currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
      isPlaying: state.isPlaying
    };
  }),
  clearQueue: () => set({ queue: [], originalQueue: [], currentIndex: -1, isPlaying: false, isShuffle: false }),
  removeFromQueue: (index) => set((state) => {
    const newQueue = [...state.queue];
    newQueue.splice(index, 1);
    return {
      queue: newQueue,
      currentIndex: state.currentIndex === index 
        ? -1 
        : state.currentIndex > index 
          ? state.currentIndex - 1 
          : state.currentIndex
    };
  }),
  setCurrentIndex: (index) => set({ currentIndex: index }),
  
  playTrack: (index) => set((state) => {
    triggerPlay();
    return { currentIndex: index, isPlaying: true, playActionId: state.playActionId + 1 };
  }),
  
  nextTrack: () => {
    const now = Date.now();
    if (now - lastNextTrackTime < 300) return;
    lastNextTrackTime = now;

    triggerPlay();
    set((state) => {
      if (state.repeatMode === 'one') {
        return { currentIndex: state.currentIndex, initialPosition: 0, isPlaying: true };
      }
      if (state.currentIndex < state.queue.length - 1) {
        return { currentIndex: state.currentIndex + 1, isPlaying: true };
      } else if (state.repeatMode === 'all') {
        return { currentIndex: 0, isPlaying: true };
      }
      return state;
    });
  },
  
  prevTrack: () => {
    const now = Date.now();
    if (now - lastPrevTrackTime < 300) return;
    lastPrevTrackTime = now;

    triggerPlay();
    set((state) => {
      if (state.currentIndex > 0) {
        return { currentIndex: state.currentIndex - 1, isPlaying: true };
      }
      return state;
    });
  },

  toggleAutoDj: () => set((state) => ({ isAutoDjEnabled: !state.isAutoDjEnabled })),

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

  reorderQueue: (oldIndex, newIndex) => set((state) => {
    if (oldIndex < 0 || oldIndex >= state.queue.length || newIndex < 0 || newIndex >= state.queue.length) {
      return state;
    }
    
    const newQueue = [...state.queue];
    const [movedItem] = newQueue.splice(oldIndex, 1);
    newQueue.splice(newIndex, 0, movedItem);

    let newCurrentIndex = state.currentIndex;
    if (state.currentIndex === oldIndex) {
      newCurrentIndex = newIndex;
    } else if (oldIndex < state.currentIndex && newIndex >= state.currentIndex) {
      newCurrentIndex--;
    } else if (oldIndex > state.currentIndex && newIndex <= state.currentIndex) {
      newCurrentIndex++;
    }

    return { queue: newQueue, currentIndex: newCurrentIndex };
  }),
  setIsProcessing: (val) => set({ isProcessing: val }),
});
