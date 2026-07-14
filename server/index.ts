import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import md5 from 'md5';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // For development. In production, restrict this.
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const NAVIDROME_URL = process.env.NAVIDROME_URL || '';
const NAVIDROME_USER = process.env.NAVIDROME_USER || '';
const NAVIDROME_PASS = process.env.NAVIDROME_PASS || '';

function getSubsonicAuthParams() {
  const salt = Math.random().toString(36).substring(2, 15);
  const token = md5(NAVIDROME_PASS + salt);
  return `u=${encodeURIComponent(NAVIDROME_USER)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
}

// Proxy generic subsonic API requests for guests
app.get('/api/subsonic/:endpoint', async (req, res) => {
  const { endpoint } = req.params;
  try {
    const authParams = getSubsonicAuthParams();
    const query = new URLSearchParams(req.query as any).toString();
    const url = `${NAVIDROME_URL}/rest/${endpoint}?${query}&${authParams}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch from Subsonic');
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && (contentType.includes('image/') || contentType.includes('audio/'))) {
      res.set('Content-Type', contentType);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('Error proxying subsonic API:', error);
    res.status(500).send('Server Error');
  }
});

// Proxy audio stream to protect Navidrome credentials
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).send('Missing track ID');
  }

  try {
    const { u, t, s, v, c, f, serverUrl } = req.query;
    let authParams = '';
    if (u && t && s) {
      authParams = `u=${u}&t=${t}&s=${s}&v=${v||'1.16.1'}&c=${c||'StreamNavi'}&f=${f||'json'}`;
    } else {
      authParams = getSubsonicAuthParams();
    }
    const targetServer = serverUrl ? decodeURIComponent(serverUrl as string) : NAVIDROME_URL;
    const streamUrl = `${targetServer}/rest/stream?id=${id}&${authParams}`;
    
    const response = await fetch(streamUrl);
    
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch stream');
    }

    res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.set('Content-Length', response.headers.get('content-length') || '');
    if (response.headers.get('accept-ranges')) {
      res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
    }
    
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump().catch(err => {
        console.error('Stream error:', err);
        res.end();
      });
    } else {
      res.status(500).send('No response body');
    }
  } catch (error) {
    console.error('Error proxying stream:', error);
    res.status(500).send('Server Error');
  }
});

type Role = 'host' | 'cohost' | 'listener';
type Participant = { id: string; name: string; role: Role };

interface Room {
  hostId: string;
  currentTrackId: string | null;
  currentTime: number;
  isPlaying: boolean;
  queue: any[];
  currentIndex: number;
  isAutoDjEnabled: boolean;
  stateVersion: number;
  participants: Participant[];
}

const rooms = new Map<string, Room>();

const broadcastParticipants = (roomId: string) => {
  const room = rooms.get(roomId);
  if (room) {
    io.to(roomId).emit('participants', room.participants);
  }
};

