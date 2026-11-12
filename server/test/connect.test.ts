import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { ConnectRoomManager } from '../src/connect/ConnectRoomManager.js';
import type { PlaybackSnapshot } from '../src/connect/types.js';
import * as database from '../src/database.js';
import { httpServer } from '../index.js';

describe('ConnectRoomManager Unit Tests', () => {
  let manager: ConnectRoomManager;

  beforeEach(() => {
    manager = new ConnectRoomManager();
  });

  afterEach(() => {
    for (const [roomId] of manager.rooms) {
      manager.clearRoomGraceTimers(roomId);
    }
    manager.clearAllSaveDebounceTimers();
  });

  it('should initialize room with default snapshot values and null lease', () => {
    const room = manager.getOrCreateRoom('user_test_1');
    expect(room).toBeDefined();
    expect(room.activeDeviceId).toBeNull();
    expect(room.devices).toEqual([]);
    expect(room.leaseExpiresAt).toBeNull();

    const snapshot = room.snapshot;
    expect(snapshot.roomId).toBe('user_test_1');
    expect(snapshot.activeDeviceId).toBeNull();
    expect(snapshot.trackId).toBeNull();
    expect(snapshot.currentIndex).toBe(0);
    expect(snapshot.queue).toEqual([]);
    expect(snapshot.positionMs).toBe(0);
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.playbackRate).toBe(1);
    expect(snapshot.version).toBe(1);
    expect(typeof snapshot.timestamp).toBe('number');
  });

  it('should set activeDeviceId and leaseExpiresAt when first device joins', () => {
    const before = Date.now();
    const room = manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'My Phone',
      socketId: 'sock-1'
    });

    expect(room.activeDeviceId).toBe('phone-1');
    expect(room.snapshot.activeDeviceId).toBe('phone-1');
    expect(room.leaseExpiresAt).toBeGreaterThanOrEqual(before + 45000 - 100);
    expect(room.snapshot.version).toBe(2);
  });

  it('should renew lease when renewLease is called for active device', () => {
    manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'My Phone',
      socketId: 'sock-1'
    });

    const oldLease = manager.getRoom('user_test_1')!.leaseExpiresAt!;
    // Simulate time passing
    const renewed = manager.renewLease('user_test_1', 'phone-1');
    expect(renewed).toBe(true);
    expect(manager.getRoom('user_test_1')!.leaseExpiresAt).toBeGreaterThanOrEqual(oldLease);

    // Call for non-active device
    const renewedOther = manager.renewLease('user_test_1', 'other-device');
    expect(renewedOther).toBe(false);
  });

  it('should freeze playback and NOT auto-transfer sound to another device on lease expiration', () => {
    manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'Phone',
      socketId: 'sock-1'
    });
    manager.addDevice('user_test_1', {
      id: 'desktop-1',
      name: 'Desktop',
      socketId: 'sock-2'
    });

    // Phone starts playing
    manager.updateSnapshot('user_test_1', 'phone-1', {
      isPlaying: true,
      positionMs: 10000,
      trackId: 'song-abc'
    });

    const room = manager.getRoom('user_test_1')!;
    expect(room.snapshot.isPlaying).toBe(true);
    const verBefore = room.snapshot.version;

    // Simulate lease expiration
    manager.handleLeaseExpiration('user_test_1', 'phone-1');

    // activeDeviceId transfers to next online device (desktop-1), but playback is frozen to pause
    expect(room.activeDeviceId).toBe('desktop-1');
    expect(room.snapshot.activeDeviceId).toBe('desktop-1');
    expect(room.snapshot.isPlaying).toBe(false);
    expect(room.snapshot.positionMs).toBeGreaterThanOrEqual(10000);
    expect(room.leaseExpiresAt).toBeGreaterThan(Date.now());
    expect(room.snapshot.version).toBe(verBefore + 1);
  });

  it('should accept valid updateSnapshot only from active device and reject stale versions', () => {
    manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'Phone',
      socketId: 'sock-1'
    });
    manager.addDevice('user_test_1', {
      id: 'desktop-1',
      name: 'Desktop',
      socketId: 'sock-2'
    });

    // Update from active device
    const res = manager.updateSnapshot('user_test_1', 'phone-1', {
      trackId: 'track-1',
      positionMs: 5000,
      isPlaying: true
    });
    expect(res?.updated).toBe(true);
    expect(manager.getRoom('user_test_1')!.snapshot.trackId).toBe('track-1');
    expect(manager.getRoom('user_test_1')!.snapshot.positionMs).toBe(5000);

    const currentVersion = manager.getRoom('user_test_1')!.snapshot.version;

    // Attempt update from non-active device
    const rejectedOther = manager.updateSnapshot('user_test_1', 'desktop-1', {
      trackId: 'track-hacked'
    });
    expect(rejectedOther?.updated).toBe(false);
    expect(manager.getRoom('user_test_1')!.snapshot.trackId).toBe('track-1');

    // Attempt stale version update
    const rejectedStale = manager.updateSnapshot('user_test_1', 'phone-1', {
      trackId: 'track-stale',
      version: currentVersion - 1
    });
    expect(rejectedStale?.updated).toBe(false);
    expect(manager.getRoom('user_test_1')!.snapshot.trackId).toBe('track-1');
  });

  it('should allow initial play in room without active device', () => {
    const room = manager.getOrCreateRoom('user_empty');
    manager.addDevice('user_empty', {
      id: 'pc-1',
      name: 'PC',
      socketId: 's-1'
    });
    // Force active device null to simulate empty active role
    room.activeDeviceId = null;
    room.snapshot.activeDeviceId = null;

    const res = manager.updateSnapshot('user_empty', 'pc-1', {
      isPlaying: true,
      trackId: 'song-first'
    });
    expect(res?.updated).toBe(true);
    expect(res?.becameActive).toBe(true);
    expect(room.activeDeviceId).toBe('pc-1');
    expect(room.snapshot.activeDeviceId).toBe('pc-1');
  });

  it('should handle heartbeat drift calculation and broadcast decisions', () => {
    manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'Phone',
      socketId: 'sock-1'
    });

    manager.updateSnapshot('user_test_1', 'phone-1', {
      isPlaying: true,
      positionMs: 1000,
      playbackRate: 1
    });

    const room = manager.getRoom('user_test_1')!;
    const verBefore = room.snapshot.version;

    // Small drift (< 1500ms) with unchanged isPlaying -> shouldBroadcast: false
    const smallDriftRes = manager.handleHeartbeat('user_test_1', 'phone-1', {
      positionMs: 1050,
      isPlaying: true
    });
    expect(smallDriftRes?.shouldBroadcast).toBe(false);
    expect(room.snapshot.positionMs).toBe(1050);
    expect(room.snapshot.version).toBe(verBefore);

    // Large drift (> 1500ms) -> shouldBroadcast: true and version++
    const largeDriftRes = manager.handleHeartbeat('user_test_1', 'phone-1', {
      positionMs: 5000, // 4000ms jump!
      isPlaying: true
    });
    expect(largeDriftRes?.shouldBroadcast).toBe(true);
    expect(room.snapshot.positionMs).toBe(5000);
    expect(room.snapshot.version).toBe(verBefore + 1);

    // Status change (isPlaying changed to false) -> shouldBroadcast: true
    const pauseRes = manager.handleHeartbeat('user_test_1', 'phone-1', {
      positionMs: 5000,
      isPlaying: false
    });
    expect(pauseRes?.shouldBroadcast).toBe(true);
    expect(room.snapshot.isPlaying).toBe(false);
  });

  it('should transfer playback to target device and update version and lease', () => {
    manager.addDevice('user_test_1', {
      id: 'phone-1',
      name: 'Phone',
      socketId: 'sock-1'
    });
    manager.addDevice('user_test_1', {
      id: 'desktop-1',
      name: 'Desktop',
      socketId: 'sock-2'
    });

    const roomBefore = manager.getRoom('user_test_1')!;
    const verBefore = roomBefore.snapshot.version;

    // Transfer to unknown device returns undefined
    const unknownRes = manager.transferPlayback('user_test_1', 'ghost-device');
    expect(unknownRes).toBeUndefined();

    // Transfer to desktop-1
    const res = manager.transferPlayback('user_test_1', 'desktop-1');
    expect(res).toBeDefined();
    expect(res!.activeDeviceId).toBe('desktop-1');
    expect(res!.snapshot.activeDeviceId).toBe('desktop-1');
    expect(res!.snapshot.version).toBe(verBefore + 1);
    expect(res!.leaseExpiresAt).toBeGreaterThan(Date.now());
  });

  it('should initialize room snapshot and cachedState from database saved state', () => {
    const mockDb = {
      getPlaybackState: vi.fn().mockReturnValue({
        song_id: 'db-song-42',
        current_index: 2,
        queue: [{ id: 'db-song-40' }, { id: 'db-song-41' }, { id: 'db-song-42' }],
        position: 15,
        is_playing: false
      }),
      savePlaybackState: vi.fn()
    };

    const dbManager = new ConnectRoomManager(mockDb);
    const room = dbManager.getOrCreateRoom('user_db_test');

    expect(mockDb.getPlaybackState).toHaveBeenCalledWith('user_db_test');
    expect(room.snapshot.trackId).toBe('db-song-42');
    expect(room.snapshot.currentIndex).toBe(2);
    expect(room.snapshot.queue).toHaveLength(3);
    expect(room.snapshot.positionMs).toBe(15000);
    expect(room.snapshot.isPlaying).toBe(false);
    expect(room.snapshot.playbackRate).toBe(1);
    expect(room.snapshot.version).toBe(1);

    expect(room.cachedState).toBeDefined();
    expect(room.cachedState.trackId).toBe('db-song-42');
    expect(room.cachedState.currentIndex).toBe(2);
    expect(room.cachedState.currentTime).toBe(15);
  });

  it('should debounce saving playback state to database on updateSnapshot, transferPlayback, handleLeaseExpiration', async () => {
    vi.useFakeTimers();
    try {
      const mockDb = {
        getPlaybackState: vi.fn().mockReturnValue(null),
        savePlaybackState: vi.fn()
      };

      const dbManager = new ConnectRoomManager(mockDb);
      dbManager.addDevice('user_db_test', {
        id: 'phone-1',
        name: 'Phone',
        socketId: 'sock-1'
      });

      // 1. updateSnapshot triggers debounced save
      dbManager.updateSnapshot('user_db_test', 'phone-1', {
        trackId: 'song-1',
        currentIndex: 0,
        positionMs: 5000,
        isPlaying: true,
        queue: [{ id: 'song-1' }]
      });

      expect(mockDb.savePlaybackState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(450);
      expect(mockDb.savePlaybackState).toHaveBeenCalledTimes(1);
      expect(mockDb.savePlaybackState).toHaveBeenLastCalledWith('user_db_test', expect.objectContaining({
        song_id: 'song-1',
        current_index: 0,
        position: 5,
        is_playing: true
      }));

      // 2. transferPlayback triggers debounced save
      dbManager.addDevice('user_db_test', {
        id: 'desktop-1',
        name: 'Desktop',
        socketId: 'sock-2'
      });
      dbManager.transferPlayback('user_db_test', 'desktop-1');
      vi.advanceTimersByTime(450);
      expect(mockDb.savePlaybackState).toHaveBeenCalledTimes(2);

      // 3. handleLeaseExpiration triggers debounced save
      dbManager.handleLeaseExpiration('user_db_test', 'desktop-1');
      vi.advanceTimersByTime(450);
      expect(mockDb.savePlaybackState).toHaveBeenCalledTimes(3);
      expect(mockDb.savePlaybackState).toHaveBeenLastCalledWith('user_db_test', expect.objectContaining({
        is_playing: false
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('should reconcile offline state correctly in ConnectRoomManager and persist immediately', () => {
    const mockDb = {
      getPlaybackState: vi.fn().mockReturnValue(null),
      savePlaybackState: vi.fn()
    };

    const dbManager = new ConnectRoomManager(mockDb);
    const room = dbManager.reconcileOffline('user_offline_test', 'device-offline-1', {
      queue: [{ id: 'off-1' }, { id: 'off-2' }],
      currentIndex: 1,
      positionMs: 30000,
      isPlaying: true,
      playbackRate: 1.25
    });

    expect(room.activeDeviceId).toBe('device-offline-1');
    expect(room.snapshot.activeDeviceId).toBe('device-offline-1');
    expect(room.snapshot.trackId).toBe('off-2');
    expect(room.snapshot.currentIndex).toBe(1);
    expect(room.snapshot.positionMs).toBe(30000);
    expect(room.snapshot.isPlaying).toBe(true);
    expect(room.snapshot.playbackRate).toBe(1.25);
    expect(room.snapshot.version).toBe(2);
    expect(room.leaseExpiresAt).toBeGreaterThan(Date.now());

    // Immediate save was called without timer delay
    expect(mockDb.savePlaybackState).toHaveBeenCalledWith('user_offline_test', expect.objectContaining({
      song_id: 'off-2',
      current_index: 1,
      position: 30,
      is_playing: true
    }));
  });
});

describe('Holad Connect v2 Socket Integration Tests', () => {
  let port: number;
  const user = 'connect_v2_user';
  const auth = {
    user,
    token: 'mock-token',
    salt: 'mock-salt',
    url: 'http://mock-navidrome.local'
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

    database.saveNavidromeAccount({
      url: auth.url,
      user: auth.user,
      token: auth.token,
      salt: auth.salt
    });

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
    vi.restoreAllMocks();
  });

  it('should support NTP-light ping/pong with serverTime and t0', async () => {
    const client = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    await new Promise<void>((r) => client.on('connect', r));

    const t0 = 123456789;
    const pongPromise = new Promise<{ t0?: number; serverTime: number }>((resolve) => {
      client.once('holad_pong', (data) => resolve(data));
    });

    client.emit('holad_ping', { t0 });
    const pong = await pongPromise;

    expect(pong.t0).toBe(t0);
    expect(typeof pong.serverTime).toBe('number');
    expect(pong.serverTime).toBeGreaterThan(0);

    client.disconnect();
  });

  it('should return structured holad_authError when authentication fails', async () => {
    const client = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    await new Promise<void>((r) => client.on('connect', r));

    const authErrorPromise = new Promise<any>((resolve) => {
      client.once('holad_authError', (err) => resolve(err));
    });

    client.emit('holad_joinRoom', {
      roomId: user,
      deviceId: 'bad-device',
      deviceName: 'Bad Client',
      // Missing auth credentials
    });

    const error = await authErrorPromise;
    expect(error).toEqual({
      code: 'AUTH_FAILED',
      message: 'Missing or invalid authentication credentials'
    });

    client.disconnect();
  });

  it('should emit PlaybackSnapshot on holad_joinRoom', async () => {
    const client = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    await new Promise<void>((r) => client.on('connect', r));

    const syncPromise = new Promise<PlaybackSnapshot>((resolve) => {
      client.once('holad_syncState', (snapshot) => resolve(snapshot));
    });

    client.emit('holad_joinRoom', {
      roomId: user,
      deviceId: 'phone-ssot-1',
      deviceName: 'SSOT Phone',
      auth
    });

    const snapshot = await syncPromise;
    expect(snapshot).toBeDefined();
    expect(snapshot.roomId).toBe(user);
    expect(snapshot.activeDeviceId).toBe('phone-ssot-1');
    expect(snapshot.isPlaying).toBe(false);
    expect(snapshot.version).toBeGreaterThanOrEqual(1);

    client.disconnect();
  });

  it('should handle holad_heartbeat and broadcast holad_syncState on drift', async () => {
    const host = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    const listener = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });

    await Promise.all([
      new Promise<void>((r) => host.on('connect', r)),
      new Promise<void>((r) => listener.on('connect', r))
    ]);

    // Host joins first to become active
    await new Promise<void>((resolve) => {
      host.emit('holad_joinRoom', {
        roomId: user,
        deviceId: 'host-device',
        deviceName: 'Host Device',
        auth
      });
      host.once('holad_devices', () => resolve());
    });

    // Explicitly set host as active device
    await new Promise<void>((resolve) => {
      host.emit('holad_setActiveDevice', 'host-device');
      host.once('holad_devices', () => resolve());
    });

    // Listener drains any pending syncState
    listener.on('holad_syncState', () => {});

    // Listener joins
    await new Promise<void>((resolve) => {
      listener.emit('holad_joinRoom', {
        roomId: user,
        deviceId: 'listener-device',
        deviceName: 'Listener Device',
        auth
      });
      listener.once('holad_devices', () => resolve());
    });

    // Host sends large drift heartbeat (>1500ms jump)
    const syncStatePromise = new Promise<PlaybackSnapshot>((resolve) => {
      listener.on('holad_syncState', (snapshot) => {
        if (snapshot.positionMs === 88888) {
          resolve(snapshot);
        }
      });
    });

    host.emit('holad_heartbeat', {
      roomId: user,
      deviceId: 'host-device',
      positionMs: 88888,
      isPlaying: true
    });

    const received = await syncStatePromise;
    expect(received.positionMs).toBe(88888);
    expect(received.isPlaying).toBe(true);

    host.disconnect();
    listener.disconnect();
  });

  it('should transfer playback on holad_transferPlayback and broadcast to all', async () => {
    const phone = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });
    const desktop = Client(`http://localhost:${port}`, { path: '/Holad/socket.io' });

    await Promise.all([
      new Promise<void>((r) => phone.on('connect', r)),
      new Promise<void>((r) => desktop.on('connect', r))
    ]);

    await new Promise<void>((r) => {
      phone.emit('holad_joinRoom', {
        roomId: user,
        deviceId: 'phone-tr-1',
        deviceName: 'Phone',
        auth
      });
      phone.once('holad_devices', () => r());
    });

    await new Promise<void>((r) => {
      desktop.emit('holad_joinRoom', {
        roomId: user,
        deviceId: 'pc-tr-1',
        deviceName: 'PC',
        auth
      });
      desktop.once('holad_devices', () => r());
    });

    const transferPromise = new Promise<{ devices: any; sync: PlaybackSnapshot }>((resolve) => {
      let devicesPayload: any = null;
      let syncPayload: any = null;

      desktop.on('holad_devices', (payload) => {
        if (payload.activeDeviceId === 'pc-tr-1') {
          devicesPayload = payload;
          if (syncPayload) resolve({ devices: devicesPayload, sync: syncPayload });
        }
      });

      desktop.on('holad_syncState', (snapshot) => {
        if (snapshot.activeDeviceId === 'pc-tr-1') {
          syncPayload = snapshot;
          if (devicesPayload) resolve({ devices: devicesPayload, sync: syncPayload });
        }
      });
    });

    phone.emit('holad_transferPlayback', {
      roomId: user,
      targetDeviceId: 'pc-tr-1'
    });

    const result = await transferPromise;
    expect(result.devices.activeDeviceId).toBe('pc-tr-1');
    expect(result.sync.activeDeviceId).toBe('pc-tr-1');

    phone.disconnect();
    desktop.disconnect();
  });

  it('should connect successfully using lowercase /holad/socket.io path via normalizeSocketUrl', async () => {
    const client = Client(`http://localhost:${port}`, { path: '/holad/socket.io' });
    await new Promise<void>((r) => client.on('connect', r));
    expect(client.connected).toBe(true);
    client.disconnect();
  });

  it('should allow device connection when subsonic ping is unreachable but auth credentials match room', async () => {
    const unreachableUser = 'unreachable_user';
    const client = Client(`http://localhost:${port}`, { path: '/holad/socket.io' });
    await new Promise<void>((r) => client.on('connect', r));

    const devicesPromise = new Promise<any>((resolve) => {
      client.once('holad_devices', (payload) => resolve(payload));
    });

    client.emit('holad_joinRoom', {
      roomId: unreachableUser,
      deviceId: 'phone-fallback-1',
      deviceName: 'Phone Fallback',
      auth: {
        user: unreachableUser,
        token: 'token-fallback',
        salt: 'salt-fallback',
        url: 'http://unreachable-nas.local:4533'
      }
    });

    const devices = await devicesPromise;
    expect(devices).toBeDefined();
    expect(Array.isArray(devices.devices)).toBe(true);
    expect(devices.devices.some((d: any) => d.id === 'phone-fallback-1')).toBe(true);

    client.disconnect();
  });

  it('should handle holad_reconcileOffline socket event and broadcast to room participants', async () => {
    const reconcileUser = 'reconcile_offline_user';
    database.saveNavidromeAccount({
      url: auth.url,
      user: reconcileUser,
      token: auth.token,
      salt: auth.salt
    });

    const client1 = Client(`http://localhost:${port}`, { path: '/holad/socket.io' });
    const client2 = Client(`http://localhost:${port}`, { path: '/holad/socket.io' });
    await Promise.all([
      new Promise<void>((r) => client1.on('connect', r)),
      new Promise<void>((r) => client2.on('connect', r))
    ]);

    // Both join room
    client1.emit('holad_joinRoom', {
      roomId: reconcileUser,
      deviceId: 'client-1',
      deviceName: 'Client 1',
      auth: { user: reconcileUser, token: auth.token, salt: auth.salt, url: auth.url }
    });
    client2.emit('holad_joinRoom', {
      roomId: reconcileUser,
      deviceId: 'client-2',
      deviceName: 'Client 2',
      auth: { user: reconcileUser, token: auth.token, salt: auth.salt, url: auth.url }
    });

    await new Promise((r) => setTimeout(r, 200));

    // Listen on client2 for syncState and devices from reconcile
    const syncPromise = new Promise<any>((resolve) => {
      client2.on('holad_syncState', (state) => {
        if (state.trackId === 'offline-song-99') {
          resolve(state);
        }
      });
    });

    const devicesPromise = new Promise<any>((resolve) => {
      client2.on('holad_devices', (payload) => {
        if (payload.activeDeviceId === 'client-1') {
          resolve(payload);
        }
      });
    });

    client1.emit('holad_reconcileOffline', {
      roomId: reconcileUser,
      deviceId: 'client-1',
      queue: [{ id: 'offline-song-99', title: 'Offline Song' }],
      currentIndex: 0,
      positionMs: 45000,
      isPlaying: true,
      playbackRate: 1.0
    });

    const [syncedState, devicesPayload] = await Promise.all([syncPromise, devicesPromise]);
    expect(syncedState.activeDeviceId).toBe('client-1');
    expect(syncedState.trackId).toBe('offline-song-99');
    expect(syncedState.positionMs).toBe(45000);
    expect(syncedState.isPlaying).toBe(true);
    expect(devicesPayload.activeDeviceId).toBe('client-1');

    client1.disconnect();
    client2.disconnect();
  });
});
