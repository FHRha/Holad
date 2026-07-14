import { io, Socket } from 'socket.io-client';
import { usePlayerStore } from '../store/playerStore';

// Assuming Vite proxy handles /socket.io
// In production, this would be the actual server URL if different
const SOCKET_URL = '/'; 

class JamSocketService {
  private socket: Socket | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

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
      this.applySyncState(state);
    });

    this.socket.on('syncState', (state) => {
      const { role } = usePlayerStore.getState();
      if (role === 'listener') {
        this.applySyncState(state);
      }
    });

    this.socket.on('error', (msg) => {
      console.error('Socket Error:', msg);
      alert(msg);
      usePlayerStore.getState().setRoomInfo(null, null);
      this.stopHostSync();
    });
  }
  createRoom() {
    this.socket?.emit('createRoom');
  }

  joinRoom(roomId: string) {
    this.socket?.emit('joinRoom', roomId);
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
    this.syncInterval = setInterval(() => {
      const { roomId, queue, currentIndex, isPlaying } = usePlayerStore.getState();
      if (roomId && queue.length > 0 && currentIndex >= 0) {
        const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;
        if (audioEl) {
          this.socket?.emit('syncState', {
            roomId,
            trackId: queue[currentIndex].id,
            currentTime: audioEl.currentTime,
            isPlaying
          });
        }
      }
    }, 2000); // Send sync ping every 2 seconds
  }

  private stopHostSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private applySyncState(state: any) {
    const { trackId, currentTime, isPlaying } = state;
    const store = usePlayerStore.getState();
    const audioEl = document.getElementById('main-audio-player') as HTMLAudioElement;

    // Check if we need to change track
    const currentTrack = store.queue[store.currentIndex];
    if (!currentTrack || currentTrack.id !== trackId) {
      // Find track in queue or we have a problem. 
      // For simplicity, if Host plays a track not in listener's queue, 
      // the listener needs that track added to queue.
      // But we will just assume listener has the same queue for now,
      // or we dispatch an event to fetch it.
      // A better approach: Host broadcasts the full track object when it changes.
      // Let's implement that in the next iteration.
      console.log("Track changed by host to", trackId);
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
