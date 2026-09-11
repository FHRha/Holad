import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from './playerStore';
import { useAudioStore } from './audioStore';
import { useSettingsStore } from './settingsStore';
import { useHistoryStore } from './historyStore';

import { useAuthStore } from './authStore';
import { getSocketUrl, getHoladServerUrl, getSocketPath } from '../utils/serverConfig';
import { isTauri, isCapacitor } from '../utils/StorageManager';
import { getAudioEngine } from '../audio/AudioEngine';

const isMobileClient = () => {
  if (typeof window === 'undefined') return false;
  return !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
};

export interface HoladDevice {
  id: string;
  name: string;
  socketId?: string;
}

interface HoladState {
  socket: Socket | null;
  devices: HoladDevice[];
  activeDeviceId: string | null;
  deviceId: string;
  deviceName: string;
  roomId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectError: string | null;
  connect: (roomId: string) => void;
  disconnect: () => void;
  setActiveDevice: (deviceId: string) => void;
  sendRemoteCommand: (type: string, payload?: any) => void;
  triggerManualSync: () => Promise<void>;
}



function generateDeviceId() {
  const genId = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return genId();
  }
  let id = sessionStorage.getItem('holad_deviceId');
  if (!id) {
    id = genId();
    sessionStorage.setItem('holad_deviceId', id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent;
  
  if (ua.includes('Holad-Mobile')) {
    const os = /Android/.test(ua) ? 'Android' : /iOS|iPhone|iPad/.test(ua) ? 'iOS' : 'OS';
    return `Holad App on ${os}`;
  }
  
  if (ua.includes('Holad-Desktop')) {
    const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'OS';
    return `Holad Desktop on ${os}`;
  }

  const isMobile = /Mobi|Android/i.test(ua);
  const browser = /Chrome/.test(ua) ? 'Chrome' : 
                  /Safari/.test(ua) ? 'Safari' : 
                  /Firefox/.test(ua) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : 
             /Mac/.test(ua) ? 'Mac' : 
             /Linux/.test(ua) ? 'Linux' : 
             /Android/.test(ua) ? 'Android' : 
             /iOS|iPhone|iPad/.test(ua) ? 'iOS' : 'OS';
  
  return `${isMobile ? 'Mobile' : 'Desktop'} ${browser} on ${os}`;
}

export const useHoladStore = create<HoladState>((set, get) => {
  let socket: Socket | null = null;
  let unsubscribeStore: (() => void) | null = null;
  let unsubscribeSettings: (() => void) | null = null;
  let isApplyingRemoteState = false;
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
        
        // Request history if we just joined and there's another device to ask
        if (!hasRequestedHistory && data.devices.length > 1) {
          hasRequestedHistory = true;
          console.log('[Holad] Emitting requestHistory because there are other devices in the room');
          socket!.emit('holad_remoteCommand', { type: 'requestHistory' });
        }

        if (data.activeDeviceId === null) {
            if (!usePlayerStore.getState().isPlaying) {
                usePlayerStore.getState().setIsPlaying(false);
            }
        } else if (data.activeDeviceId === deviceId && wasNotActive) {
            // We just became the active device! (e.g. someone transferred playback to us)
            const playerStore = usePlayerStore.getState();
            const audioStore = useAudioStore.getState();
            
            // Assert our state to the room
            socket!.emit('holad_updateState', {
                roomId: get().roomId,
                deviceId: get().deviceId,
                isPlaying: playerStore.isPlaying,
                currentIndex: playerStore.currentIndex,
                queue: playerStore.queue
            });
            
            // Resume playback from the currently synced progress
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
        isApplyingRemoteState = true;
        const store = usePlayerStore.getState();
        const isMobile = isMobileClient();

        if (state.isPlaying !== undefined) {
          if (isInitialSync) {
            // Guard against remote room state forcing pause/play during initial startup/sync
            // if the user has ALREADY initiated local playback.
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
        setTimeout(() => { isApplyingRemoteState = false; }, 50);
      });

      socket.on('holad_syncSettings', (settings: any) => {
        isApplyingRemoteState = true;
        
        const settingsStore = useSettingsStore.getState();
        if (settings.accentColor !== undefined && settings.accentColor !== settingsStore.accentColor) {
           settingsStore.setAccentColor(settings.accentColor);
        }
        if (settings.customColors !== undefined) {
           if (settings.customColors[0] !== settingsStore.customColors[0]) settingsStore.setCustomColor(0, settings.customColors[0]);
           if (settings.customColors[1] !== settingsStore.customColors[1]) settingsStore.setCustomColor(1, settings.customColors[1]);
           if (settings.customColors[2] !== settingsStore.customColors[2]) settingsStore.setCustomColor(2, settings.customColors[2]);
        }
        
        setTimeout(() => { isApplyingRemoteState = false; }, 50);
      });

      socket.on('holad_remoteCommand', (command: { type: string, payload?: any }) => {
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
          usePlayerStore.setState({
            excludedTrackIds: Array.isArray(excludedTrackIds) ? excludedTrackIds : [],
            excludedAlbumIds: Array.isArray(excludedAlbumIds) ? excludedAlbumIds : [],
            excludedFingerprints: Array.isArray(excludedFingerprints) ? excludedFingerprints : []
          });
          return;
        }
        
        if (command.type === 'syncHistory') {
          useHistoryStore.getState().addTrackToHistory(command.payload.track, command.payload.playedAt);
          return;
        }
        
        if (command.type === 'requestHistory') {
          console.log('[Holad] Received requestHistory.');
          const history = useHistoryStore.getState().history;
          console.log('[Holad] Emitting history via REST API with tracks:', history.length);
          if (history.length > 0) {
            const { user, token, salt, url } = useAuthStore.getState();
            fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(get().roomId!)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user': encodeURIComponent(user),
                'x-token': encodeURIComponent(token),
                'x-salt': encodeURIComponent(salt),
                'x-url': encodeURIComponent(url)
              },
              body: JSON.stringify(history)
            }).catch(err => console.error('[Holad] Failed to upload history:', err));
          }
          return;
        }
        
        if (command.type === 'historyAvailable') {
           console.log('[Holad] Received historyAvailable, fetching from API...');
           const { user, token, salt, url } = useAuthStore.getState();
           fetch(`${getHoladServerUrl()}/api/holad/history/${encodeURIComponent(get().roomId!)}`, {
             headers: {
               'x-user': encodeURIComponent(user),
               'x-token': encodeURIComponent(token),
               'x-salt': encodeURIComponent(salt),
               'x-url': encodeURIComponent(url)
             }
           })
             .then(res => {
               if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
               return res.json();
             })
             .then(historyData => {
               console.log('[Holad] Downloaded history with tracks:', historyData.length);
               console.log('[Holad] Merging history silently from all devices');
               useHistoryStore.getState().syncHistoryData(historyData);
             })
             .catch(err => console.error('[Holad] Failed to fetch history:', err));
           return;
        }

        if (command.type === 'clearHistory') {
          const fromUser = (command as any).fromUserId;
          const currentRoom = get().roomId;
          if (!fromUser || fromUser === currentRoom) {
            useHistoryStore.getState().clearHistory();
          } else {
            console.warn('[Holad] Ignored unauthorized clearHistory command from external peer:', fromUser);
          }
          return;
        }

        const currentActive = get().activeDeviceId;
        if (currentActive === deviceId) {
          const store = usePlayerStore.getState();
          switch (command.type) {
            case 'requestTransfer':
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
                currentTime: currentTime,
                accentColor: useSettingsStore.getState().accentColor,
                customColors: useSettingsStore.getState().customColors
              };
              socket?.emit('holad_updateState', { roomId: get().roomId, deviceId, ...stateToSync });
              // Then hand over control
              socket?.emit('holad_setActiveDevice', command.payload);
              break;
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
              store.prevTrack();
              break;
            case 'seek':
              import('../audio/AudioEngine').then(({ getAudioEngine }) => {
                const engine = getAudioEngine();
                if (engine) engine.seek(command.payload / 1000);
              });
              break;
            case 'setQueue':
              usePlayerStore.setState({ queue: command.payload.queue, currentIndex: command.payload.currentIndex });
              break;
          }
        }
      });

      unsubscribeStore = usePlayerStore.subscribe((state, prevState) => {
        if (isApplyingRemoteState) return;

        const currentActive = get().activeDeviceId;
        
        if (currentActive === deviceId) {
          let currentTime = 0;
          const engine = getAudioEngine();
          if (engine) {
             currentTime = engine.getCurrentTime();
          } else {
             const track = state.queue[state.currentIndex];
             const duration = useAudioStore.getState().duration || track?.duration || 1;
             currentTime = (useAudioStore.getState().progress / 100) * duration;
          }

          const stateToSync = {
            isPlaying: state.isPlaying,
            currentIndex: state.currentIndex,
            queue: state.queue,
            currentTime: currentTime,
            accentColor: useSettingsStore.getState().accentColor,
            customColors: useSettingsStore.getState().customColors
          };
          
          if (state.isPlaying !== prevState?.isPlaying || state.currentIndex !== prevState?.currentIndex || state.queue?.length !== prevState?.queue?.length) {
              socket?.emit('holad_updateState', { roomId: get().roomId, deviceId, ...stateToSync });
          }
        } else if (currentActive && currentActive !== deviceId) {
          const queueChanged = state.queue !== prevState?.queue || state.queue?.length !== prevState?.queue?.length;
          
          if (queueChanged || (state.currentIndex !== prevState?.currentIndex && Math.abs(state.currentIndex - (prevState?.currentIndex || 0)) > 1)) {
             // User selected a new playlist/album or jumped to a completely different track
             isApplyingRemoteState = true;
             usePlayerStore.setState({ 
                queue: prevState?.queue || [], 
                currentIndex: prevState?.currentIndex || 0,
                isPlaying: prevState?.isPlaying || false
             }); 
             setTimeout(() => { isApplyingRemoteState = false; }, 10);
             
             socket?.emit('holad_remoteCommand', { 
                type: 'setQueue', 
                payload: { queue: state.queue, currentIndex: state.currentIndex } 
             });
             socket?.emit('holad_remoteCommand', { type: 'play' });
          } else {
            if (state.isPlaying !== prevState?.isPlaying) {
               isApplyingRemoteState = true;
               usePlayerStore.setState({ isPlaying: prevState?.isPlaying }); 
               setTimeout(() => { isApplyingRemoteState = false; }, 10);
               
               socket?.emit('holad_remoteCommand', { type: state.isPlaying ? 'play' : 'pause' });
            }
            
            if (state.currentIndex !== prevState?.currentIndex) {
               isApplyingRemoteState = true;
               usePlayerStore.setState({ currentIndex: prevState?.currentIndex }); 
               setTimeout(() => { isApplyingRemoteState = false; }, 10);
               
               if (state.currentIndex > (prevState?.currentIndex || 0)) {
                   socket?.emit('holad_remoteCommand', { type: 'next' });
               } else {
                   socket?.emit('holad_remoteCommand', { type: 'prev' });
               }
            }
          }
        }
      });

      unsubscribeSettings = useSettingsStore.subscribe((state, prevState) => {
        if (isApplyingRemoteState) return;
        
        const accentColorChanged = state.accentColor !== prevState?.accentColor;
        const customColorsChanged = state.customColors !== prevState?.customColors;

        if (accentColorChanged || customColorsChanged) {
           socket?.emit('holad_updateSettings', { 
               roomId: get().roomId, 
               deviceId, 
               accentColor: state.accentColor,
               customColors: state.customColors
           });
        }
      });
    },

    disconnect: () => {
      isInitialSync = true;
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }
      if (unsubscribeSettings) {
        unsubscribeSettings();
        unsubscribeSettings = null;
      }
      set({ socket: null, devices: [], activeDeviceId: null, roomId: null, connectionStatus: 'disconnected', connectError: null });
    },

    setActiveDevice: (id: string) => {
      const state = get();
      if (state.socket) {
        if (state.activeDeviceId && state.activeDeviceId !== state.deviceId) {
           // Ask the current active device to transfer playback to us, providing its latest precise state first
           state.socket.emit('holad_remoteCommand', { type: 'requestTransfer', payload: id });
        } else {
           state.socket.emit('holad_setActiveDevice', id);
        }
      }
    },

    sendRemoteCommand: (type: string, payload?: any) => {
      if (socket) {
        socket.emit('holad_remoteCommand', { type, payload });
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
      
      if (state.socket) {
        state.socket.emit('holad_remoteCommand', { type: 'requestHistory' });
      }
    }
  };
});
