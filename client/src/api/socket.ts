import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';
import { useHoladStore } from '../store/holadStore';
import { useAudioStore } from '../store/audioStore';
import i18n from '../i18n';

import { getSocketUrl } from '../utils/serverConfig';

class JamSocketService {
  private socket: Socket | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private isApplyingRemoteState = false;
  private latestStateVersion: number = 0;

  connect() {
    if (this.socket) return;
    
    this.socket = io(getSocketUrl(), {
      path: '/Holad/socket.io',
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Jam Server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Jam Server');
    });

    this.socket.on('roomCreated', ({ roomId, role }) => {
      usePlayerStore.getState().setRoomInfo(roomId, role);
      this.startHostSync();
    });

    this.socket.on('roomJoined', ({ roomId, role, state }) => {
      usePlayerStore.getState().setRoomInfo(roomId, role);
      this.stopHostSync(); // Listeners don't sync state outwards
      // Immediately apply host's state
      this.isApplyingRemoteState = true;
      this.applySyncState(state);
      this.isApplyingRemoteState = false;
    });

    this.socket.on('syncStateVersion', (version) => {
      if (version > this.latestStateVersion) {
        this.latestStateVersion = version;
      }
    });

    this.socket.on('syncState', (state) => {
      if (state.version !== undefined) {
        this.latestStateVersion = state.version;
      }
      this.isApplyingRemoteState = true;
      this.applySyncState(state);
      this.isApplyingRemoteState = false;
    });

    this.socket.on('syncQueue', ({ queue, currentIndex, version }) => {
      if (version !== undefined) {
        this.latestStateVersion = version;
      }
      const currentStore = usePlayerStore.getState();
      if (queue !== currentStore.queue || currentIndex !== currentStore.currentIndex) {
        this.isApplyingRemoteState = true;
        usePlayerStore.setState({ queue, currentIndex });
        this.isApplyingRemoteState = false;
      }
    });

    this.socket.on('participants', (participants) => {
      usePlayerStore.getState().setParticipants(participants);
    });

    // Fallback for older server code in case it wasn't restarted
    this.socket.on('participantsUpdated', (participants) => {
      usePlayerStore.getState().setParticipants(participants);
    });

    this.socket.on('roleChanged', (role) => {
      usePlayerStore.setState({ role });
      if (role === 'cohost') {
        this.startHostSync(); // start syncing outwards
      } else if (role === 'listener') {
        this.stopHostSync();
      }
    });

    this.socket.on('kicked', () => {
      usePlayerStore.getState().setJamError(i18n.t('jam.kicked', { defaultValue: 'Вас исключили из сессии' }));
      usePlayerStore.getState().setRoomInfo(null, null);
      this.stopHostSync();
      if (window.location.pathname.startsWith('/jam') && window.location.pathname !== '/jam/') {
        window.location.href = '/jam/';
      }
    });

    this.socket.on('error', (msg) => {
      usePlayerStore.getState().setJamError(msg);
      usePlayerStore.getState().setRoomInfo(null, null);
      this.stopHostSync();
      if (window.location.pathname.startsWith('/jam') && window.location.pathname !== '/jam/') {
        window.location.href = '/jam/';
      }
    });
  }
  createRoom(name?: string) {
    this.socket?.emit('createRoom', { name, sessionId: this.getSessionId() });
  }

  private getSessionId() {
    let sid = localStorage.getItem('jam_session_id');
    if (!sid) {
      sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('jam_session_id', sid);
    }
    return sid;
  }

  joinRoom(roomId: string, name?: string) {
    this.socket?.emit('joinRoom', { roomId, name, sessionId: this.getSessionId() });
  }

