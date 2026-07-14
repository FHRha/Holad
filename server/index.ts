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

// Proxy audio stream to protect Navidrome credentials
app.get('/api/stream/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).send('Missing track ID');
  }

  try {
    const authParams = getSubsonicAuthParams();
    const streamUrl = `${NAVIDROME_URL}/rest/stream?id=${id}&${authParams}`;
    
    // Instead of piping from our server (which can use a lot of bandwidth),
    // wait... if we just redirect, the client gets the full streamUrl with the credentials!
    // We MUST pipe the audio to hide the credentials from listeners.
    const response = await fetch(streamUrl);
    
    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch stream');
    }

    // Pass headers
    res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.set('Content-Length', response.headers.get('content-length') || '');
    if (response.headers.get('accept-ranges')) {
      res.set('Accept-Ranges', response.headers.get('accept-ranges') || '');
    }
    
    // Convert ReadableStream to Node.js stream and pipe
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

// Socket.io for Jam Sessions
const rooms = new Map<string, { hostId: string, currentTrackId: string | null, currentTime: number, isPlaying: boolean }>();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('createRoom', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    socket.join(roomId);
    rooms.set(roomId, { hostId: socket.id, currentTrackId: null, currentTime: 0, isPlaying: false });
    socket.emit('roomCreated', { roomId, role: 'host' });
    console.log(`Room ${roomId} created by host ${socket.id}`);
  });

  socket.on('joinRoom', (roomId: string) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, role: 'listener', state: room });
    console.log(`Client ${socket.id} joined room ${roomId}`);
  });

  // Host events
  socket.on('syncState', (data: { roomId: string, trackId: string, currentTime: number, isPlaying: boolean }) => {
    const room = rooms.get(data.roomId);
    if (room && room.hostId === socket.id) {
      room.currentTrackId = data.trackId;
      room.currentTime = data.currentTime;
      room.isPlaying = data.isPlaying;
      socket.to(data.roomId).emit('syncState', room);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Cleanup if host disconnects
    for (const [roomId, room] of rooms.entries()) {
      if (room.hostId === socket.id) {
        io.to(roomId).emit('error', 'Host disconnected');
        rooms.delete(roomId);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
