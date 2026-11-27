import { Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useSettingsStore } from '../store/settingsStore';
import { useHistoryStore } from '../store/historyStore';
import { useProfileStore } from '../store/profileStore';
import { syncHistoryWithServer, pushHistoryBatch } from '../api/history';
import { syncQueueToServer } from '../store/slices/queueSlice';
import { getAudioEngine } from '../audio/AudioEngine';

export interface RemoteCommandContext {
  socket: Socket | null;
  deviceId: string;
  roomId: string | null;
  activeDeviceId: string | null;
  lastPausedAt: number | null;
}

export interface RemoteCommand {
  type: string;
  payload?: any;
  fromUserId?: string;
}

/**
 * Handles incoming remote commands received via socket ('holad_remoteCommand').
 * Processes room exclusions, history synchronization, and playback control
 * if this device is currently the active playback master.
 */
export function handleRemoteCommand(
  command: RemoteCommand,
  ctx: RemoteCommandContext
): void {
  const { socket, deviceId, roomId, activeDeviceId, lastPausedAt } = ctx;

  if (command.type === 'exclusionToggled') {
    const { entityId, entityType, isExcluded, fingerprint } = command.payload || {};
    const playerStore = usePlayerStore.getState();
    if (entityType === 'track') {
      const current = playerStore.excludedTrackIds;
      const updated = isExcluded
        ? [...new Set([...current, entityId])]
        : current.filter(id => id !== entityId);
      const currentFps = playerStore.excludedFingerprints || [];
      const updatedFps = fingerprint
        ? (isExcluded
            ? [...new Set([...currentFps, fingerprint])]
            : currentFps.filter(f => f !== fingerprint))
        : currentFps;
      usePlayerStore.setState({ excludedTrackIds: updated, excludedFingerprints: updatedFps });
    } else if (entityType === 'album') {
      const current = playerStore.excludedAlbumIds;
      const updated = isExcluded
        ? [...new Set([...current, entityId])]
        : current.filter(id => id !== entityId);
      usePlayerStore.setState({ excludedAlbumIds: updated });
    }
    return;
  }

  if (command.type === 'exclusionsSynced') {
    const { excludedTrackIds, excludedAlbumIds, excludedFingerprints } = command.payload || {};
    const currentState = usePlayerStore.getState();
    usePlayerStore.setState({
      excludedTrackIds: Array.isArray(excludedTrackIds) ? excludedTrackIds : currentState.excludedTrackIds,
      excludedAlbumIds: Array.isArray(excludedAlbumIds) ? excludedAlbumIds : currentState.excludedAlbumIds,
      excludedFingerprints: excludedFingerprints !== undefined && Array.isArray(excludedFingerprints)
        ? excludedFingerprints
        : currentState.excludedFingerprints
    });
    return;
  }
  
  if (command.type === 'syncHistory') {
    useHistoryStore.getState().addTrackToHistory(command.payload.track, command.payload.playedAt);
    return;
  }
  
  if (command.type === 'requestHistory') {
    console.log('[Holad] Received requestHistory.');
    const historyStore = useHistoryStore.getState();
    const pendingOffline = historyStore.pendingOfflineHistory || [];
    if (pendingOffline.length > 0 && roomId) {
      console.log('[Holad] Pushing pending offline history:', pendingOffline.length);
      pushHistoryBatch(pendingOffline)
        .then((ok) => {
          if (ok) {
            historyStore.clearPendingOfflineHistory();
          }
        })
        .catch(err => console.error('[Holad] Failed to upload pending history:', err));
    }
    return;
  }
  
  if (command.type === 'historyAvailable') {
    console.log('[Holad] Received historyAvailable, syncing with server SQLite DB...');
    syncHistoryWithServer().catch(err => console.error('[Holad] Failed to sync history:', err));
    return;
  }

  if (command.type === 'clearHistory') {
    const fromUser = command.fromUserId;
    if (!fromUser || fromUser === roomId) {
      useHistoryStore.getState().clearHistory();
    } else {
      console.warn('[Holad] Ignored unauthorized clearHistory command from external peer:', fromUser);
    }
    return;
  }

  if (command.type === 'preferencesUpdated') {
    const prefs = command.payload;
    if (prefs?.profiles) {
      useProfileStore.getState().syncWithServerProfiles(
        prefs.profiles,
        prefs.updated_at,
        prefs.activeSlot ?? prefs.active_slot
      );
    }
    if (prefs) {
      const { syncTheme, syncLanguage, setTheme, setAccentColor, setCustomColor, setLanguage } = useSettingsStore.getState();
      if (syncTheme) {
        if (prefs.theme && (prefs.theme === 'dark' || prefs.theme === 'light' || prefs.theme === 'system')) {
          setTheme(prefs.theme);
        }
        if (prefs.accent_color) {
          setAccentColor(prefs.accent_color);
        }
        if (prefs.custom_colors) {
          try {
            const colors = typeof prefs.custom_colors === 'string' ? JSON.parse(prefs.custom_colors) : prefs.custom_colors;
            if (Array.isArray(colors)) {
              colors.forEach((col: string, idx: number) => {
                if (idx < 3) setCustomColor(idx, col);
              });
            }
          } catch {}
        }
      }
      if (syncLanguage && prefs.language) {
        setLanguage(prefs.language);
      }
    }
    return;
  }

  // Playback control commands are only executed if this device is the active master
  if (activeDeviceId === deviceId) {
    const store = usePlayerStore.getState();
    switch (command.type) {
      case 'requestTransfer': {
        // We are active. Someone wants to take over. Send our exact state first, then transfer.
        let currentTime = 0;
        const engine = getAudioEngine();
        if (engine) {
          currentTime = engine.getCurrentTime();
        } else {
          const track = store.queue[store.currentIndex];
          const duration = useAudioStore.getState().duration || track?.duration || 1;
          currentTime = (useAudioStore.getState().progress / 100) * duration;
        }
        const stateToSync = {
          isPlaying: store.isPlaying,
          currentIndex: store.currentIndex,
          queue: store.queue,
          currentTime,
          isShuffle: store.isShuffle,
          repeatMode: store.repeatMode,
          queueVersion: store.queueVersion || '',
          accentColor: useSettingsStore.getState().accentColor,
          customColors: useSettingsStore.getState().customColors,
          lastPausedAt
        };
        socket?.emit('holad_updateState', { roomId, deviceId, ...stateToSync });
        // Then hand over control
        socket?.emit('holad_setActiveDevice', command.payload);
        break;
      }
      case 'requestState': {
        let curTime = 0;
        const eng = getAudioEngine();
        if (eng) {
          curTime = eng.getCurrentTime();
        } else {
          const track = store.queue[store.currentIndex];
          const duration = useAudioStore.getState().duration || track?.duration || 1;
          curTime = (useAudioStore.getState().progress / 100) * duration;
        }
        const currentState = {
          isPlaying: store.isPlaying,
          currentIndex: store.currentIndex,
          queue: store.queue,
          currentTime: curTime,
          isShuffle: store.isShuffle,
          repeatMode: store.repeatMode,
          queueVersion: store.queueVersion || '',
          accentColor: useSettingsStore.getState().accentColor,
          customColors: useSettingsStore.getState().customColors,
          lastPausedAt
        };
        socket?.emit('holad_updateState', { roomId, deviceId, ...currentState });
        break;
      }
      case 'play':
        store.setIsPlaying(true);
        break;
      case 'pause':
        store.setIsPlaying(false);
        break;
      case 'togglePlay':
        store.setIsPlaying(!store.isPlaying);
        break;
      case 'next':
        store.nextTrack();
        break;
      case 'prev':
      case 'previous':
        store.prevTrack();
        break;
      case 'seek': {
        const targetMs = typeof command.payload === 'number' ? command.payload : 0;
        const engine = getAudioEngine();
        if (engine) {
          engine.seek(targetMs / 1000);
        }
        break;
      }
      case 'setQueue':
        usePlayerStore.setState({ 
          queue: command.payload.queue, 
          originalQueue: command.payload.queue,
          currentIndex: command.payload.currentIndex,
          playActionId: usePlayerStore.getState().playActionId + 1
        });
        break;
      case 'setVolume':
        if (typeof command.payload === 'number') {
          store.setVolume(command.payload);
        }
        break;
      case 'shuffle': {
        if (typeof command.payload === 'boolean') {
          if (store.isShuffle !== command.payload) {
            store.toggleShuffle();
          }
        } else {
          store.toggleShuffle();
        }
        const updated = usePlayerStore.getState();
        socket?.emit('holad_updateSnapshot', {
          roomId: roomId || undefined,
          currentIndex: updated.currentIndex,
          isShuffle: updated.isShuffle,
          repeatMode: updated.repeatMode,
          queueVersion: updated.queueVersion || '',
        });
        break;
      }
      case 'repeat': {
        if (typeof command.payload === 'string') {
          const normalized = command.payload === 'off' ? 'none' : command.payload;
          if (normalized === 'none' || normalized === 'all' || normalized === 'one') {
            usePlayerStore.setState({ repeatMode: normalized });
          }
        } else {
          store.cycleRepeatMode();
        }
        const updated = usePlayerStore.getState();
        syncQueueToServer(
          updated.queue,
          updated.currentIndex,
          updated.queueVersion || '',
          Date.now(),
          updated
        );
        socket?.emit('holad_updateSnapshot', {
          roomId: roomId || undefined,
          repeatMode: updated.repeatMode,
          isShuffle: updated.isShuffle,
          queueVersion: updated.queueVersion || '',
        });
        break;
      }
      case 'setTrack':
        if (typeof command.payload === 'number') {
          store.setCurrentIndex(command.payload);
        }
        break;
    }
  }
}