  grantRole(userId: string, role: 'host' | 'cohost' | 'listener') {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('grantRole', { roomId, userId, role });
    }
  }

  kickParticipant(userId: string) {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('kickParticipant', { roomId, userId });
    }
  }

  leaveRoom() {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('leaveRoom', roomId); // Optional implement on server
    }
    usePlayerStore.getState().setRoomInfo(null, null);
    this.stopHostSync();
  }

  private startHostSync() {
    this.stopHostSync();
    
    // Send initial queue
    const state = usePlayerStore.getState();
    if (state.roomId && state.queue.length > 0) {
      this.socket?.emit('syncQueue', { roomId: state.roomId, queue: state.queue, currentIndex: state.currentIndex });
    }

    this.syncInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.roomId && state.queue.length > 0 && state.currentIndex >= 0 && state.currentIndex < state.queue.length && (state.role === 'host' || state.role === 'cohost')) {
        const currentTrack = state.queue[state.currentIndex];
        
        let currentTime = 0;
        
        const holadState = useHoladStore.getState();
        const isDeviceActive = holadState.roomId === null || holadState.activeDeviceId === holadState.deviceId || holadState.activeDeviceId === null;
        
        if (isDeviceActive) {
          const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
          if (audioEl) {
            currentTime = audioEl.currentTime;
          }
        } else {
          currentTime = (useAudioStore.getState().progress / 100) * (currentTrack.duration || 0);
        }

        this.socket?.emit('syncState', {
          roomId: state.roomId,
          trackId: currentTrack.id,
          currentTime,
          isPlaying: state.isPlaying,
          currentIndex: state.currentIndex,
          isAutoDjEnabled: state.isAutoDjEnabled,
          version: this.latestStateVersion
        });
      }
    }, 2000); // Send sync ping every 2 seconds

    this.unsubscribeStore = usePlayerStore.subscribe((newState, prevState) => {
      if (this.isApplyingRemoteState) return;
      
      if (newState.roomId && (newState.role === 'host' || newState.role === 'cohost')) {
        const queueChanged = newState.queue !== prevState.queue;
        const indexChanged = newState.currentIndex !== prevState.currentIndex;

        if (queueChanged || indexChanged) {
          this.socket?.emit('syncQueue', { roomId: newState.roomId, queue: newState.queue, currentIndex: newState.currentIndex });
        }
        if (newState.isPlaying !== prevState.isPlaying || queueChanged || indexChanged) {
          const currentTrack = newState.queue[newState.currentIndex];
          if (currentTrack) {
            const prevTrackId = prevState.queue[prevState.currentIndex]?.id;
            const trackChanged = currentTrack.id !== prevTrackId;
            
            let currentTime = 0;
            const holadState = useHoladStore.getState();
            const isDeviceActive = holadState.roomId === null || holadState.activeDeviceId === holadState.deviceId || holadState.activeDeviceId === null;

            if (trackChanged) {
              currentTime = 0;
            } else if (isDeviceActive) {
              const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
              if (audioEl) {
                currentTime = audioEl.currentTime;
              }
            } else {
              currentTime = (useAudioStore.getState().progress / 100) * (currentTrack.duration || 0);
            }
            
            this.socket?.emit('syncState', {
              roomId: newState.roomId,
              trackId: currentTrack.id,
              currentTime,
              isPlaying: newState.isPlaying,
              currentIndex: newState.currentIndex,
              isAutoDjEnabled: newState.isAutoDjEnabled,
              version: this.latestStateVersion
            });
          }
        }
      }
    });
  }

  private stopHostSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  private applySyncState(state: any) {
    const { currentTime, isPlaying, currentIndex, queue, isAutoDjEnabled } = state;
    const store = usePlayerStore.getState();
    const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;

    // trackChanged removed
    
    const isQueueDifferent = () => {
      if (!queue || queue.length === 0) return false;
      if (!store.queue || queue.length !== store.queue.length) return true;
      for (let i = 0; i < queue.length; i++) {
        if (queue[i].id !== store.queue[i].id) return true;
      }
      return false;
    };

    const currentTrackId = store.queue && store.queue[store.currentIndex]?.id;
    const newQueue = queue || store.queue;
    const newIndex = currentIndex !== undefined ? currentIndex : store.currentIndex;
    const newTrackId = newQueue && newQueue[newIndex]?.id;
    const actualTrackChanged = currentTrackId !== newTrackId;

    // Apply queue if present (initial join or real change)
    if (isQueueDifferent()) {
      usePlayerStore.setState({ queue, currentIndex: currentIndex !== undefined ? currentIndex : 0 });
    } else if (currentIndex !== undefined && currentIndex !== store.currentIndex) {
      usePlayerStore.setState({ currentIndex });
    }

    if (actualTrackChanged && currentTime > 0) {
      usePlayerStore.getState().setInitialPosition(currentTime * 1000);
    }

    if (isAutoDjEnabled !== undefined && isAutoDjEnabled !== store.isAutoDjEnabled) {
      usePlayerStore.setState({ isAutoDjEnabled });
    }

    if (audioEl) {
      if (isPlaying && audioEl.paused) {
        audioEl.play().catch(e => console.error("Playback prevented", e));
        store.setIsPlaying(true);
      } else if (!isPlaying && !audioEl.paused) {
        audioEl.pause();
        store.setIsPlaying(false);
        audioEl.playbackRate = 1.0; // Reset rate on pause
      }

      if (isPlaying) {
        // Compensate for network latency (~150ms)
        const targetTime = currentTime + 0.15;
        const drift = targetTime - audioEl.currentTime;

        if (Math.abs(drift) > 4.0) {
          console.log(`Large drift detected (${Math.abs(drift).toFixed(2)}s), hard seeking to match host`);
          audioEl.currentTime = targetTime;
          audioEl.playbackRate = 1.0;
        } else if (drift > 0.15) {
          // We are behind the host, speed up
          if (audioEl.playbackRate !== 1.05) {
            audioEl.playbackRate = 1.05;
            console.log(`Soft sync: Catching up (+${drift.toFixed(2)}s)`);
          }
        } else if (drift < -0.15) {
          // We are ahead of the host, slow down
          if (audioEl.playbackRate !== 0.95) {
            audioEl.playbackRate = 0.95;
            console.log(`Soft sync: Waiting (-${Math.abs(drift).toFixed(2)}s)`);
          }
        } else {
          // Perfect sync
          if (audioEl.playbackRate !== 1.0) {
            audioEl.playbackRate = 1.0;
            console.log("Soft sync: Perfectly in sync");
          }
        }
      }
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const jamSocket = new JamSocketService();
