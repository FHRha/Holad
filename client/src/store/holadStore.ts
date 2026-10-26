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
  isMobileClient,
  handleRemoteCommand,
  setupPlaybackSubscriptions,
  cleanupPlaybackSubscriptions,
  setIsApplyingRemoteState as setSyncApplyingRemoteState,
} from '../connect';

export interface HoladDevice {
  id: string;
  name: string;
  socketId?: string;
}

export interface HoladState {
  socket: Socket | null;
  devices: HoladDevice[];
  activeDeviceId: string | null;
  deviceId: string;
  deviceName: string;
  roomId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectError: string | null;
  isRemotePlaying: boolean;
  lastPausedAt: number | null;
  connect: (roomId: string) => void;
  disconnect: () => void;
  setActiveDevice: (deviceId: string) => void;
  sendRemoteCommand: (type: string, payload?: any) => void;
  triggerManualSync: () => Promise<void>;
  isApplyingRemoteState: boolean;
  setIsApplyingRemoteState: (val: boolean) => void;
  setupStoreSubscriptions: () => void;
}

export const useHoladStore = create<HoladState>((set, get) => {
  let socket: Socket | null = null;
  let hasRequestedHistory = false;
  let isInitialSync = true;

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
        timeout: 10000
      });

      set({ socket, roomId: normalizedRoom });

      socket.on('connect', () => {
        set({ connectionStatus: 'connected', connectError: null });
        const { user, salt, token, url } = useAuthStore.getState();
        const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
        socket!.emit('holad_joinRoom', { 
          roomId: normalizedRoom, 
          deviceId, 
          deviceName,
          auth: { user, salt, token, url },
          demoSessionId
        });
      });

      socket.on('connect_error', (err: any) => {
        console.warn('[Holad] Socket connect_error:', err?.message || err);
        set({ connectionStatus: 'error', connectError: err?.message || 'Connection error' });
      });

      socket.on('disconnect', (reason: string) => {
        console.warn('[Holad] Socket disconnected:', reason);
        set({ connectionStatus: 'disconnected' });
      });

      socket.on('holad_authError', (message: string) => {
        console.error('[Holad] Auth Error:', message);
        set({ connectionStatus: 'error', connectError: message });
        get().disconnect();
      });

      socket.on('holad_devices', (data: { devices: HoladDevice[], activeDeviceId: string | null }) => {
        const wasNotActive = get().activeDeviceId !== deviceId;
        
        if (!hasRequestedHistory && data.devices.length > 1) {
          hasRequestedHistory = true;
          console.log('[Holad] Emitting requestHistory because there are other devices in the room');
          socket!.emit('holad_remoteCommand', { type: 'requestHistory' });
        }

        if (data.activeDeviceId && data.activeDeviceId !== deviceId) {
          socket!.emit('holad_requestState');
        }

        const isActiveDeviceOnline = Boolean(data.activeDeviceId && data.devices.some(d => d.id === data.activeDeviceId));
        const hasOtherPlaying = data.devices.some(d => d.id !== deviceId && get().isRemotePlaying);

        if (!isActiveDeviceOnline) {
          if (data.devices.length === 1 && data.devices[0].id === deviceId) {
            get().setActiveDevice(deviceId);
          } else if (usePlayerStore.getState().isPlaying) {
            get().setActiveDevice(deviceId);
          } else if (data.devices.length > 0 && data.devices[0].id === deviceId && !hasOtherPlaying) {
            get().setActiveDevice(deviceId);
          } else {
            usePlayerStore.getState().setIsPlaying(false);
          }
        } else if (data.activeDeviceId === deviceId && wasNotActive) {
          const playerStore = usePlayerStore.getState();
          const audioStore = useAudioStore.getState();
          
          socket!.emit('holad_updateState', {
            roomId: get().roomId,
            deviceId: get().deviceId,
            isPlaying: playerStore.isPlaying,
            currentIndex: playerStore.currentIndex,
            queue: playerStore.queue
          });
          
          if (playerStore.queue.length > 0 && playerStore.currentIndex >= 0) {
            const track = playerStore.queue[playerStore.currentIndex];
            const duration = audioStore.duration || track?.duration;
            if (duration) {
              const targetTime = (audioStore.progress / 100) * duration;
              playerStore.setInitialPosition(targetTime * 1000);
            }
          }
        }
        set({ devices: data.devices, activeDeviceId: data.activeDeviceId });
      });

      socket.on('holad_syncState', (state: any) => {
        setSyncApplyingRemoteState(true);
        set({ isApplyingRemoteState: true });
        const store = usePlayerStore.getState();
        const isMobile = isMobileClient();

        if (state.lastPausedAt !== undefined) {
          set({ lastPausedAt: state.lastPausedAt });
        } else if (state.isPlaying === false && get().isRemotePlaying) {
          set({ lastPausedAt: Date.now() });
        } else if (state.isPlaying === true) {
          set({ lastPausedAt: null });
        }

        if (state.isPlaying !== undefined) {
          set({ isRemotePlaying: state.isPlaying });
          if (isInitialSync) {
            if (!store.isPlaying) {
              store.setIsPlaying(isMobile ? false : state.isPlaying);
            }
          } else {
            store.setIsPlaying(state.isPlaying);
          }
        }
        if (state.currentIndex !== undefined) store.setCurrentIndex(state.currentIndex);
        if (state.queue) usePlayerStore.setState({ queue: state.queue });
        
        if (state.currentTime !== undefined) {
          const audioStore = useAudioStore.getState();
          const updatedStore = usePlayerStore.getState();
          const track = updatedStore.queue[state.currentIndex !== undefined ? state.currentIndex : updatedStore.currentIndex];
          const duration = audioStore.duration || track?.duration || 1;
          audioStore.setProgress((state.currentTime / duration) * 100);
        }

        const settingsStore = useSettingsStore.getState();
        if (state.accentColor !== undefined && state.accentColor !== settingsStore.accentColor) {
          settingsStore.setAccentColor(state.accentColor);
        }
        if (state.customColors !== undefined) {
          if (state.customColors[0] !== settingsStore.customColors[0]) settingsStore.setCustomColor(0, state.customColors[0]);
          if (state.customColors[1] !== settingsStore.customColors[1]) settingsStore.setCustomColor(1, state.customColors[1]);
          if (state.customColors[2] !== settingsStore.customColors[2]) settingsStore.setCustomColor(2, state.customColors[2]);
        }
        
        isInitialSync = false;
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
        if (settings.customColors !== undefined) {
          if (settings.customColors[0] !== settingsStore.customColors[0]) settingsStore.setCustomColor(0, settings.customColors[0]);
          if (settings.customColors[1] !== settingsStore.customColors[1]) settingsStore.setCustomColor(1, settings.customColors[1]);
          if (settings.customColors[2] !== settingsStore.customColors[2]) settingsStore.setCustomColor(2, settings.customColors[2]);
        }
        
        setTimeout(() => {
          setSyncApplyingRemoteState(false);
          set({ isApplyingRemoteState: false });
        }, 50);
      });

      socket.on('holad_remoteCommand', (command: { type: string, payload?: any }) => {
        handleRemoteCommand(command, {
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

    disconnect: () => {
      isInitialSync = true;
      hasRequestedHistory = false;
      setSyncApplyingRemoteState(false);
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      cleanupPlaybackSubscriptions();
      set({
        socket: null,
        devices: [],
        activeDeviceId: null,
        roomId: null,
        connectionStatus: 'disconnected',
        connectError: null,
        isRemotePlaying: false,
        lastPausedAt: null,
        isApplyingRemoteState: false,
      });
    },

    setActiveDevice: (id: string) => {
      const state = get();
      set({ activeDeviceId: id });
      const currentSocket = state.socket || socket;
      if (currentSocket) {
        const currentDeviceId = state.deviceId || deviceId;
        const isCurrentActiveOnline = state.devices.some(d => d.id === state.activeDeviceId);
        if (state.activeDeviceId && state.activeDeviceId !== currentDeviceId && isCurrentActiveOnline && state.isRemotePlaying) {
          currentSocket.emit('holad_remoteCommand', { type: 'requestTransfer', payload: id });
          setTimeout(() => {
            if (get().activeDeviceId !== id && (get().socket || socket)) {
              (get().socket || socket)?.emit('holad_setActiveDevice', id);
            }
          }, 500);
        } else {
          currentSocket.emit('holad_setActiveDevice', id);
        }
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
              'x-url': encodeURIComponent(url)
            },
            body: JSON.stringify(localHistory)
          });
        }
      } catch (err) {
        console.error('[Holad] Failed to push local history during manual sync:', err);
      }
      
      const currentSocket = state.socket || socket;
      if (currentSocket) {
        currentSocket.emit('holad_remoteCommand', { type: 'requestHistory' });
      }
    }
  };
});
