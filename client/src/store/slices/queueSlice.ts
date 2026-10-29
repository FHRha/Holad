import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import type { Track } from '../../types';
import { useHoladStore } from '../holadStore';
import { isTrackExcluded } from '../../utils/trackFingerprint';
import { isJamPath } from '../../utils/basePath';
import { savePlaybackState } from '../../api/playbackState';

const triggerPlay = () => {
  const store = useHoladStore.getState();
  const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || store.activeDeviceId === null;
  if (isDeviceActive) {
    if (store.roomId && store.activeDeviceId === null) {
      store.setActiveDevice(store.deviceId);
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

export const toCompactQueue = (tracks: Track[]) => {
  if (!Array.isArray(tracks)) return [];
  return tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    duration: t.duration,
    coverArt: t.coverArt
  }));
};

let queueSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export const syncQueueToServer = (
  queue: Track[],
  currentIndex: number,
  queueVersion: string,
  updatedAt: number,
  playerState?: Partial<PlayerState>
) => {
  if (useHoladStore.getState().isApplyingRemoteState) return;
  if (isJamPath()) return;
  if (playerState && playerState.role === 'listener') return;
  const holadState = useHoladStore.getState();
  if (holadState.roomId && holadState.activeDeviceId && holadState.activeDeviceId !== holadState.deviceId) return;

  if (queueSyncTimeout) {
    clearTimeout(queueSyncTimeout);
  }

  queueSyncTimeout = setTimeout(() => {
    const curTrack = queue[currentIndex];
    savePlaybackState({
      queue: toCompactQueue(queue),
      queueVersion,
      currentIndex: currentIndex >= 0 ? currentIndex : 0,
      songId: curTrack?.id || null,
      position: Math.round((playerState?.initialPosition || 0) / 1000),
      isPlaying: playerState?.isPlaying ?? false,
      isShuffled: playerState?.isShuffle ?? false,
      repeatMode: playerState?.repeatMode ?? 'off',
      updatedAt
    }).catch(() => {});
  }, 250);
};

export interface QueueSlice {
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  isShuffle: boolean;
  isAutoDjEnabled: boolean;
  isProcessing: boolean;
  playActionId: number;
  playbackUpdatedAt: number;
  queueVersion: string;

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
  setPlaybackUpdatedAt: (timestamp: number) => void;
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
  playbackUpdatedAt: 0,
  queueVersion: '',

  setQueue: (tracks) => {
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;
    const sanitized = sanitizeTracks(tracks);
    const state = get();
    const isJamGuest = state.roomId && state.role !== 'host';
    const filtered = isJamGuest ? sanitized : sanitized.filter(t => !isTrackExcluded(t, state.excludedTrackIds, state.excludedAlbumIds, state.excludedFingerprints));
    const newIndex = filtered.length > 0 ? 0 : -1;
    set({
      queue: filtered,
      originalQueue: filtered,
      currentIndex: newIndex,
      isShuffle: false,
      playbackUpdatedAt: now,
      queueVersion: newVersion
    });
    syncQueueToServer(filtered, newIndex, newVersion, now, get());
  },

  setQueueAndPlay: (tracks, startIndex = 0) => {
    const state = get();
    const sanitized = sanitizeTracks(tracks);
    const isJamGuest = state.roomId && state.role !== 'host';
    const isExcluded = (t: any) => !isJamGuest && isTrackExcluded(t, state.excludedTrackIds, state.excludedAlbumIds, state.excludedFingerprints);

    let effectiveIndex = startIndex;
    if (sanitized[effectiveIndex] && isExcluded(sanitized[effectiveIndex])) {
      const firstPlayable = sanitized.findIndex(t => !isExcluded(t));
      if (firstPlayable !== -1) {
        effectiveIndex = firstPlayable;
      }
    }
    
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;
    const targetTrackId = sanitized[effectiveIndex]?.id;
    const filtered = isJamGuest ? sanitized : sanitized.filter(t => !isExcluded(t));
    if (filtered.length === 0) return;
    let newIndex = filtered.findIndex(t => t.id === targetTrackId);
    if (newIndex === -1) newIndex = 0;

    triggerPlay();
    set((s) => ({
      queue: filtered,
      originalQueue: filtered,
      currentIndex: newIndex,
      initialPosition: 0,
      isPlaying: true,
      isShuffle: false,
      playActionId: s.playActionId + 1,
      playbackUpdatedAt: now,
      queueVersion: newVersion
    }));
    syncQueueToServer(filtered, newIndex, newVersion, now, get());
  },

