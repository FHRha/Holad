import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { App } from '@capacitor/app';
import { isCapacitor, isTauri } from '../utils/StorageManager';

export function useAppLifecycle() {
  useEffect(() => {
    const handleExit = () => {
      const playerStore = usePlayerStore.getState();
      const audioStore = useAudioStore.getState();
      const engine = getAudioEngine();
      
      let currentTime = 0;
      if (engine) {
          currentTime = engine.getCurrentTime();
      } else {
          const track = playerStore.queue[playerStore.currentIndex];
          const duration = audioStore.duration || track?.duration || 1;
          currentTime = (audioStore.progress / 100) * duration;
      }

      if (playerStore.queue.length > 0 && playerStore.currentIndex >= 0) {
        const currentTrack = playerStore.queue[playerStore.currentIndex];
        if (currentTrack) {
          localStorage.setItem('holad_track', currentTrack.id);
          localStorage.setItem('holad_time', currentTime.toString());
        }
      }

      const holadState = useHoladStore.getState();
      if (holadState.socket && holadState.roomId) {
         holadState.socket.emit('holad_updateState', {
            roomId: holadState.roomId,
            deviceId: holadState.deviceId,
            isPlaying: false,
            currentIndex: playerStore.currentIndex,
            queue: playerStore.queue,
            currentTime: currentTime,
         });
      }
    };

    const handleBeforeUnload = () => {
      handleExit();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let capacitorListener: any = null;
    if (isCapacitor()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          handleExit();
        }
      }).then(listener => {
        capacitorListener = listener;
      });
    }

    let unlistenTauri: (() => void) | null = null;
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(() => {
          handleExit();
        }).then(unlisten => {
          unlistenTauri = unlisten;
        });
      });
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (capacitorListener && typeof capacitorListener.remove === 'function') {
        capacitorListener.remove();
      }
      if (unlistenTauri) {
        unlistenTauri();
      }
    };
  }, []);
}
