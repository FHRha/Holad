import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';

// Assuming Vite proxy handles /socket.io
// In production, this would be the actual server URL if different
const SOCKET_URL = '/'; 

class JamSocketService {
  private socket: Socket | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private isApplyingRemoteState = false;
  private latestStateVersion: number = 0;

  connect() {
    if (this.socket) return;
    this.socket = io(SOCKET_URL, {
      path: '/socket.io',
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
      usePlayerStore.getState().setJamError('Вас исключили из сессии');
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
    this.socket?.emit('createRoom', name);
  }

  joinRoom(roomId: string, name: string) {
    this.socket?.emit('joinRoom', { roomId, name });
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
      if (state.roomId && state.queue.length > 0 && state.currentIndex >= 0 && (state.role === 'host' || state.role === 'cohost')) {
        const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
        if (audioEl) {
          this.socket?.emit('syncState', {
            roomId: state.roomId,
            trackId: state.queue[state.currentIndex].id,
            currentTime: audioEl.currentTime,
            isPlaying: state.isPlaying,
            currentIndex: state.currentIndex,
            isAutoDjEnabled: state.isAutoDjEnabled,
            version: this.latestStateVersion
          });
        }
      }
    }, 2000); // Send sync ping every 2 seconds

    this.unsubscribeStore = usePlayerStore.subscribe((newState, prevState) => {
      if (this.isApplyingRemoteState) return;
      
      if (newState.roomId && (newState.role === 'host' || newState.role === 'cohost')) {
        if (newState.queue !== prevState.queue || newState.currentIndex !== prevState.currentIndex) {
          this.socket?.emit('syncQueue', { roomId: newState.roomId, queue: newState.queue, currentIndex: newState.currentIndex });
        }
        if (newState.isPlaying !== prevState.isPlaying) {
          const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
          if (audioEl) {
            this.socket?.emit('syncState', {
              roomId: newState.roomId,
              trackId: newState.queue[newState.currentIndex]?.id,
              currentTime: audioEl.currentTime,
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

    // Apply queue if present (initial join)
    if (queue && queue.length > 0 && queue !== store.queue) {
      usePlayerStore.setState({ queue, currentIndex: currentIndex !== undefined ? currentIndex : 0 });
    } else if (currentIndex !== undefined && currentIndex !== store.currentIndex) {
      usePlayerStore.setState({ currentIndex });
    }

    if (isAutoDjEnabled !== undefined && isAutoDjEnabled !== store.isAutoDjEnabled) {
      usePlayerStore.setState({ isAutoDjEnabled });
    }

    if (audioEl) {
      // Drift threshold: 1.5 seconds
      const drift = Math.abs(audioEl.currentTime - currentTime);
      if (drift > 1.5) {
        console.log(`Drift detected (${drift}s), seeking to match host`);
        audioEl.currentTime = currentTime;
      }

      if (isPlaying && audioEl.paused) {
        audioEl.play().catch(e => console.error("Playback prevented", e));
        store.setIsPlaying(true);
      } else if (!isPlaying && !audioEl.paused) {
        audioEl.pause();
        store.setIsPlaying(false);
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
