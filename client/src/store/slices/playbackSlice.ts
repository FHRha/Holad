import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';

export interface PlaybackSlice {
  isPlaying: boolean;
  volume: number;
  initialPosition: number;
  repeatMode: 'none' | 'all' | 'one';
  setIsPlaying: (isPlaying: boolean) => void;
  setVolume: (volume: number) => void;
  setInitialPosition: (position: number) => void;
  setRepeatMode: (mode: 'none' | 'all' | 'one') => void;
  cycleRepeatMode: () => void;
}

export const createPlaybackSlice: StateCreator<
  PlayerState,
  [],
  [],
  PlaybackSlice
> = (set) => ({
  isPlaying: false,
  volume: 1,
  initialPosition: 0,
  repeatMode: 'none',

  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),
  setInitialPosition: (initialPosition) => set({ initialPosition }),
  setRepeatMode: (repeatMode) => set({ repeatMode }),
  cycleRepeatMode: () => set((state) => {
    const next: Record<string, 'none' | 'all' | 'one'> = {
      'none': 'all',
      'all': 'one',
      'one': 'none'
    };
    return { repeatMode: next[state.repeatMode] };
  }),
});