const isHostOrCohost = (room: Room, socketId: string) => {
  if (room.hostId === socketId) return true;
  const p = room.participants.find(p => p.id === socketId);
  return p && p.role === 'cohost';
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('createRoom', (name?: string) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    
    const hostName = name || 'Host';
    const newRoom: Room = { 
      hostId: socket.id, 
      currentTrackId: null, 
      currentTime: 0, 
      isPlaying: false, 
      queue: [], 
      currentIndex: 0,
      isAutoDjEnabled: false,
      stateVersion: 0,
      participants: [{ id: socket.id, name: hostName, role: 'host' }]
    };
    rooms.set(roomId, newRoom);
    
    socket.emit('roomCreated', { roomId, role: 'host' });
    broadcastParticipants(roomId);
    console.log(`Room ${roomId} created by host ${socket.id}`);
  });

  socket.on('joinRoom', (data: { roomId: string, name: string }) => {
    const { roomId, name } = data;
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    socket.join(roomId);
    
    const guestName = name || 'Guest';
    const existingIndex = room.participants.findIndex(p => p.name === guestName && p.role !== 'host');
    
    if (existingIndex !== -1) {
      const oldId = room.participants[existingIndex].id;
      // Disconnect the old socket to prevent duplicates
      const oldSocket = io.sockets.sockets.get(oldId);
      if (oldSocket && oldId !== socket.id) {
        oldSocket.emit('error', 'Открыта новая вкладка с этим именем');
        oldSocket.leave(roomId);
      }
      room.participants[existingIndex].id = socket.id;
      socket.emit('roomJoined', { roomId, role: room.participants[existingIndex].role, state: room });
    } else {
      room.participants.push({ id: socket.id, name: guestName, role: 'listener' });
      socket.emit('roomJoined', { roomId, role: 'listener', state: room });
    }
    
    broadcastParticipants(roomId);
    console.log(`Client ${socket.id} joined room ${roomId}`);
  });

  socket.on('leaveRoom', (roomId: string) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.hostId === socket.id) {
        // Host leaves -> destroy room
        io.to(roomId).emit('error', 'Сессия была завершена хостом');
        rooms.delete(roomId);
      } else {
        // Guest leaves
        socket.leave(roomId);
        const index = room.participants.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.participants.splice(index, 1);
          broadcastParticipants(roomId);
        }
      }
    }
  });

  socket.on('grantRole', (data: { roomId: string, userId: string, role: Role }) => {
    const room = rooms.get(data.roomId);
    if (room && room.hostId === socket.id) {
      const p = room.participants.find(p => p.id === data.userId);
      if (p && p.id !== room.hostId) {
        p.role = data.role;
        io.to(p.id).emit('roleChanged', data.role);
        broadcastParticipants(data.roomId);
      }
    }
  });

  socket.on('kickParticipant', (data: { roomId: string, userId: string }) => {
    const room = rooms.get(data.roomId);
    if (room && room.hostId === socket.id) {
      const index = room.participants.findIndex(p => p.id === data.userId);
      const participant = room.participants[index];
      if (participant && participant.id !== room.hostId) {
        const kickedId = participant.id;
        room.participants.splice(index, 1);
        io.to(kickedId).emit('kicked');
        broadcastParticipants(data.roomId);
      }
    }
  });

  // Sync events
  socket.on('syncState', (data: { roomId: string, trackId: string, currentTime: number, isPlaying: boolean, currentIndex: number, isAutoDjEnabled: boolean, version?: number }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      // If version is provided, ensure it's not older than our stateVersion to prevent race condition reverting
      if (data.version !== undefined && data.version < room.stateVersion) {
        return; // Ignore outdated syncState
      }
      if (data.isPlaying !== room.isPlaying) {
        room.stateVersion += 1;
      }
      room.currentTrackId = data.trackId;
      room.currentTime = data.currentTime;
      room.isPlaying = data.isPlaying;
      room.currentIndex = data.currentIndex;
      if (data.isAutoDjEnabled !== undefined) {
        room.isAutoDjEnabled = data.isAutoDjEnabled;
      }
      // Broadcast to everyone else
      socket.to(data.roomId).emit('syncState', { ...room, version: room.stateVersion });
      // Send version back to sender so their next ping isn't outdated
      if (data.version !== undefined && room.stateVersion > data.version) {
        socket.emit('syncStateVersion', room.stateVersion);
      }
    }
  });

  socket.on('syncQueue', (data: { roomId: string, queue: any[], currentIndex: number }) => {
    const room = rooms.get(data.roomId);
    if (room && isHostOrCohost(room, socket.id)) {
      room.stateVersion += 1; // Increment version on major change
      room.queue = data.queue;
      room.currentIndex = data.currentIndex;
      socket.to(data.roomId).emit('syncQueue', { queue: data.queue, currentIndex: data.currentIndex, version: room.stateVersion });
      // Tell sender about the new version
      socket.emit('syncStateVersion', room.stateVersion);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        io.to(roomId).emit('error', 'Host disconnected');
        rooms.delete(roomId);
      } else {
        const index = room.participants.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.participants.splice(index, 1);
          broadcastParticipants(roomId);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
