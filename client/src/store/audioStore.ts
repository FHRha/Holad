import { create } from 'zustand';

import { useHoladStore } from './holadStore';
import { usePlayerStore } from './playerStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { jamSocket } from '../api/socket';

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
        const targetDuration = el.duration && !isNaN(el.duration) && el.duration !== Infinity ? el.duration : get().duration || 1;
        if (el.buffered && el.buffered.length > 0 && targetDuration > 0) {
          try {
            const end = el.buffered.end(el.buffered.length - 1);
            const pct = Math.min(100, Math.max(0, (end / targetDuration) * 100));
            set({ buffered: pct });
          } catch {
            // ignore
          }
        } else {
          set({ buffered: 0 });
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
    const engine = getAudioEngine();
    const engDur = engine.getDuration();
    const validEngDur = engDur > 0 && isFinite(engDur) ? engDur : 0;
    const stateDur = state.duration > 0 && isFinite(state.duration) ? state.duration : 0;
    const trackDur = currentTrack?.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0 ? currentTrack.duration : 0;
    const targetDuration = validEngDur || stateDur || trackDur;
    const safeVal = typeof val === 'number' && isFinite(val) ? Math.max(0, Math.min(1, val)) : 0;
    const targetTime = safeVal * targetDuration;

    if (isFinite(targetTime)) {
      if (isDeviceActive) {
        engine.seek(targetTime);
      } else {
        useHoladStore.getState().sendRemoteCommand('seek', targetTime * 1000);
      }

      const playerState = usePlayerStore.getState();
      if (playerState.roomId && (playerState.role === 'host' || playerState.role === 'cohost')) {
        jamSocket.syncSeek(targetTime);
      }
    }
  }
}));
