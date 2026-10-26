import { Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useSettingsStore } from '../store/settingsStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { useHoladStore } from '../store/holadStore';

let isApplyingRemoteState = false;
let unsubscribeStore: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;
let debounceTimer: any = null;
let lastSyncTimestamp = 0;

/**
 * Returns whether remote state is currently being applied to prevent echo loops.
 */
export function getIsApplyingRemoteState(): boolean {
  return isApplyingRemoteState;
}

/**
 * Sets the remote state application flag and keeps the Zustand store synchronized.
 */
export function setIsApplyingRemoteState(val: boolean): void {
  isApplyingRemoteState = val;
  try {
    const store = useHoladStore.getState();
    if (store && store.isApplyingRemoteState !== val) {
      useHoladStore.setState({ isApplyingRemoteState: val });
    }
  } catch {
    // Store might not be initialized yet
  }
}

/**
 * Throttles or debounces high-frequency room state emissions to avoid flooding the socket.
 */
export function throttledSyncState(
  socket: Socket | null,
  roomId: string | null,
  deviceId: string,
  state: any,
  intervalMs = 300
): void {
  if (!socket || !roomId) return;
  const now = Date.now();
  if (now - lastSyncTimestamp >= intervalMs) {
    lastSyncTimestamp = now;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    socket.emit('holad_updateState', { roomId, deviceId, ...state });
  } else {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      lastSyncTimestamp = Date.now();
      debounceTimer = null;
      socket.emit('holad_updateState', { roomId, deviceId, ...state });
    }, intervalMs - (now - lastSyncTimestamp));
  }
}

/**
 * Cleans up existing subscriptions to player and settings stores.
 */
