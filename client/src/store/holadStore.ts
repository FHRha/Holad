import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from './playerStore';
import { useAudioStore } from './audioStore';
import { useSettingsStore } from './settingsStore';
import { useHistoryStore } from './historyStore';
import { useAuthStore } from './authStore';
import { getSocketUrl, getHoladServerUrl, getSocketPath } from '../utils/serverConfig';
import {
  generateDeviceId,
  getDeviceName,
  handleRemoteCommand,
  setupPlaybackSubscriptions,
  cleanupPlaybackSubscriptions,
  setIsApplyingRemoteState as setSyncApplyingRemoteState,
} from '../connect';
import type { PlaybackSnapshot, HoladDevice, HoladAuthErrorPayload } from '../connect/types';

export type { HoladDevice };

export interface HoladState {
  socket: Socket | null;
  devices: HoladDevice[];
  activeDeviceId: string | null;
  deviceId: string;
  deviceName: string;
  roomId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectError: string | null;
  snapshot: PlaybackSnapshot | null;
  clientOffset: number;
  isRemotePlaying: boolean;
  lastPausedAt: number | null;
  connect: (roomId: string) => void;
  disconnect: (keepError?: boolean) => void;
  transferPlayback: (targetDeviceId: string) => void;
  setActiveDevice: (deviceId: string) => void;
  sendRemoteCommand: (type: string, payload?: any) => void;
  triggerManualSync: () => Promise<void>;
  isApplyingRemoteState: boolean;
  setIsApplyingRemoteState: (val: boolean) => void;
  setupStoreSubscriptions: () => void;
}

let uiTickerTimer: ReturnType<typeof setInterval> | null = null;
let visibilityListenerAttached = false;

function recalculatePassiveProgress() {
  const { snapshot, clientOffset, activeDeviceId, deviceId } = useHoladStore.getState();
  if (!snapshot) return;
  const isPassive = activeDeviceId !== deviceId;
  if (!isPassive) return;

  const audioStore = useAudioStore.getState();
  if (audioStore.isSeeking) return;

  const playerStore = usePlayerStore.getState();
  const currentTrack = (snapshot.queue && snapshot.currentIndex >= 0 && snapshot.currentIndex < snapshot.queue.length)
    ? snapshot.queue[snapshot.currentIndex]
    : playerStore.queue[snapshot.currentIndex];

  const trackDurSec = currentTrack?.duration && currentTrack.duration > 0
    ? currentTrack.duration
    : (audioStore.duration || 1);
  const trackDurationMs = trackDurSec * 1000;

  if (snapshot.isPlaying) {
    const nowServer = Date.now() - clientOffset;
    const elapsed = (nowServer - snapshot.timestamp) * (snapshot.playbackRate || 1);
    const posMs = Math.min(snapshot.positionMs + Math.max(0, elapsed), trackDurationMs);
    audioStore.setProgress((posMs / trackDurationMs) * 100);
  } else {
    audioStore.setProgress((Math.min(snapshot.positionMs, trackDurationMs) / trackDurationMs) * 100);
  }
}

function startPassiveTicker() {
  stopPassiveTicker();
  if (typeof window === 'undefined') return;

  ensureVisibilityListener();

  if (typeof document !== 'undefined' && document.hidden) {
    return;
  }

  uiTickerTimer = setInterval(() => {
    const { snapshot, activeDeviceId, deviceId } = useHoladStore.getState();
    const isPassive = activeDeviceId !== deviceId;
    if (!snapshot || !isPassive || !snapshot.isPlaying) {
      stopPassiveTicker();
      return;
    }
    recalculatePassiveProgress();
  }, 250);
}

function stopPassiveTicker() {
  if (uiTickerTimer) {
    clearInterval(uiTickerTimer);
    uiTickerTimer = null;
  }
}

function ensureVisibilityListener() {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', () => {
    const { snapshot, activeDeviceId, deviceId } = useHoladStore.getState();
    const isPassive = activeDeviceId !== deviceId;
    const shouldRun = Boolean(snapshot && isPassive && snapshot.isPlaying);

    if (document.hidden) {
      stopPassiveTicker();
    } else {
      if (shouldRun) {
        recalculatePassiveProgress();
        startPassiveTicker();
      }
    }
  });
}

