import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from './playerStore';
import { useAudioStore } from './audioStore';

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
  let isApplyingRemoteState = false;

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
        set({ devices: data.devices, activeDeviceId: data.activeDeviceId });
        
        if (data.activeDeviceId === null) {
            usePlayerStore.getState().setIsPlaying(false);
        }
      });

      socket.on('holad_syncState', (state: any) => {
        isApplyingRemoteState = true;
        const store = usePlayerStore.getState();
        if (state.isPlaying !== undefined) store.setIsPlaying(state.isPlaying);
        if (state.currentIndex !== undefined) store.setCurrentIndex(state.currentIndex);
        if (state.queue) usePlayerStore.setState({ queue: state.queue });
        
        setTimeout(() => { isApplyingRemoteState = false; }, 50);
      });

      socket.on('holad_remoteCommand', (command: { type: string, payload?: any }) => {
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
          const stateToSync = {
            isPlaying: state.isPlaying,
            currentIndex: state.currentIndex,
            queue: state.queue 
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
      set({ socket: null, devices: [], activeDeviceId: null, roomId: null });
    },

    setActiveDevice: (id: string) => {
      if (socket) {
        socket.emit('holad_setActiveDevice', id);
        
        // When we take control, assert our state to the room
        if (id === get().deviceId) {
          const state = usePlayerStore.getState();
          socket.emit('holad_updateState', {
              roomId: get().roomId,
              deviceId: get().deviceId,
              isPlaying: state.isPlaying,
              currentIndex: state.currentIndex,
              queue: state.queue
          });
        }
        
        if (id === get().deviceId) {
          const store = useAudioStore.getState();
          const playerStore = usePlayerStore.getState();
          if (playerStore.queue.length > 0 && playerStore.currentIndex >= 0) {
             const track = playerStore.queue[playerStore.currentIndex];
             if (track && track.duration) {
                const targetTime = (store.progress / 100) * track.duration;
                playerStore.setInitialPosition(targetTime * 1000);
                
                if (store.audioElement) {
                   if (playerStore.isPlaying) {
                      store.audioElement.play().catch(() => {});
                   }
                }
             }
          }
        }
      }
    },

    sendRemoteCommand: (type: string, payload?: any) => {
      if (socket) {
        socket.emit('holad_remoteCommand', { type, payload });
      }
    }
  };
});
