import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import * as database from '../src/database.js';

process.env.PORT = '0';
process.env.NAVIDROME_URL = 'http://mock-navidrome.local';
process.env.NAVIDROME_USER = 'testuser';
process.env.NAVIDROME_PASS = 'testpass';

import { app, httpServer, io, navidromeAccounts } from '../index.js';

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

  it('should return 404 for getCoverArt when id is missing or invalid', async () => {
    // Missing id
    const res1 = await request(app).get('/api/subsonic/getCoverArt');
    expect(res1.status).toBe(404);
    expect(res1.text).toBe('Cover art not found');

    // Empty id
    const res2 = await request(app).get('/api/subsonic/getCoverArt?id=');
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Cover art not found');

    // id='undefined'
    const res3 = await request(app).get('/api/subsonic/getCoverArt?id=undefined');
    expect(res3.status).toBe(404);
    expect(res3.text).toBe('Cover art not found');

    // id='null'
    const res4 = await request(app).get('/api/subsonic/getCoverArt?id=null');
    expect(res4.status).toBe(404);
    expect(res4.text).toBe('Cover art not found');

    // id='   '
    const res5 = await request(app).get('/api/subsonic/getCoverArt?id=%20%20');
    expect(res5.status).toBe(404);
    expect(res5.text).toBe('Cover art not found');
  });

  it('should support route alias /api/subsonic/rest/:endpoint for getCoverArt', async () => {
    const res1 = await request(app).get('/api/subsonic/rest/getCoverArt');
    expect(res1.status).toBe(404);
    expect(res1.text).toBe('Cover art not found');

    const res2 = await request(app).get('/api/subsonic/rest/getCoverArt?id=undefined');
    expect(res2.status).toBe(404);
    expect(res2.text).toBe('Cover art not found');
  });

  it('should handle cover art proxy endpoint /api/cover/:id and aliases', async () => {
    // GET /api/cover/undefined -> 404
    const resUndefined = await request(app).get('/api/cover/undefined');
    expect(resUndefined.status).toBe(404);
    expect(resUndefined.text).toBe('Cover art not found');

    // GET /api/cover/null -> 404
    const resNull = await request(app).get('/api/cover/null');
    expect(resNull.status).toBe(404);
    expect(resNull.text).toBe('Cover art not found');

    // GET /api/cover/invalid..id -> 400
    const resInvalid = await request(app).get('/api/cover/invalid..id');
    expect(resInvalid.status).toBe(400);
    expect(resInvalid.text).toBe('Invalid cover ID');

    // Verify /Holad/api/cover/undefined -> 404
    const resHoladUndefined = await request(app).get('/Holad/api/cover/undefined');
    expect(resHoladUndefined.status).toBe(404);
    expect(resHoladUndefined.text).toBe('Cover art not found');

    // Verify /Holad/api/subsonic/getCoverArt?id=undefined -> 404
    const resHoladSubsonic = await request(app).get('/Holad/api/subsonic/getCoverArt?id=undefined');
    expect(resHoladSubsonic.status).toBe(404);
    expect(resHoladSubsonic.text).toBe('Cover art not found');
  });
});