export const useHoladStore = create<HoladState>((set, get) => {
  let socket: Socket | null = null;
  let hasRequestedHistory = false;

  const deviceId = generateDeviceId();
  const deviceName = getDeviceName();

  return {
    socket: null,
    devices: [],
    activeDeviceId: null,
    deviceId,
    deviceName,
    roomId: null,
    connectionStatus: 'disconnected',
    connectError: null,
    snapshot: null,
    clientOffset: 0,
    isRemotePlaying: false,
    lastPausedAt: null,
    isApplyingRemoteState: false,

    setIsApplyingRemoteState: (val: boolean) => {
      setSyncApplyingRemoteState(val);
      set({ isApplyingRemoteState: val });
    },

    connect: (roomId: string) => {
      const normalizedRoom = (roomId || '').trim().toLowerCase();
      if (!normalizedRoom) return;

      if (get().connectionStatus === 'disconnected' || !socket) {
        set({ connectError: null, roomId: normalizedRoom });
      }

      if (socket) {
        if (get().roomId === normalizedRoom && socket.connected) return;
        get().disconnect();
      }

      set({ connectionStatus: 'connecting', connectError: null, roomId: normalizedRoom });

      socket = io(getSocketUrl(), {
        path: getSocketPath(),
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
      });

      set({ socket, roomId: normalizedRoom });

      socket.on('connect', () => {
        set({ connectionStatus: 'connected', connectError: null });

        // NTP-light ping immediately upon connection
        socket!.emit('holad_ping', { t0: performance.now() });

        const { user, salt, token, url } = useAuthStore.getState();
        const demoSessionId = typeof window !== 'undefined'
          ? (sessionStorage.getItem('holad_demo_session_id') || undefined)
          : undefined;

        socket!.emit('holad_joinRoom', {
          roomId: normalizedRoom,
          deviceId,
          deviceName,
          auth: { user, salt, token, url },
          demoSessionId,
        });
      });

      // NTP-light pong handler
      socket.on('holad_pong', (data: { t0?: number; serverTime: number }) => {
        if (typeof data?.t0 === 'number' && typeof data?.serverTime === 'number') {
          const rtt = performance.now() - data.t0;
          const offset = Date.now() - (data.serverTime + rtt / 2);
          set({ clientOffset: offset });
        }
      });

      socket.on('connect_error', (err: any) => {
        console.warn('[Holad] Socket connect_error:', err?.message || err);
        set({ connectionStatus: 'error', connectError: err?.message || 'Connection error' });
      });

      socket.on('disconnect', (reason: string) => {
        console.warn('[Holad] Socket disconnected:', reason);
        if (get().connectionStatus !== 'error') {
          set({ connectionStatus: 'disconnected' });
        }
      });

      socket.on('holad_authError', (payload: HoladAuthErrorPayload | string) => {
        const message = typeof payload === 'string'
          ? payload
          : payload?.message || 'Authentication failed';
        console.error('[Holad] Auth Error:', message);
        set({ connectionStatus: 'error', connectError: message });
        get().disconnect(true);
      });

      socket.on('holad_devices', (data: any) => {
        const rawDevices = (data as any)?.devices ?? (Array.isArray(data) ? data : []);
        const deviceList: HoladDevice[] = Array.isArray(rawDevices) ? rawDevices : [];
        const newActive = (data as any)?.activeDeviceId ?? null;

        const previousActive = get().activeDeviceId;

        if (!hasRequestedHistory && deviceList.length > 1) {
          hasRequestedHistory = true;
          console.log('[Holad] Emitting requestHistory because there are other devices in the room');
          socket!.emit('holad_remoteCommand', { type: 'requestHistory' });
        }

        if (newActive && newActive !== deviceId) {
          socket!.emit('holad_requestState');
        }

        // Strictly respect server SSOT activeDeviceId. Never self-proclaim active!
        set({ devices: deviceList, activeDeviceId: newActive });

        if (newActive === deviceId && previousActive !== deviceId) {
          stopPassiveTicker();
          const playerStore = usePlayerStore.getState();
          const audioStore = useAudioStore.getState();

          socket!.emit('holad_updateState', {
            roomId: get().roomId,
            deviceId: get().deviceId,
            isPlaying: playerStore.isPlaying,
            currentIndex: playerStore.currentIndex,
            queue: playerStore.queue,
          });

          if (playerStore.queue.length > 0 && playerStore.currentIndex >= 0) {
            const track = playerStore.queue[playerStore.currentIndex];
            const duration = audioStore.duration || track?.duration;
            if (duration) {
              const targetTime = (audioStore.progress / 100) * duration;
              playerStore.setInitialPosition(targetTime * 1000);
            }
          }
        } else if (newActive !== deviceId) {
          const snapshot = get().snapshot;
          if (snapshot && snapshot.isPlaying) {
            startPassiveTicker();
          } else {
            stopPassiveTicker();
          }
        }
      });

      socket.on('holad_syncState', (state: any) => {
        if (!state) return;
        setSyncApplyingRemoteState(true);
        set({ isApplyingRemoteState: true });

        const currentSnapshot = get().snapshot;
        const snapshot: PlaybackSnapshot = {
          roomId: state.roomId ?? get().roomId ?? '',
          activeDeviceId: state.activeDeviceId !== undefined ? state.activeDeviceId : get().activeDeviceId,
          trackId: state.trackId ?? (state.queue && state.currentIndex >= 0 ? state.queue[state.currentIndex]?.id : null),
          currentIndex: typeof state.currentIndex === 'number' ? state.currentIndex : (currentSnapshot?.currentIndex ?? 0),
          queue: Array.isArray(state.queue) ? state.queue : (currentSnapshot?.queue ?? []),
          positionMs: typeof state.positionMs === 'number'
            ? state.positionMs
            : (typeof state.currentTime === 'number' ? Math.round(state.currentTime * 1000) : 0),
          timestamp: typeof state.timestamp === 'number' ? state.timestamp : Date.now(),
          isPlaying: typeof state.isPlaying === 'boolean' ? state.isPlaying : (currentSnapshot?.isPlaying ?? false),
          playbackRate: typeof state.playbackRate === 'number' ? state.playbackRate : (currentSnapshot?.playbackRate ?? 1),
          version: typeof state.version === 'number' ? state.version : ((currentSnapshot?.version ?? 0) + 1),
        };

        const currentActive = get().activeDeviceId;
        const newActive = snapshot.activeDeviceId;
        const updates: Partial<HoladState> = {
          snapshot,
          isRemotePlaying: snapshot.isPlaying,
          lastPausedAt: snapshot.isPlaying ? null : (state.lastPausedAt ?? Date.now()),
        };

        if (newActive !== undefined && newActive !== currentActive) {
          updates.activeDeviceId = newActive;
        }
        set(updates);

        // Backward compatibility for colors/themes
        const settingsStore = useSettingsStore.getState();
        if (state.accentColor !== undefined && state.accentColor !== settingsStore.accentColor) {
          settingsStore.setAccentColor(state.accentColor);
        }
        if (state.customColors !== undefined && Array.isArray(state.customColors)) {
          if (state.customColors[0] !== settingsStore.customColors[0]) settingsStore.setCustomColor(0, state.customColors[0]);
          if (state.customColors[1] !== settingsStore.customColors[1]) settingsStore.setCustomColor(1, state.customColors[1]);
          if (state.customColors[2] !== settingsStore.customColors[2]) settingsStore.setCustomColor(2, state.customColors[2]);
        }

        const effectiveActive = newActive !== undefined ? newActive : currentActive;
        const isPassive = effectiveActive !== deviceId;

        if (isPassive) {
          const playerStore = usePlayerStore.getState();
          const audioStore = useAudioStore.getState();

          const currentTrack = (snapshot.queue && snapshot.currentIndex >= 0 && snapshot.currentIndex < snapshot.queue.length)
            ? snapshot.queue[snapshot.currentIndex]
            : playerStore.queue[snapshot.currentIndex];

          const prevTrackId = playerStore.queue[playerStore.currentIndex]?.id;
          const nextTrackId = currentTrack?.id;
          const isSameTrack = prevTrackId && nextTrackId
            ? prevTrackId === nextTrackId
            : playerStore.currentIndex === snapshot.currentIndex;

          // Sync queue, index and remote isPlaying without triggering local audio playback
          usePlayerStore.setState({
            ...(snapshot.queue ? { queue: snapshot.queue as any } : {}),
            currentIndex: snapshot.currentIndex,
            isPlaying: snapshot.isPlaying,
          });

          const trackDurSec = currentTrack?.duration && currentTrack.duration > 0
            ? currentTrack.duration
            : (audioStore.duration || 1);
          const trackDurationMs = trackDurSec * 1000;

          if (currentTrack?.duration && audioStore.duration !== currentTrack.duration) {
            audioStore.setDuration(currentTrack.duration);
          }

          // Dead-Reckoning calculation
          const nowServer = Date.now() - get().clientOffset;
          const elapsed = (nowServer - snapshot.timestamp) * (snapshot.playbackRate || 1);
          const calculatedPosMs = snapshot.isPlaying
            ? Math.min(snapshot.positionMs + Math.max(0, elapsed), trackDurationMs)
            : Math.min(snapshot.positionMs, trackDurationMs);

          const currentLocalPosMs = (audioStore.progress / 100) * trackDurationMs;

          // Anti-Jitter: if playing the same track and drift < 800ms, do not jerk slider backward
          const isCloseEnough = snapshot.isPlaying && isSameTrack && Math.abs(calculatedPosMs - currentLocalPosMs) < 800;

          if (!isCloseEnough && !audioStore.isSeeking) {
            audioStore.setProgress((calculatedPosMs / trackDurationMs) * 100);
          }

          // UI Ticker management (4 Hz)
          if (snapshot.isPlaying) {
            startPassiveTicker();
          } else {
            stopPassiveTicker();
          }
        } else {
          stopPassiveTicker();
        }

        setTimeout(() => {
          setSyncApplyingRemoteState(false);
          set({ isApplyingRemoteState: false });
        }, 50);
      });

      socket.on('holad_syncSettings', (settings: any) => {
        setSyncApplyingRemoteState(true);
        set({ isApplyingRemoteState: true });

        const settingsStore = useSettingsStore.getState();
        if (settings.accentColor !== undefined && settings.accentColor !== settingsStore.accentColor) {
          settingsStore.setAccentColor(settings.accentColor);
        }
        if (settings.customColors !== undefined && Array.isArray(settings.customColors)) {
          if (settings.customColors[0] !== settingsStore.customColors[0]) settingsStore.setCustomColor(0, settings.customColors[0]);
          if (settings.customColors[1] !== settingsStore.customColors[1]) settingsStore.setCustomColor(1, settings.customColors[1]);
          if (settings.customColors[2] !== settingsStore.customColors[2]) settingsStore.setCustomColor(2, settings.customColors[2]);
        }

        setTimeout(() => {
          setSyncApplyingRemoteState(false);
          set({ isApplyingRemoteState: false });
        }, 50);
      });

      socket.on('holad_remoteCommand', (command: { type: string; payload?: any }) => {
        handleRemoteCommand(command, {
          socket: get().socket || socket,
          deviceId: get().deviceId || deviceId,
          roomId: get().roomId,
          activeDeviceId: get().activeDeviceId,
          lastPausedAt: get().lastPausedAt,
        });
      });

      socket.on('preferencesUpdated', (payload: any) => {
        handleRemoteCommand({ type: 'preferencesUpdated', payload }, {
          socket: get().socket || socket,
          deviceId: get().deviceId || deviceId,
          roomId: get().roomId,
          activeDeviceId: get().activeDeviceId,
          lastPausedAt: get().lastPausedAt,
        });
      });

      get().setupStoreSubscriptions();
    },

    setupStoreSubscriptions: () => {
      setupPlaybackSubscriptions();
    },

    disconnect: (keepError = false) => {
      hasRequestedHistory = false;
      setSyncApplyingRemoteState(false);
      stopPassiveTicker();

      if (socket) {
        socket.disconnect();
        socket = null;
      }

      cleanupPlaybackSubscriptions();

      const currentStatus = get().connectionStatus;
      const currentError = get().connectError;
      const preserveError = keepError || currentStatus === 'error';

      set({
        socket: null,
        devices: [],
        activeDeviceId: null,
        roomId: null,
        connectionStatus: preserveError ? 'error' : 'disconnected',
        connectError: preserveError ? currentError : null,
        snapshot: null,
        isRemotePlaying: false,
        lastPausedAt: null,
        isApplyingRemoteState: false,
      });
    },

    transferPlayback: (targetDeviceId: string) => {
      const currentSocket = get().socket || socket;
      if (currentSocket) {
        currentSocket.emit('holad_transferPlayback', { targetDeviceId });
      }
    },

    setActiveDevice: (id: string) => {
      get().transferPlayback(id);
      const currentSocket = get().socket || socket;
      if (currentSocket) {
        currentSocket.emit('holad_setActiveDevice', id);
      }
    },

    sendRemoteCommand: (type: string, payload?: any) => {
      const currentSocket = get().socket || socket;
      if (currentSocket) {
        currentSocket.emit('holad_remoteCommand', { type, payload });
      }
    },

    triggerManualSync: async () => {
      const state = get();
      if (!state.roomId) return;

      const { user, token, salt, url } = useAuthStore.getState();
      const localHistory = useHistoryStore.getState().history;

      try {
        if (localHistory.length > 0) {
          console.log('[Holad] Pushing local history for manual sync...');
          await fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(state.roomId)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user': encodeURIComponent(user),
              'x-token': encodeURIComponent(token),
              'x-salt': encodeURIComponent(salt),
              'x-url': encodeURIComponent(url),
            },
            body: JSON.stringify(localHistory),
          });
        }
      } catch (err) {
        console.error('[Holad] Failed to push local history during manual sync:', err);
      }

      const currentSocket = state.socket || socket;
      if (currentSocket) {
        currentSocket.emit('holad_remoteCommand', { type: 'requestHistory' });
      }
    },
  };
});
