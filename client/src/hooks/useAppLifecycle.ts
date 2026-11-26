import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { useContextMenuStore } from '../store/contextMenuStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { isTauriDesktop, isTauriMobile } from '../utils/platform';
import { networkManager } from '../utils/networkStatus';
import { checkAndRestoreSockets } from './useWindowVisibility';

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
        if (currentTrack && (playerStore.isPlaying || currentTime > 0)) {
          localStorage.setItem('holad_track', currentTrack.id);
          localStorage.setItem('holad_time', currentTime.toString());
          // Never update holad_time_updated with app shutdown/exit time:
          // playback timestamp must only be updated during active playback or seek.
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

    let unlistenTauri: (() => void) | null = null;
    if (isTauriDesktop()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(() => {
          const closeToTray = useSettingsStore.getState().closeToTray;
          handleExit(!closeToTray);
        }).then(unlisten => {
          unlistenTauri = unlisten;
        });
      });
    }

    const onMobileAppStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive?: boolean }>)?.detail;
      if (!detail || typeof detail.isActive !== 'boolean') return;
      if (!detail.isActive) {
        handleExit(false);
      } else {
        networkManager.checkConnection().catch(() => {});
        checkAndRestoreSockets();
      }
    };

    const onMobileBackButton = () => {
      const ctxMenu = useContextMenuStore.getState();
      if (ctxMenu.isOpen) {
        ctxMenu.closeMenu();
        return;
      }

      const ui = useUIStore.getState();
      if (ui.isMobilePlayerExpanded) {
        ui.setIsMobilePlayerExpanded(false);
        return;
      }

      if (ui.unignoreModal.isOpen) {
        ui.closeUnignoreModal();
        return;
      }
      if (ui.isUpdateModalOpen) {
        const stage = ui.updateInfo?.progress?.stage;
        if (stage !== 'downloading' && stage !== 'installing') {
          ui.setUpdateModalOpen(false);
        }
        return;
      }
      if (ui.isOfflineModalOpen) {
        ui.setOfflineModalOpen(false);
        return;
      }
      if (ui.isSettingsOpen) {
        ui.setSettingsOpen(false);
        return;
      }
      if (ui.isPlaylistModalOpen) {
        ui.setPlaylistModalOpen(false);
        return;
      }
      if (ui.isJamModalOpen) {
        ui.setIsJamModalOpen(false);
        return;
      }
      if (ui.isSearchOpen) {
        ui.setSearchOpen(false);
        return;
      }
      if (ui.isNowPlayingOpen) {
        ui.setNowPlayingOpen(false);
        return;
      }

      const pathname = window.location.pathname;
      if (pathname !== '/' && pathname !== '' && window.history.length > 1) {
        window.history.back();
        return;
      }

      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('plugin:mediaSession|moveToBackground'))
        .catch(() => {});
    };

    if (isTauriMobile()) {
      window.addEventListener('holad:appstatechange', onMobileAppStateChange);
      window.addEventListener('holad:backbutton', onMobileBackButton);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (isTauriMobile()) {
        window.removeEventListener('holad:appstatechange', onMobileAppStateChange);
        window.removeEventListener('holad:backbutton', onMobileBackButton);
      }
      if (unlistenTauri) {
        unlistenTauri();
      }
    };
  }, []);
}