  playNext: (tracks) => {
    const sanitized = sanitizeTracks(tracks);
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;

    set((state) => {
      triggerPlay();
      const isJamGuest = state.roomId && state.role !== 'host';
      const filtered = isJamGuest ? sanitized : sanitized.filter(t => !isTrackExcluded(t, state.excludedTrackIds, state.excludedAlbumIds, state.excludedFingerprints));
      if (filtered.length === 0) return state;

      let newQueue = [...state.queue];
      let newCurrentIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
      
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

      syncQueueToServer(newQueue, newCurrentIndex, newVersion, now, { ...state, queue: newQueue, currentIndex: newCurrentIndex });

      return {
        queue: newQueue,
        originalQueue: newOriginalQueue,
        currentIndex: newCurrentIndex,
        isPlaying: true,
        playbackUpdatedAt: now,
        queueVersion: newVersion
      };
    });
  },

  addToQueue: (tracks) => {
    const sanitized = sanitizeTracks(tracks);
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;

    set((state) => {
      const isJamGuest = state.roomId && state.role !== 'host';
      const filtered = isJamGuest ? sanitized : sanitized.filter(t => !isTrackExcluded(t, state.excludedTrackIds, state.excludedAlbumIds, state.excludedFingerprints));
      if (filtered.length === 0) return state;
      const newQueue = [...state.queue, ...filtered];
      const newIndex = state.currentIndex === -1 ? 0 : state.currentIndex;
      syncQueueToServer(newQueue, newIndex, newVersion, now, { ...state, queue: newQueue, currentIndex: newIndex });
      return { 
        queue: newQueue,
        originalQueue: [...(state.originalQueue.length > 0 ? state.originalQueue : state.queue), ...filtered],
        currentIndex: newIndex,
        isPlaying: state.isPlaying,
        playbackUpdatedAt: now,
        queueVersion: newVersion
      };
    });
  },

  clearQueue: () => {
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;
    syncQueueToServer([], -1, newVersion, now);
    set({
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      isPlaying: false,
      isShuffle: false,
      playbackUpdatedAt: now,
      queueVersion: newVersion
    });
  },

  removeFromQueue: (index) => {
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;

    set((state) => {
      const newQueue = [...state.queue];
      newQueue.splice(index, 1);
      const newIndex = state.currentIndex === index 
        ? -1 
        : state.currentIndex > index 
          ? state.currentIndex - 1 
          : state.currentIndex;
      syncQueueToServer(newQueue, newIndex, newVersion, now, { ...state, queue: newQueue, currentIndex: newIndex });
      return {
        queue: newQueue,
        currentIndex: newIndex,
        playbackUpdatedAt: now,
        queueVersion: newVersion
      };
    });
  },

  setCurrentIndex: (index) => set({ currentIndex: index, playbackUpdatedAt: Date.now() }),
  
  playTrack: (index) => {
    triggerPlay();
    const now = Date.now();
    set((state) => {
      if (index >= 0 && index < state.queue.length) {
        syncQueueToServer(state.queue, index, state.queueVersion, now, {
          ...state,
          currentIndex: index,
          initialPosition: 0,
          isPlaying: true
        });
      }
      return {
        currentIndex: index,
        initialPosition: 0,
        isPlaying: true,
        playbackUpdatedAt: now,
        playActionId: state.playActionId + 1
      };
    });
  },
  
