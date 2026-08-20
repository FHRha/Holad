import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from './playerStore';
import { useAudioStore } from './audioStore';
import { useSettingsStore } from './settingsStore';
import { useHistoryStore } from './historyStore';
import { useUIStore } from './uiStore';
import { useAuthStore } from './authStore';
import { getSocketUrl } from '../utils/serverConfig';
import { isTauri, isCapacitor } from '../utils/StorageManager';

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
  connect: (roomId: string) => void;
  disconnect: () => void;
  setActiveDevice: (deviceId: string) => void;
  sendRemoteCommand: (type: string, payload?: any) => void;
  triggerManualSync: () => Promise<void>;
}



function generateDeviceId() {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return Math.random().toString(36).substring(2, 15);
  }
  let id = sessionStorage.getItem('holad_deviceId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
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

    connect: (roomId: string) => {
      if (socket) return;

      socket = io(getSocketUrl(), {
        path: '/Holad/socket.io',
        transports: ['websocket', 'polling']
      });

      set({ socket, roomId });

      socket.on('connect', () => {
        const { user, salt, token, url } = useAuthStore.getState();
        socket!.emit('holad_joinRoom', { 
          roomId, 
          deviceId, 
          deviceName,
          auth: { user, salt, token, url } 
        });
      });

      socket.on('holad_authError', (message: string) => {
        console.error('[Holad] Auth Error:', message);
        get().disconnect();
      });

      socket.on('holad_devices', (data: { devices: HoladDevice[], activeDeviceId: string | null }) => {
        const wasNotActive = get().activeDeviceId !== deviceId;
        set({ devices: data.devices, activeDeviceId: data.activeDeviceId });
        
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
               if (track && track.duration) {
                  const targetTime = (audioStore.progress / 100) * track.duration;
                  playerStore.setInitialPosition(targetTime * 1000);
                  
                  if (audioStore.audioElement && playerStore.isPlaying) {
                     audioStore.audioElement.play().catch(() => {});
                  }
               }
            }
        }
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
            fetch(`${getSocketUrl()}/api/holad/history/${encodeURIComponent(get().roomId!)}`, {
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
           fetch(`${getSocketUrl()}/api/holad/history/${encodeURIComponent(get().roomId!)}`, {
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
               const localHistory = useHistoryStore.getState().history;
               console.log('[Holad] localHistory length is:', localHistory.length);
               if (localHistory.length === 0 || historyData.length === 0) {
                 console.log('[Holad] Merging history silently');
                 useHistoryStore.getState().syncHistoryData(historyData);
               } else {
                 const localIds = new Set(localHistory.map(t => t.id));
                 const remoteIds = new Set(historyData.map((t: any) => t.id));
                 let overlapCount = 0;
                 localIds.forEach(id => {
                     if (remoteIds.has(id)) overlapCount++;
                 });
                 const minSize = Math.min(localIds.size, remoteIds.size);
                 const overlapPercentage = (overlapCount / minSize) * 100;
                 
                 if (overlapPercentage > 50) {
                     console.log('[Holad] Merging history silently (>50% overlap)');
                     useHistoryStore.getState().syncHistoryData(historyData);
                 } else {
                     console.log('[Holad] Triggering SyncConflictModal (<=50% overlap)');
                     useUIStore.getState().setPendingHistorySync(historyData);
                 }
               }
             })
             .catch(err => console.error('[Holad] Failed to fetch history:', err));
           return;
        }

        if (command.type === 'clearHistory') {
          useHistoryStore.getState().clearHistory();
          return;
        }

        const currentActive = get().activeDeviceId;
        if (currentActive === deviceId) {
          const store = usePlayerStore.getState();
          switch (command.type) {
            case 'requestTransfer':
              // We are active. Someone wants to take over. Send our exact state first, then transfer.
              let currentTime = 0;
              if (useAudioStore.getState().audioElement) {
                 currentTime = useAudioStore.getState().audioElement!.currentTime;
              } else {
                 const track = store.queue[store.currentIndex];
                 if (track && track.duration) {
                    currentTime = (useAudioStore.getState().progress / 100) * track.duration;
                 }
              }
              const stateToSync = {
                isPlaying: store.isPlaying,
                currentIndex: store.currentIndex,
                queue: store.queue,
                currentTime: currentTime
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
              store.setInitialPosition(command.payload);
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
          if (useAudioStore.getState().audioElement) {
             currentTime = useAudioStore.getState().audioElement!.currentTime;
          } else {
             const track = state.queue[state.currentIndex];
             if (track && track.duration) {
                currentTime = (useAudioStore.getState().progress / 100) * track.duration;
             }
          }

          const stateToSync = {
            isPlaying: state.isPlaying,
            currentIndex: state.currentIndex,
            queue: state.queue,
            currentTime: currentTime
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
      set({ socket: null, devices: [], activeDeviceId: null, roomId: null });
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
      
      try {
        const { user, token, salt, url } = useAuthStore.getState();
        const res = await fetch(`${getSocketUrl()}/api/holad/history/${encodeURIComponent(state.roomId)}`, {
          headers: {
            'x-user': encodeURIComponent(user),
            'x-token': encodeURIComponent(token),
            'x-salt': encodeURIComponent(salt),
            'x-url': encodeURIComponent(url)
          }
        });
        
        if (res.ok) {
          const historyData = await res.json();
          
          const localHistory = useHistoryStore.getState().history;
          if (localHistory.length === 0 || historyData.length === 0) {
            useHistoryStore.getState().syncHistoryData(historyData);
          } else {
            const localIds = new Set(localHistory.map(t => t.id));
            const remoteIds = new Set(historyData.map((t: any) => t.id));
            
            let overlapCount = 0;
            localIds.forEach(id => {
                if (remoteIds.has(id)) overlapCount++;
            });
            
            const minSize = Math.min(localIds.size, remoteIds.size);
            const overlapPercentage = (overlapCount / minSize) * 100;
            
            if (overlapPercentage > 50) {
                useHistoryStore.getState().syncHistoryData(historyData);
            } else {
                useUIStore.getState().setPendingHistorySync(historyData);
            }
          }
        } else {
          console.log('[Holad] Manual sync GET returned status:', res.status);
        }
      } catch (err) {
        console.error('[Holad] Failed manual sync via REST:', err);
      }
      
      if (state.socket) {
        state.socket.emit('holad_remoteCommand', { type: 'requestHistory' });
      }
    }
  };
});
