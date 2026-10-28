import { Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useSettingsStore } from '../store/settingsStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { useHoladStore } from '../store/holadStore';
import type { PlaybackSnapshot, TrackCompact } from './types';

let isApplyingRemoteState = false;
let unsubscribeStore: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
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
 * Returns the current playback position in milliseconds.
 */
function getCurrentPositionMs(playerStore: any): number {
  const engine = getAudioEngine();
  if (engine) {
    const t = engine.getCurrentTime();
    if (typeof t === 'number' && isFinite(t) && t > 0) {
      return Math.round(t * 1000);
    }
  }
  const audioStore = useAudioStore.getState();
  const track = playerStore.queue?.[playerStore.currentIndex];
  const duration = audioStore.duration || track?.duration || 0;
  return Math.round(((audioStore.progress / 100) * duration) * 1000);
}

/**
 * Starts the 8-second background heartbeat when this device is the active master.
 */
export function startHeartbeat(socket: Socket | null, roomId: string | null, deviceId: string): void {
  stopHeartbeat();
  if (!socket || !roomId) return;

  heartbeatTimer = setInterval(() => {
    const holad = useHoladStore.getState();
    const currentSocket = holad.socket || socket;
    const currentRoom = holad.roomId || roomId;
    const currentDevice = holad.deviceId || deviceId;

    if (!currentSocket || !currentRoom || holad.activeDeviceId !== currentDevice) {
      stopHeartbeat();
      return;
    }

    const playerStore = usePlayerStore.getState();
    const positionMs = getCurrentPositionMs(playerStore);

    currentSocket.emit('holad_heartbeat', {
      roomId: currentRoom,
      deviceId: currentDevice,
      positionMs,
      isPlaying: playerStore.isPlaying,
      playbackRate: playerStore.playbackRate || 1,
    });
  }, 8000);
}

/**
 * Stops the background heartbeat.
 */
export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
  stopHeartbeat();
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
    const roomId = holad.roomId;

    if (!currentSocket || !roomId) {
      stopHeartbeat();
      return;
    }

    if (currentActive === currentDeviceId) {
      // 1. ACTIVE MASTER DEVICE
      if (!heartbeatTimer) {
        startHeartbeat(currentSocket, roomId, currentDeviceId);
      }

      const isPlayingChanged = state.isPlaying !== prevState?.isPlaying;
      const indexChanged = state.currentIndex !== prevState?.currentIndex;
      const queueChanged = state.queue !== prevState?.queue || state.queue?.length !== prevState?.queue?.length;
      const rateChanged = state.playbackRate !== prevState?.playbackRate;

      if (isPlayingChanged || indexChanged || queueChanged || rateChanged) {
        const positionMs = getCurrentPositionMs(state);
        const currentTrack = state.queue[state.currentIndex];

        const compactQueue: TrackCompact[] = (state.queue || []).map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration,
          coverArt: t.coverArt,
        }));

        const patch: Partial<PlaybackSnapshot> = {
          roomId,
          trackId: currentTrack?.id ?? null,
          currentIndex: state.currentIndex,
          queue: compactQueue,
          positionMs,
          isPlaying: state.isPlaying,
          playbackRate: state.playbackRate || 1,
        };

        currentSocket.emit('holad_updateSnapshot', patch);

        currentSocket.emit('holad_updateState', {
          roomId,
          deviceId: currentDeviceId,
          isPlaying: state.isPlaying,
          currentIndex: state.currentIndex,
          queue: state.queue,
          currentTime: positionMs / 1000,
          positionMs,
          playbackRate: state.playbackRate || 1,
          accentColor: useSettingsStore.getState().accentColor,
          customColors: useSettingsStore.getState().customColors,
          lastPausedAt: !state.isPlaying ? (holad.lastPausedAt || Date.now()) : null,
        });
      }
    } else {
      // 2. PASSIVE DEVICE (currentActive !== currentDeviceId)
      stopHeartbeat();

      const queueChanged = state.queue !== prevState?.queue || state.queue?.length !== prevState?.queue?.length;
      const indexChanged = state.currentIndex !== prevState?.currentIndex;
      const isPlayingChanged = state.isPlaying !== prevState?.isPlaying;
      const repeatChanged = state.repeatMode !== prevState?.repeatMode;
      const rateChanged = state.playbackRate !== prevState?.playbackRate;

      if (queueChanged) {
        currentSocket.emit('holad_remoteCommand', {
          type: 'setQueue',
          payload: { queue: state.queue, currentIndex: state.currentIndex },
        });
      } else if (indexChanged && state.currentIndex >= 0) {
        currentSocket.emit('holad_remoteCommand', {
          type: 'setTrack',
          payload: state.currentIndex,
        });
      }

      if (isPlayingChanged) {
        currentSocket.emit('holad_remoteCommand', {
          type: state.isPlaying ? 'play' : 'pause',
        });
      }

      if (repeatChanged) {
        currentSocket.emit('holad_remoteCommand', {
          type: 'repeat',
          payload: state.repeatMode,
        });
      }

      if (rateChanged) {
        currentSocket.emit('holad_remoteCommand', {
          type: 'playbackRate',
          payload: state.playbackRate,
        });
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
        customColors: state.customColors,
      });
    }
  });
}
