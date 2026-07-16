import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';

export interface PlaybackSlice {
  isPlaying: boolean;
  volume: number;
  initialPosition: number;
  repeatMode: 'none' | 'all' | 'one';
  playbackRate: number;
  sleepTimer: { type: 'time' | 'track_end' | null, endTime: number | null };
  setIsPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number) => void;
  setInitialPosition: (position: number) => void;
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  cycleRepeatMode: () => void;
  cyclePlaybackRate: () => void;
  setSleepTimer: (minutes: number | 'track_end' | null) => void;
}

export const createPlaybackSlice: StateCreator<
  PlayerState,
  [],
  [],
  PlaybackSlice
> = (set) => ({
  isPlaying: false,
  volume: 0.5,
  initialPosition: 0,
  repeatMode: 'none',
  playbackRate: 1,
  sleepTimer: { type: null, endTime: null },
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),
  setInitialPosition: (initialPosition) => set({ initialPosition }),
  setRepeatMode: (repeatMode) => set({ repeatMode }),
  cycleRepeatMode: () => set((state) => {
    const modes: ('none' | 'all' | 'one')[] = ['none', 'all', 'one'];
    const currentIndex = modes.indexOf(state.repeatMode);
    return { repeatMode: modes[(currentIndex + 1) % modes.length] };
  }),
  cyclePlaybackRate: () => set((state) => {
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(state.playbackRate);
    const nextIndex = currentIndex === -1 ? 1 : (currentIndex + 1) % rates.length;
    return { playbackRate: rates[nextIndex] };
  }),
  setSleepTimer: (value) => set(() => {
    if (value === null) return { sleepTimer: { type: null, endTime: null } };
    if (value === 'track_end') return { sleepTimer: { type: 'track_end', endTime: null } };
    return { sleepTimer: { type: 'time', endTime: Date.now() + value * 60000 } };
  }),
});
