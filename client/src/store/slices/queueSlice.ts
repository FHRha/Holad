import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import type { Track } from '../../types';
import { useHoladStore } from '../holadStore';
import { useAudioStore } from '../audioStore';

const triggerPlay = () => {
  const store = useHoladStore.getState();
  const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || store.activeDeviceId === null;
  if (isDeviceActive) {
    // Also use DOM to ensure we definitely catch the element even if store is lagging
    const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
    const storeAudioEl = useAudioStore.getState().audioElement;
    const target = audioEl || storeAudioEl;
    if (target) {
      target.play().catch(() => {});
    }
  }
};

export interface QueueSlice {
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  isShuffle: boolean;
  isAutoDjEnabled: boolean;
  isProcessing: boolean;

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
> = (set) => ({
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  isShuffle: false,
  isAutoDjEnabled: true,
  isProcessing: false,

  setQueue: (tracks) => set({ queue: tracks, originalQueue: tracks, currentIndex: tracks.length > 0 ? 0 : -1, isShuffle: false }),
  setQueueAndPlay: (tracks, startIndex = 0) => {
    triggerPlay();
    set({ queue: tracks, originalQueue: tracks, currentIndex: startIndex, isPlaying: true, isShuffle: false });
  },
  playNext: (tracks) => set((state) => {
    triggerPlay();
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
  
  playTrack: (index) => {
    triggerPlay();
    set({ currentIndex: index, isPlaying: true });
  },
  
  nextTrack: () => {
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
