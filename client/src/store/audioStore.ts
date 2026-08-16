import { create } from 'zustand';

import { useHoladStore } from './holadStore';
import { usePlayerStore } from './playerStore';

interface AudioStore {
  audioElement: HTMLAudioElement | null;
  setAudioElement: (el: HTMLAudioElement | null) => void;
  progress: number;
  setProgress: (val: number) => void;
  buffered: number;
  setBuffered: (val: number) => void;
  duration: number;
  setDuration: (val: number) => void;
  isSeeking: boolean;
  setIsSeeking: (val: boolean) => void;
  handleSeekChange: (val: number) => void;
  handleSeekEnd: (val: number) => void;
}

let activeAudioListener: { el: HTMLAudioElement; handler: () => void } | null = null;

export const useAudioStore = create<AudioStore>((set, get) => ({
  audioElement: null,
  setAudioElement: (el) => {
    if (activeAudioListener) {
      activeAudioListener.el.removeEventListener('progress', activeAudioListener.handler);
      activeAudioListener.el.removeEventListener('loadedmetadata', activeAudioListener.handler);
      activeAudioListener.el.removeEventListener('timeupdate', activeAudioListener.handler);
      activeAudioListener = null;
    }

    set({ audioElement: el });

    if (el) {
      const updateBuffer = () => {
        if (el.buffered && el.buffered.length > 0 && el.duration > 0) {
          try {
            const end = el.buffered.end(el.buffered.length - 1);
            const pct = Math.min(100, Math.max(0, (end / el.duration) * 100));
            set({ buffered: pct });
          } catch {
            // ignore
          }
        }
      };

      el.addEventListener('progress', updateBuffer);
      el.addEventListener('loadedmetadata', updateBuffer);
      el.addEventListener('timeupdate', updateBuffer);
      activeAudioListener = { el, handler: updateBuffer };
      updateBuffer();
    }
  },
  progress: 0,
  setProgress: (progress) => set({ progress }),
  buffered: 0,
  setBuffered: (buffered) => set({ buffered }),
  duration: 0,
  setDuration: (duration) => set({ duration }),
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
        useHoladStore.getState().sendRemoteCommand('seek', val * currentTrack.duration * 1000);
      }
    }
  }
}));