describe('Exclusions Database', () => {
  const testUserId = 'test-exclusions-user';

  it('should set and get exclusions for user', () => {
    database.setExclusions(testUserId, ['track-1', 'track-2'], ['album-1']);
    const exclusions = database.getExclusions(testUserId);
    expect(exclusions.excludedTrackIds).toEqual(['track-1', 'track-2']);
    expect(exclusions.excludedAlbumIds).toEqual(['album-1']);
  });

  it('should toggle exclusions for tracks and albums', () => {
    // track-1 is currently excluded; toggling should remove it and return false
    const removed = database.toggleExclusion(testUserId, 'track-1', 'track');
    expect(removed).toBe(false);

    let exclusions = database.getExclusions(testUserId);
    expect(exclusions.excludedTrackIds).toEqual(['track-2']);

    // Toggling track-1 again should add it and return true
    const added = database.toggleExclusion(testUserId, 'track-1', 'track');
    expect(added).toBe(true);

    exclusions = database.getExclusions(testUserId);
    expect(exclusions.excludedTrackIds).toContain('track-1');
    expect(exclusions.excludedTrackIds).toContain('track-2');

    // Toggling new album should add it and return true
    const albumAdded = database.toggleExclusion(testUserId, 'album-2', 'album');
    expect(albumAdded).toBe(true);
    exclusions = database.getExclusions(testUserId);
    expect(exclusions.excludedAlbumIds).toContain('album-2');

    // Toggling it again removes it
    const albumRemoved = database.toggleExclusion(testUserId, 'album-2', 'album');
    expect(albumRemoved).toBe(false);
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

describe('Exclusions REST API & Socket.io Broadcast', () => {
  let holadSocket: ClientSocket;
  const account = navidromeAccounts[0] || { user: 'testuser', url: 'http://mock-navidrome.local' };
  const authHeaders = {
    'x-user': account.user,
    'x-token': 'mock-token',
    'x-salt': 'mock-salt',
    'x-url': account.url
  };

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/rest/ping.view')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({
            'subsonic-response': { status: 'ok' }
          })
        } as any;
      }
      return { ok: false, status: 500 } as any;
    });

    holadSocket = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    await new Promise<void>((resolve) => {
      holadSocket.on('connect', resolve);
    });

    await new Promise<void>((resolve) => {
      holadSocket.emit('holad_joinRoom', {
        roomId: account.user,
        deviceId: 'test-device',
        deviceName: 'Test Device',
        auth: {
          user: account.user,
          token: 'mock-token',
          salt: 'mock-salt',
          url: account.url
        }
      });
      holadSocket.once('holad_devices', () => resolve());
    });
  });

  afterAll(() => {
    if (holadSocket.connected) {
      holadSocket.disconnect();
    }
  });

  it('should reject unauthenticated exclusions requests', async () => {
    const res = await request(app).get(`/api/holad/exclusions/${account.user}`);
    expect(res.status).toBe(401);

    const postRes = await request(app)
      .post(`/api/holad/exclusions/${account.user}`)
      .send({ entityId: 't1', entityType: 'track' });
    expect(postRes.status).toBe(401);
  });

  it('should return 400 for invalid body in POST /api/holad/exclusions/:roomId', async () => {
    const res = await request(app)
      .post(`/api/holad/exclusions/${account.user}`)
      .set(authHeaders)
      .send({ invalidField: true });
    expect(res.status).toBe(400);
  });

  it('should toggle exclusions and broadcast exclusionToggled event', async () => {
    const broadcastPromise = new Promise<any>((resolve) => {
      holadSocket.once('holad_remoteCommand', (cmd) => {
        resolve(cmd);
      });
    });

    const res = await request(app)
      .post(`/api/holad/exclusions/${account.user}`)
      .set(authHeaders)
      .send({ entityId: 'track-socket-1', entityType: 'track' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(res.body).toHaveProperty('isExcluded');

    const receivedCmd = await broadcastPromise;
    expect(receivedCmd.type).toBe('exclusionToggled');
    expect(receivedCmd.payload).toEqual({
      entityId: 'track-socket-1',
      entityType: 'track',
      isExcluded: res.body.isExcluded
    });
  });

  it('should sync exclusions and broadcast exclusionsSynced event', async () => {
    const broadcastPromise = new Promise<any>((resolve) => {
      holadSocket.once('holad_remoteCommand', (cmd) => {
        resolve(cmd);
      });
    });

    const res = await request(app)
      .post(`/api/holad/exclusions/${account.user}`)
      .set(authHeaders)
      .send({ excludedTrackIds: ['track-10', 'track-20'], excludedAlbumIds: ['album-10'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const receivedCmd = await broadcastPromise;
    expect(receivedCmd.type).toBe('exclusionsSynced');
    expect(receivedCmd.payload).toEqual({
      excludedTrackIds: ['track-10', 'track-20'],
      excludedAlbumIds: ['album-10']
    });

    // Check GET returns the synced exclusions
    const getRes = await request(app)
      .get(`/api/holad/exclusions/${account.user}`)
      .set(authHeaders);
    expect(getRes.status).toBe(200);
    expect(getRes.body.excludedTrackIds).toEqual(['track-10', 'track-20']);
    expect(getRes.body.excludedAlbumIds).toEqual(['album-10']);
  });
});