  nextTrack: () => {
    triggerPlay();
    const now = Date.now();
    set((state) => {
      if (state.repeatMode === 'one') {
        syncQueueToServer(state.queue, state.currentIndex, state.queueVersion, now, {
          ...state,
          initialPosition: 0,
          isPlaying: true
        });
        return { currentIndex: state.currentIndex, initialPosition: 0, isPlaying: true, playbackUpdatedAt: now, playActionId: state.playActionId + 1 };
      }
      if (state.currentIndex < state.queue.length - 1) {
        let nextIdx = state.currentIndex + 1;
        while (nextIdx < state.queue.length && state.queue[nextIdx]?.isUnavailable) {
          nextIdx++;
        }
        if (nextIdx < state.queue.length) {
          syncQueueToServer(state.queue, nextIdx, state.queueVersion, now, {
            ...state,
            currentIndex: nextIdx,
            initialPosition: 0,
            isPlaying: true
          });
          return { currentIndex: nextIdx, initialPosition: 0, isPlaying: true, playbackUpdatedAt: now, playActionId: state.playActionId + 1 };
        }
      } else if (state.repeatMode === 'all') {
        let firstIdx = 0;
        while (firstIdx < state.queue.length && state.queue[firstIdx]?.isUnavailable) {
          firstIdx++;
        }
        if (firstIdx < state.queue.length) {
          syncQueueToServer(state.queue, firstIdx, state.queueVersion, now, {
            ...state,
            currentIndex: firstIdx,
            initialPosition: 0,
            isPlaying: true
          });
          return { currentIndex: firstIdx, initialPosition: 0, isPlaying: true, playbackUpdatedAt: now, playActionId: state.playActionId + 1 };
        }
      }
      return state;
    });
  },
  
  prevTrack: () => {
    triggerPlay();
    const now = Date.now();
    set((state) => {
      if (state.currentIndex > 0) {
        let prevIdx = state.currentIndex - 1;
        while (prevIdx >= 0 && state.queue[prevIdx]?.isUnavailable) {
          prevIdx--;
        }
        if (prevIdx >= 0) {
          syncQueueToServer(state.queue, prevIdx, state.queueVersion, now, {
            ...state,
            currentIndex: prevIdx,
            initialPosition: 0,
            isPlaying: true
          });
          return { currentIndex: prevIdx, initialPosition: 0, isPlaying: true, playbackUpdatedAt: now, playActionId: state.playActionId + 1 };
        }
      }
      return state;
    });
  },

  toggleAutoDj: () => set((state) => ({ isAutoDjEnabled: !state.isAutoDjEnabled })),

  toggleShuffle: () => {
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;

    set((state) => {
      if (!state.isShuffle) {
        if (state.queue.length <= 1) {
          syncQueueToServer(state.queue, state.currentIndex, newVersion, now, state);
          return { isShuffle: true, playbackUpdatedAt: now, queueVersion: newVersion };
        }
        
        const currentTrack = state.queue[state.currentIndex];
        const rest = state.queue.filter((_, idx) => idx !== state.currentIndex);
        
        // Fisher-Yates
        for (let i = rest.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        
        const newQueue = [currentTrack, ...rest];
        syncQueueToServer(newQueue, 0, newVersion, now, { ...state, queue: newQueue, currentIndex: 0, isShuffle: true });
        return { 
          isShuffle: true, 
          originalQueue: state.queue, 
          queue: newQueue, 
          currentIndex: 0,
          playbackUpdatedAt: now,
          queueVersion: newVersion
        };
      } else {
        const currentTrack = state.queue[state.currentIndex];
        const origQueue = state.originalQueue.length > 0 ? state.originalQueue : state.queue;
        const newIndex = origQueue.findIndex(t => t.id === currentTrack?.id);
        const resolvedIndex = newIndex !== -1 ? newIndex : 0;
        syncQueueToServer(origQueue, resolvedIndex, newVersion, now, { ...state, queue: origQueue, currentIndex: resolvedIndex, isShuffle: false });
        return { 
          isShuffle: false, 
          queue: origQueue,
          currentIndex: resolvedIndex,
          playbackUpdatedAt: now,
          queueVersion: newVersion
        };
      }
    });
  },

  reorderQueue: (oldIndex, newIndex) => {
    const now = Date.now();
    const newVersion = `${now}-${Math.random().toString(36).substring(2, 7)}`;

    set((state) => {
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

      syncQueueToServer(newQueue, newCurrentIndex, newVersion, now, { ...state, queue: newQueue, currentIndex: newCurrentIndex });
      return {
        queue: newQueue,
        currentIndex: newCurrentIndex,
        playbackUpdatedAt: now,
        queueVersion: newVersion
      };
    });
  },

  setIsProcessing: (val) => set({ isProcessing: val }),
  setPlaybackUpdatedAt: (timestamp) => set({ playbackUpdatedAt: timestamp }),
});