export function cleanupPlaybackSubscriptions(): void {
  if (unsubscribeStore) {
    unsubscribeStore();
    unsubscribeStore = null;
  }
  if (unsubscribeSettings) {
    unsubscribeSettings();
    unsubscribeSettings = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

/**
 * Subscribes to local player and settings store changes.
 * Propagates local state changes to connected Holad room peers when this device
 * is the active master, or forwards remote control commands when another device is active.
 */
export function setupPlaybackSubscriptions(): void {
  cleanupPlaybackSubscriptions();

  unsubscribeStore = usePlayerStore.subscribe((state, prevState) => {
    if (isApplyingRemoteState || useHoladStore.getState().isApplyingRemoteState) return;

    const holad = useHoladStore.getState();
    const currentActive = holad.activeDeviceId;
    const currentDeviceId = holad.deviceId;
    const currentSocket = holad.socket;

    if (currentActive === currentDeviceId) {
      let currentTime = 0;
      const engine = getAudioEngine();
      if (engine) {
        currentTime = engine.getCurrentTime();
      } else {
        const track = state.queue[state.currentIndex];
        const duration = useAudioStore.getState().duration || track?.duration || 1;
        currentTime = (useAudioStore.getState().progress / 100) * duration;
      }

      const lastPausedAt = !state.isPlaying ? (holad.lastPausedAt || Date.now()) : null;
      if (holad.lastPausedAt !== lastPausedAt) {
        useHoladStore.setState({ lastPausedAt });
      }

      const stateToSync = {
        isPlaying: state.isPlaying,
        currentIndex: state.currentIndex,
        queue: state.queue,
        currentTime,
        accentColor: useSettingsStore.getState().accentColor,
        customColors: useSettingsStore.getState().customColors,
        lastPausedAt
      };

      if (
        state.isPlaying !== prevState?.isPlaying ||
        state.currentIndex !== prevState?.currentIndex ||
        state.queue?.length !== prevState?.queue?.length
      ) {
        currentSocket?.emit('holad_updateState', {
          roomId: holad.roomId,
          deviceId: currentDeviceId,
          ...stateToSync
        });
      }
    } else if (!currentActive) {
      if (state.isPlaying && !prevState?.isPlaying) {
        useHoladStore.getState().setActiveDevice(currentDeviceId);
      }
    } else if (currentActive && currentActive !== currentDeviceId) {
      const prevQueueLen = prevState?.queue?.length || 0;
      const currQueueLen = state.queue?.length || 0;

      // 1. Guard against initial queue hydration on an idle device:
      if (prevQueueLen === 0 && currQueueLen > 0 && !state.isPlaying) {
        return;
      }

      const isCurrentActiveOnline = holad.devices.some(d => d.id === currentActive);
      const isRemoteActivePlaying = isCurrentActiveOnline && holad.isRemotePlaying;
      const queueChanged = state.queue !== prevState?.queue || currQueueLen !== prevQueueLen;
      const trackChanged = state.currentIndex !== prevState?.currentIndex;

      // 2. If remote device is offline, only an EXPLICIT user play action claims active device locally:
      if (!isCurrentActiveOnline) {
        if (state.isPlaying && !prevState?.isPlaying) {
          useHoladStore.getState().setActiveDevice(currentDeviceId);
        }
        return;
      }

      // 3. Idle timeout (60 seconds / 60000 ms):
      // If the master has been paused for > 60 seconds (or has never played / room has no active playing device),
      // pressing Play or selecting a track makes this device the new master.
      const lastPausedAt = holad.lastPausedAt;
      const isMasterIdle = !isRemoteActivePlaying && (
        lastPausedAt === null || (Date.now() - lastPausedAt >= 60000)
      );

      if (isMasterIdle && state.isPlaying && (!prevState?.isPlaying || trackChanged)) {
        useHoladStore.getState().setActiveDevice(currentDeviceId);
        return;
      }

      // 4. Remote Control mode: master is playing or paused < 60s
      // Automatic takeover is strictly forbidden. Forward all commands to master.
      if (queueChanged || (trackChanged && Math.abs(state.currentIndex - (prevState?.currentIndex || 0)) > 1)) {
        setIsApplyingRemoteState(true);
        usePlayerStore.setState({
          queue: prevState?.queue || [],
          currentIndex: prevState?.currentIndex || 0,
          isPlaying: prevState?.isPlaying || false
        });
        setTimeout(() => { setIsApplyingRemoteState(false); }, 10);

        currentSocket?.emit('holad_remoteCommand', {
          type: 'setQueue',
          payload: { queue: state.queue, currentIndex: state.currentIndex }
        });
        if (state.isPlaying) {
          currentSocket?.emit('holad_remoteCommand', { type: 'play' });
        }
        return;
      }

      // In-queue track change: send simple play/seek if queue structure didn't change
      if (trackChanged && state.currentIndex >= 0 && Math.abs(state.currentIndex - (prevState?.currentIndex || 0)) <= 1) {
        setIsApplyingRemoteState(true);
        usePlayerStore.setState({
          currentIndex: prevState?.currentIndex || 0,
          isPlaying: prevState?.isPlaying || false
        });
        setTimeout(() => { setIsApplyingRemoteState(false); }, 10);

        currentSocket?.emit('holad_remoteCommand', {
          type: 'setQueue',
          payload: { queue: state.queue, currentIndex: state.currentIndex }
        });
        if (state.isPlaying) {
          currentSocket?.emit('holad_remoteCommand', { type: 'play' });
        }
        return;
      }

      if (state.isPlaying !== prevState?.isPlaying) {
        setIsApplyingRemoteState(true);
        usePlayerStore.setState({ isPlaying: prevState?.isPlaying || false });
        setTimeout(() => { setIsApplyingRemoteState(false); }, 10);

        if (state.isPlaying) {
          currentSocket?.emit('holad_remoteCommand', { type: 'play' });
        } else {
          currentSocket?.emit('holad_remoteCommand', { type: 'pause' });
        }
      }
    }
  });

  unsubscribeSettings = useSettingsStore.subscribe((state, prevState) => {
    if (isApplyingRemoteState || useHoladStore.getState().isApplyingRemoteState) return;

    const accentColorChanged = state.accentColor !== prevState?.accentColor;
    const customColorsChanged = state.customColors !== prevState?.customColors;
    const holad = useHoladStore.getState();
    const currentSocket = holad.socket;
    const currentDeviceId = holad.deviceId;

    if (accentColorChanged || customColorsChanged) {
      currentSocket?.emit('holad_updateSettings', {
        roomId: holad.roomId,
        deviceId: currentDeviceId,
        accentColor: state.accentColor,
        customColors: state.customColors
      });
    }
  });
}
