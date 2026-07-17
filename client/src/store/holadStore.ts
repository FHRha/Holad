import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from './playerStore';
import { useAudioStore } from './audioStore';
import { useSettingsStore } from './settingsStore';

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
}

const SOCKET_URL = '/';

function generateDeviceId() {
  let id = sessionStorage.getItem('holad_deviceId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('holad_deviceId', id);
  }
  return id;
}

function getDeviceName() {
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const browser = /Chrome/.test(navigator.userAgent) ? 'Chrome' : 
                  /Safari/.test(navigator.userAgent) ? 'Safari' : 
                  /Firefox/.test(navigator.userAgent) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(navigator.userAgent) ? 'Windows' : 
             /Mac/.test(navigator.userAgent) ? 'Mac' : 
             /Linux/.test(navigator.userAgent) ? 'Linux' : 
             /Android/.test(navigator.userAgent) ? 'Android' : 
             /iOS|iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : 'OS';
  
  return `${isMobile ? 'Mobile' : 'Desktop'} ${browser} on ${os}`;
}

export const useHoladStore = create<HoladState>((set, get) => {
  let socket: Socket | null = null;
  let unsubscribeStore: (() => void) | null = null;
  let unsubscribeSettings: (() => void) | null = null;
  let isApplyingRemoteState = false;
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

    connect: (roomId: string) => {
      if (socket) return;

      socket = io(SOCKET_URL, {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });

      set({ socket, roomId });

      socket.on('connect', () => {
        socket!.emit('holad_joinRoom', { roomId, deviceId, deviceName });
      });

      socket.on('holad_devices', (data: { devices: HoladDevice[], activeDeviceId: string | null }) => {
        const wasNotActive = get().activeDeviceId !== deviceId;
        set({ devices: data.devices, activeDeviceId: data.activeDeviceId });
        
        // Request history if we just joined and there's an active device to ask
        if (!hasRequestedHistory && data.activeDeviceId && data.activeDeviceId !== deviceId) {
          hasRequestedHistory = true;
          console.log('[Holad] Emitting requestHistory because activeDevice is', data.activeDeviceId);
          socket!.emit('holad_remoteCommand', { type: 'requestHistory' });
        }

        if (data.activeDeviceId === null) {
            usePlayerStore.getState().setIsPlaying(false);
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
        if (state.isPlaying !== undefined) store.setIsPlaying(state.isPlaying);
        if (state.currentIndex !== undefined) store.setCurrentIndex(state.currentIndex);
        if (state.queue) usePlayerStore.setState({ queue: state.queue });
        
        if (state.currentTime !== undefined) {
          const track = store.queue[state.currentIndex !== undefined ? state.currentIndex : store.currentIndex];
          if (track && track.duration) {
            useAudioStore.getState().setProgress((state.currentTime / track.duration) * 100);
          }
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
        
        setTimeout(() => { isApplyingRemoteState = false; }, 50);
      });

      socket.on('holad_remoteCommand', (command: { type: string, payload?: any }) => {
        
        if (command.type === 'syncHistory') {
          import('./historyStore').then(({ useHistoryStore }) => {
            useHistoryStore.getState().addTrackToHistory(command.payload.track, command.payload.playedAt);
          });
          return;
        }
        
        if (command.type === 'requestHistory') {
          console.log('[Holad] Received requestHistory. Am I active?', get().activeDeviceId === deviceId);
          if (get().activeDeviceId === deviceId) {
            import('./historyStore').then(({ useHistoryStore }) => {
               const history = useHistoryStore.getState().history;
               console.log('[Holad] Emitting syncFullHistory with tracks:', history.length);
               if (history.length > 0) {
                 socket!.emit('holad_remoteCommand', { type: 'syncFullHistory', payload: history });
               }
            });
          }
          return;
        }
        
        if (command.type === 'syncFullHistory') {
           console.log('[Holad] Received syncFullHistory with tracks:', command.payload.length);
           import('./historyStore').then(({ useHistoryStore }) => {
             const localHistory = useHistoryStore.getState().history;
             console.log('[Holad] localHistory length is:', localHistory.length);
             if (localHistory.length === 0 && command.payload.length > 0) {
               console.log('[Holad] Triggering SyncConflictModal');
               import('./uiStore').then(({ useUIStore }) => {
                 useUIStore.getState().setPendingHistorySync(command.payload);
               });
             } else {
               console.log('[Holad] Merging history silently');
               useHistoryStore.getState().syncHistoryData(command.payload);
             }
           });
           return;
        }

        if (command.type === 'clearHistory') {
          import('./historyStore').then(({ useHistoryStore }) => {
            useHistoryStore.getState().clearHistory();
          });
          return;
        }

        const currentActive = get().activeDeviceId;
        if (currentActive === deviceId) {
          const store = usePlayerStore.getState();
          switch (command.type) {
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
           socket?.emit('holad_updateState', { 
               roomId: get().roomId, 
               deviceId, 
               accentColor: state.accentColor,
               customColors: state.customColors
           });
        }
      });
    },

    disconnect: () => {
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
      if (socket) {
        socket.emit('holad_setActiveDevice', id);
      }
    },

    sendRemoteCommand: (type: string, payload?: any) => {
      if (socket) {
        socket.emit('holad_remoteCommand', { type, payload });
      }
    }
  };
});
