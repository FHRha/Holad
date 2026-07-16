import { create } from 'zustand';

import { useHoladStore } from './holadStore';
import { usePlayerStore } from './playerStore';

interface AudioStore {
  audioElement: HTMLAudioElement | null;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  progress: number;
  setProgress: (val: number) => void;
  isSeeking: boolean;
  setIsSeeking: (val: boolean) => void;
  handleSeekChange: (val: number) => void;
  handleSeekEnd: (val: number) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  audioElement: null,
  setAudioElement: (el) => set({ audioElement: el }),
  progress: 0,
  setProgress: (progress) => set({ progress }),
  isSeeking: false,
  setIsSeeking: (isSeeking) => set({ isSeeking }),
  handleSeekChange: (val) => {
    set({ isSeeking: true, progress: val * 100 });
  },
  handleSeekEnd: (val) => {
    const state = get();
    set({ isSeeking: false });
    
    const store = useHoladStore.getState();
    const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || store.activeDeviceId === null;
    
    const currentTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
    
    if (state.audioElement && currentTrack) {
      if (isDeviceActive) {
        state.audioElement.currentTime = val * currentTrack.duration;
      } else {
        useHoladStore.getState().sendRemoteCommand('seek', val * currentTrack.duration);
      }
    }
  }
}));
