import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';

process.env.PORT = '0';
process.env.NAVIDROME_URL = 'http://mock-navidrome.local';
process.env.NAVIDROME_USER = 'testuser';
process.env.NAVIDROME_PASS = 'testpass';

import { app, httpServer, io } from '../index.js';

let port: number;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    const checkAddress = () => {
      const address = httpServer.address();
      if (address && typeof address !== 'string') {
        port = address.port;
        resolve();
      } else {
        setTimeout(checkAddress, 100);
      }
    };
    if (httpServer.listening) {
      checkAddress();
    } else {
      httpServer.on('listening', checkAddress);
    }
  });
});

afterAll(() => {
  httpServer.close();
});

describe('API Endpoints', () => {
  it('should return ok for /api/ping', async () => {
    const res = await request(app).get('/api/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, server: 'holad' });
  });

  it('should reject guest access to unauthorized subsonic endpoints', async () => {
    const res = await request(app).get('/api/subsonic/getUsers');
    expect(res.status).toBe(403);
  });
});

describe('WebSocket Events', () => {
  let clientSocket: ClientSocket;
  let roomId: string;

  beforeAll(async () => {
    clientSocket = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        resolve();
      });
    });
  });

  afterAll(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  it('should create a room and receive roomCreated event', async () => {
    return new Promise<void>((resolve) => {
      clientSocket.emit('createRoom', { name: 'Host User' });
      clientSocket.once('roomCreated', (data) => {
        expect(data).toHaveProperty('roomId');
        expect(data).toHaveProperty('role', 'host');
        roomId = data.roomId;
        resolve();
      });
    });
  });

  it('should allow joining an existing room', async () => {
    return new Promise<void>((resolve) => {
      const guestSocket = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
      guestSocket.on('connect', () => {
        guestSocket.emit('joinRoom', { roomId, name: 'Guest User' });
        guestSocket.once('roomJoined', (data) => {
          expect(data.roomId).toBe(roomId);
          expect(data.role).toBe('listener');
          guestSocket.disconnect();
          resolve();
        });
      });
    });
  });

  it('should allow host to sync state', async () => {
    return new Promise<void>((resolve) => {
      const guestSocket = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
      guestSocket.on('connect', () => {
        guestSocket.emit('joinRoom', { roomId, name: 'Guest User' });
        
        guestSocket.once('roomJoined', () => {
          guestSocket.once('syncState', (state) => {
            expect(state.isPlaying).toBe(true);
            expect(state.currentTrackId).toBe('123');
            guestSocket.disconnect();
            resolve();
          });

          clientSocket.emit('syncState', {
            roomId,
            trackId: '123',
            currentTime: 10,
            isPlaying: true,
            currentIndex: 0,
            isAutoDjEnabled: false
          });
        });
      });
    });
  });
});
