import type {
  HoladDevice,
  HoladRoom,
  HoladDevicesPayload,
  PlaybackSnapshot
} from './types.js';

export class ConnectRoomManager {
  public static readonly GRACE_PERIOD_MS = 45000;

  private holadRooms = new Map<string, HoladRoom>();
  private holadGraceTimers = new Map<string, NodeJS.Timeout>();

  public get rooms(): Map<string, HoladRoom> {
    return this.holadRooms;
  }

  public get graceTimers(): Map<string, NodeJS.Timeout> {
    return this.holadGraceTimers;
  }

  public getRoom(roomId: string): HoladRoom | undefined {
    return this.holadRooms.get(roomId);
  }

  public getSnapshot(roomId: string): PlaybackSnapshot | undefined {
    return this.holadRooms.get(roomId)?.snapshot;
  }

  public getOrCreateRoom(roomId: string): HoladRoom {
    let room = this.holadRooms.get(roomId);
    if (!room) {
      const now = Date.now();
      room = {
        activeDeviceId: null,
        devices: [],
        cachedState: null,
        lastPausedAt: null,
        snapshot: {
          roomId,
          activeDeviceId: null,
          trackId: null,
          currentIndex: 0,
          queue: [],
          positionMs: 0,
          timestamp: now,
          isPlaying: false,
          playbackRate: 1,
          version: 1
        },
        leaseExpiresAt: null
      };
      this.holadRooms.set(roomId, room);
    }
    return room;
  }

  public deleteRoom(roomId: string): boolean {
    return this.holadRooms.delete(roomId);
  }

  public getTimerKey(roomId: string, deviceId: string): string {
    return `${roomId}:${deviceId}`;
  }

  public hasGraceTimer(roomId: string, deviceId: string): boolean {
    return this.holadGraceTimers.has(this.getTimerKey(roomId, deviceId));
  }

