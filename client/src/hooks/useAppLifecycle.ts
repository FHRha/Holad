import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useSettingsStore } from '../store/settingsStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { App } from '@capacitor/app';
import { isCapacitor, isTauri } from '../utils/StorageManager';

export function useAppLifecycle() {
  useEffect(() => {
    const disconnect = (isTerminating = false) => {
      // Helper method: do not destroy connection if app is just minimized/closed to tray
      if (!isTerminating) return;
      const holadState = useHoladStore.getState();
      if (typeof holadState.disconnect === 'function') {
        holadState.disconnect();
      }
    };

    const handleExit = (isTerminating = false) => {
      const playerStore = usePlayerStore.getState();
      const audioStore = useAudioStore.getState();
      const engine = getAudioEngine();
      
      let currentTime = 0;
      if (engine) {
        const engTime = engine.getCurrentTime();
        if (typeof engTime === 'number' && !isNaN(engTime) && engTime > 0) {
          currentTime = engTime;
        }
      }

      if (currentTime <= 0) {
        const track = playerStore.queue[playerStore.currentIndex];
        const duration = audioStore.duration || track?.duration || 0;
        if (duration > 0 && audioStore.progress > 0) {
          currentTime = (audioStore.progress / 100) * duration;
        }
      }

      if (currentTime <= 0) {
        const savedTime = localStorage.getItem('holad_time');
        const savedTrack = localStorage.getItem('holad_track');
        const currentTrack = playerStore.queue[playerStore.currentIndex];
        if (savedTime && (!savedTrack || !currentTrack || savedTrack === currentTrack.id)) {
          const parsed = parseFloat(savedTime);
          if (!isNaN(parsed) && parsed > 0) {
            currentTime = parsed;
          }
        }
      }

      if (playerStore.queue.length > 0 && playerStore.currentIndex >= 0) {
        const currentTrack = playerStore.queue[playerStore.currentIndex];
        if (currentTrack) {
          localStorage.setItem('holad_track', currentTrack.id);
          localStorage.setItem('holad_time', currentTime.toString());
          localStorage.setItem('holad_time_updated', Date.now().toString());
        }
      }

      const holadState = useHoladStore.getState();
      if (holadState.socket && holadState.roomId) {
         holadState.socket.emit('holad_updateState', {
            roomId: holadState.roomId,
            deviceId: holadState.deviceId,
            isPlaying: isTerminating ? false : playerStore.isPlaying,
            currentIndex: playerStore.currentIndex,
            queue: playerStore.queue,
            currentTime: currentTime,
         });
         if (isTerminating) {
            holadState.socket.emit('holad_leave', {
               roomId: holadState.roomId,
               deviceId: holadState.deviceId,
            });
         }
      }

      if (isTerminating) {
        disconnect(true);
      }
    };

    const handleBeforeUnload = () => {
      handleExit(true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    let capacitorListener: any = null;
    if (isCapacitor()) {
      App.addListener('appStateChange', ({ isActive }: any) => {
        if (!isActive) {
          handleExit(false);
        } else {
          import('../utils/networkStatus').then(m => m.networkManager.checkConnection()).catch(() => {});
          import('./useWindowVisibility').then(m => m.checkAndRestoreSockets()).catch(() => {});
        }
      }).then((listener: any) => {
        capacitorListener = listener;
      });
    }

    let unlistenTauri: (() => void) | null = null;
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(() => {
          const closeToTray = useSettingsStore.getState().closeToTray;
          handleExit(!closeToTray);
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
