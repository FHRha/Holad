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

let activeAudioListener: { el: HTMLAudioElement; handler: () => void; events: string[] } | null = null;

export const useAudioStore = create<AudioStore>((set, get) => ({
  audioElement: null,
  setAudioElement: (el) => {
    if (activeAudioListener) {
      activeAudioListener.events.forEach(evt => {
        activeAudioListener!.el.removeEventListener(evt, activeAudioListener!.handler);
      });
      activeAudioListener = null;
    }

    set({ audioElement: el });

    if (el) {
      const updateBuffer = () => {
        const currentTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
        const trackDur = currentTrack?.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0 ? currentTrack.duration : 0;
        const validElDur = el.duration && !isNaN(el.duration) && isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        const stateDur = get().duration > 0 && isFinite(get().duration) ? get().duration : 0;
        const targetDuration = validElDur || trackDur || stateDur;

        if (el.buffered && el.buffered.length > 0 && targetDuration > 0) {
          try {
            const curTime = el.currentTime || 0;
            let currentRangeEnd = 0;
            for (let i = 0; i < el.buffered.length; i++) {
              const start = el.buffered.start(i);
              const end = el.buffered.end(i);
              if (start <= curTime + 1 && end >= curTime) {
                currentRangeEnd = Math.max(currentRangeEnd, end);
              }
            }
            if (currentRangeEnd === 0) {
              for (let i = 0; i < el.buffered.length; i++) {
                const end = el.buffered.end(i);
                if (end > currentRangeEnd) currentRangeEnd = end;
              }
            }
            const pct = Math.min(100, Math.max(0, (currentRangeEnd / targetDuration) * 100));
            set({ buffered: pct });
          } catch {
            // ignore
          }
        } else {
          set({ buffered: 0 });
        }
      };

      const events = ['progress', 'loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'];
      events.forEach(evt => el.addEventListener(evt, updateBuffer));
      activeAudioListener = { el, handler: updateBuffer, events };
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
    
    const store = useHoladStore.getState();
    const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || (store.activeDeviceId === null && store.devices.length <= 1);
    
    const currentTrack = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
    const engine = getAudioEngine();
    const engDur = engine.getDuration();
    const validEngDur = engDur > 0 && isFinite(engDur) ? engDur : 0;
    const stateDur = state.duration > 0 && isFinite(state.duration) ? state.duration : 0;
    const trackDur = currentTrack?.duration && isFinite(currentTrack.duration) && currentTrack.duration > 0 ? currentTrack.duration : 0;
    const targetDuration = validEngDur || stateDur || trackDur;
    const safeVal = typeof val === 'number' && isFinite(val) ? Math.max(0, Math.min(1, val)) : 0;
    const targetTime = safeVal * targetDuration;

    set({ progress: safeVal * 100 });

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

    setTimeout(() => {
      set({ isSeeking: false });
    }, 150);
  }
}));