  public clearGraceTimer(roomId: string, deviceId: string): boolean {
    const key = this.getTimerKey(roomId, deviceId);
    const timer = this.holadGraceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.holadGraceTimers.delete(key);
      return true;
    }
    return false;
  }

  public clearRoomGraceTimers(roomId: string): void {
    const prefix = `${roomId}:`;
    for (const [key, timer] of this.holadGraceTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.holadGraceTimers.delete(key);
      }
    }
  }

  public startGracePeriod(
    roomId: string,
    deviceId: string,
    onExpire: () => void,
    timeoutMs: number = ConnectRoomManager.GRACE_PERIOD_MS
  ): void {
    const timerKey = this.getTimerKey(roomId, deviceId);
    if (this.holadGraceTimers.has(timerKey)) {
      clearTimeout(this.holadGraceTimers.get(timerKey)!);
    }
    const timer = setTimeout(() => {
      this.holadGraceTimers.delete(timerKey);
      onExpire();
    }, timeoutMs);
    this.holadGraceTimers.set(timerKey, timer);
  }

  public renewLease(roomId: string, deviceId: string): boolean {
    const room = this.holadRooms.get(roomId);
    if (!room) return false;
    if (room.activeDeviceId === deviceId) {
      room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
      return true;
    }
    return false;
  }

  public handleLeaseExpiration(roomId: string, deviceId?: string): HoladRoom | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;

    if (deviceId && room.activeDeviceId && room.activeDeviceId !== deviceId) {
      return room;
    }

    // Freeze playback & fix current position
    if (room.snapshot.isPlaying) {
      const rate = typeof room.snapshot.playbackRate === 'number' && room.snapshot.playbackRate > 0
        ? room.snapshot.playbackRate
        : 1;
      const elapsed = (Date.now() - room.snapshot.timestamp) * rate;
      room.snapshot.positionMs += Math.max(0, elapsed);
      room.snapshot.isPlaying = false;
    }

    room.snapshot.activeDeviceId = null;
    room.activeDeviceId = null;
    room.leaseExpiresAt = null;
    room.snapshot.timestamp = Date.now();
    room.snapshot.version++;

    if (room.cachedState) {
      room.cachedState = {
        ...room.cachedState,
        isPlaying: false,
        positionMs: room.snapshot.positionMs,
        currentTime: room.snapshot.positionMs / 1000,
        activeDeviceId: null,
        version: room.snapshot.version
      };
    }

    return room;
  }

  public addDevice(roomId: string, device: HoladDevice): HoladRoom {
    const room = this.getOrCreateRoom(roomId);
    this.clearGraceTimer(roomId, device.id);

    room.devices = room.devices.filter(d => d.id !== device.id);
    room.devices.push(device);

    const isActiveDeviceOnline = room.activeDeviceId && room.devices.some(d => d.id === room.activeDeviceId);
    const isActiveDeviceInGrace = room.activeDeviceId && this.hasGraceTimer(roomId, room.activeDeviceId);

    if (!room.activeDeviceId || (!isActiveDeviceOnline && !isActiveDeviceInGrace)) {
      room.activeDeviceId = device.id;
      room.snapshot.activeDeviceId = device.id;
      room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
      room.snapshot.version++;
      room.snapshot.timestamp = Date.now();
    } else if (room.activeDeviceId === device.id) {
      this.renewLease(roomId, device.id);
    }

    return room;
  }

  public transferPlayback(roomId: string, targetDeviceId: string): HoladRoom | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;

    const targetDevice = room.devices.find(d => d.id === targetDeviceId);
    if (!targetDevice) return undefined;

    this.clearRoomGraceTimers(roomId);
    room.activeDeviceId = targetDeviceId;
    room.snapshot.activeDeviceId = targetDeviceId;
    room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
    room.snapshot.version++;
    room.snapshot.timestamp = Date.now();

    if (room.cachedState) {
      room.cachedState.activeDeviceId = targetDeviceId;
      room.cachedState.version = room.snapshot.version;
    }

    return room;
  }

  public setActiveDevice(roomId: string, deviceId: string): HoladRoom | undefined {
    const transferred = this.transferPlayback(roomId, deviceId);
    if (transferred) return transferred;

    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;
    this.clearRoomGraceTimers(roomId);
    room.activeDeviceId = deviceId;
    room.snapshot.activeDeviceId = deviceId;
    room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
    room.snapshot.version++;
    room.snapshot.timestamp = Date.now();
    return room;
  }

  public updateSnapshot(
    roomId: string,
    deviceId: string,
    patch: Partial<PlaybackSnapshot>
  ): { updated: boolean; becameActive: boolean; room: HoladRoom } | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;

    let becameActive = false;

    // Allowed only from activeDeviceId or explicit initial play in room with null active device
    if (room.activeDeviceId === deviceId) {
      // Authorized active device
    } else if (!room.activeDeviceId && patch.isPlaying === true) {
      room.activeDeviceId = deviceId;
      room.snapshot.activeDeviceId = deviceId;
      becameActive = true;
    } else {
      return { updated: false, becameActive: false, room };
    }

    // Version check: reject stale update
    if (typeof patch.version === 'number' && patch.version < room.snapshot.version) {
      return { updated: false, becameActive, room };
    }

    // Renew lease on valid activity
    room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;

    if (patch.trackId !== undefined) {
      room.snapshot.trackId = patch.trackId;
    }
    if (patch.currentIndex !== undefined) {
      room.snapshot.currentIndex = patch.currentIndex;
    }
    if (patch.queue !== undefined) {
      room.snapshot.queue = patch.queue;
    }
    if (patch.positionMs !== undefined) {
      room.snapshot.positionMs = patch.positionMs;
    }
    if (patch.isPlaying !== undefined) {
      room.snapshot.isPlaying = patch.isPlaying;
    }
    if (patch.playbackRate !== undefined) {
      room.snapshot.playbackRate = patch.playbackRate;
    }

    // activeDeviceId in snapshot is assigned ONLY by server
    room.snapshot.activeDeviceId = room.activeDeviceId;

    room.snapshot.version++;
    room.snapshot.timestamp = Date.now();

    room.cachedState = {
      ...room.cachedState,
      trackId: room.snapshot.trackId,
      currentIndex: room.snapshot.currentIndex,
      queue: room.snapshot.queue,
      positionMs: room.snapshot.positionMs,
      currentTime: room.snapshot.positionMs / 1000,
      isPlaying: room.snapshot.isPlaying,
      playbackRate: room.snapshot.playbackRate,
      version: room.snapshot.version,
      activeDeviceId: room.activeDeviceId,
      lastPausedAt: room.snapshot.isPlaying ? null : (room.lastPausedAt || Date.now())
    };

    return { updated: true, becameActive, room };
  }

  public handleHeartbeat(
    roomId: string,
    deviceId: string,
    data: { positionMs: number; isPlaying?: boolean; playbackRate?: number }
  ): { shouldBroadcast: boolean; snapshot: PlaybackSnapshot } | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;

    if (room.activeDeviceId !== deviceId) {
      return { shouldBroadcast: false, snapshot: room.snapshot };
    }

    // Renew lease
    this.renewLease(roomId, deviceId);

    const rate = typeof room.snapshot.playbackRate === 'number' && room.snapshot.playbackRate > 0
      ? room.snapshot.playbackRate
      : 1;

    const expectedMs = room.snapshot.isPlaying
      ? room.snapshot.positionMs + (Date.now() - room.snapshot.timestamp) * rate
      : room.snapshot.positionMs;

    const drift = Math.abs(data.positionMs - expectedMs);

    const isPlayingChanged = typeof data.isPlaying === 'boolean' && data.isPlaying !== room.snapshot.isPlaying;
    const playbackRateChanged = typeof data.playbackRate === 'number' && data.playbackRate !== room.snapshot.playbackRate;

    if (isPlayingChanged) {
      room.snapshot.isPlaying = data.isPlaying!;
    }
    if (playbackRateChanged) {
      room.snapshot.playbackRate = data.playbackRate!;
    }

    room.snapshot.positionMs = data.positionMs;
    room.snapshot.timestamp = Date.now();

    const shouldBroadcast = drift > 1500 || isPlayingChanged;
    if (shouldBroadcast) {
      room.snapshot.version++;
    }

    if (room.cachedState) {
      room.cachedState.positionMs = room.snapshot.positionMs;
      room.cachedState.currentTime = room.snapshot.positionMs / 1000;
      room.cachedState.isPlaying = room.snapshot.isPlaying;
      room.cachedState.playbackRate = room.snapshot.playbackRate;
      room.cachedState.version = room.snapshot.version;
    }

    return { shouldBroadcast, snapshot: room.snapshot };
  }

  public updateState(
    roomId: string,
    deviceId: string,
    state: any
  ): { updated: boolean; becameActive: boolean; room: HoladRoom } | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;

    if (room.activeDeviceId === deviceId) {
      if (typeof state.lastPausedAt === 'number') {
        room.lastPausedAt = state.lastPausedAt;
      } else if (state.isPlaying === false) {
        if (room.cachedState?.isPlaying === true || room.lastPausedAt == null) {
          room.lastPausedAt = Date.now();
        }
      } else if (state.isPlaying === true) {
        room.lastPausedAt = null;
      }
      room.cachedState = { ...room.cachedState, ...state, lastPausedAt: room.lastPausedAt };
      this.syncSnapshotFromState(room, state);
      return { updated: true, becameActive: false, room };
    } else if (!room.activeDeviceId && state.isPlaying) {
      room.activeDeviceId = deviceId;
      room.snapshot.activeDeviceId = deviceId;
      room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
      room.lastPausedAt = null;
      room.cachedState = { ...room.cachedState, ...state, lastPausedAt: null };
      this.syncSnapshotFromState(room, state);
      return { updated: true, becameActive: true, room };
    }

    return { updated: false, becameActive: false, room };
  }

  private syncSnapshotFromState(room: HoladRoom, state: any): void {
    if (!state || typeof state !== 'object') return;
    if (state.trackId !== undefined) {
      room.snapshot.trackId = state.trackId;
    } else if (state.currentTrack?.id !== undefined) {
      room.snapshot.trackId = state.currentTrack.id;
    } else if (state.songId !== undefined) {
      room.snapshot.trackId = state.songId;
    }

    if (typeof state.currentIndex === 'number') {
      room.snapshot.currentIndex = state.currentIndex;
    }
    if (Array.isArray(state.queue)) {
      room.snapshot.queue = state.queue;
    }
    if (typeof state.positionMs === 'number') {
      room.snapshot.positionMs = state.positionMs;
    } else if (typeof state.currentTime === 'number') {
      room.snapshot.positionMs = Math.round(state.currentTime * 1000);
    }
    if (typeof state.isPlaying === 'boolean') {
      room.snapshot.isPlaying = state.isPlaying;
    }
    if (typeof state.playbackRate === 'number') {
      room.snapshot.playbackRate = state.playbackRate;
    }
    room.snapshot.activeDeviceId = room.activeDeviceId;
    room.leaseExpiresAt = Date.now() + ConnectRoomManager.GRACE_PERIOD_MS;
    room.snapshot.timestamp = Date.now();
    room.snapshot.version++;
  }

  public updateSettings(roomId: string, settings: any): HoladRoom | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;
    room.cachedState = { ...room.cachedState, ...settings };
    return room;
  }

  public getDevicesPayload(roomId: string): HoladDevicesPayload | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;
    return {
      devices: room.devices,
      activeDeviceId: room.activeDeviceId
    };
  }
}
