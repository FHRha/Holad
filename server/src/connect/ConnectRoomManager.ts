import type { HoladDevice, HoladRoom, HoladDevicesPayload } from './types.js';

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

  public getOrCreateRoom(roomId: string): HoladRoom {
    let room = this.holadRooms.get(roomId);
    if (!room) {
      room = { activeDeviceId: null, devices: [], cachedState: null, lastPausedAt: null };
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

  public addDevice(roomId: string, device: HoladDevice): HoladRoom {
    const room = this.getOrCreateRoom(roomId);
    this.clearGraceTimer(roomId, device.id);

    room.devices = room.devices.filter(d => d.id !== device.id);
    room.devices.push(device);

    const isActiveDeviceOnline = room.activeDeviceId && room.devices.some(d => d.id === room.activeDeviceId);
    const isActiveDeviceInGrace = room.activeDeviceId && this.hasGraceTimer(roomId, room.activeDeviceId);

    if (!room.activeDeviceId || (!isActiveDeviceOnline && !isActiveDeviceInGrace)) {
      room.activeDeviceId = device.id;
    }

    return room;
  }

  public setActiveDevice(roomId: string, deviceId: string): HoladRoom | undefined {
    const room = this.holadRooms.get(roomId);
    if (!room) return undefined;
    this.clearRoomGraceTimers(roomId);
    room.activeDeviceId = deviceId;
    return room;
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
      return { updated: true, becameActive: false, room };
    } else if (!room.activeDeviceId && state.isPlaying) {
      // Protective recovery: if room had no active device, actively playing device assumes activeDeviceId
      room.activeDeviceId = deviceId;
      room.lastPausedAt = null;
      room.cachedState = { ...room.cachedState, ...state, lastPausedAt: null };
      return { updated: true, becameActive: true, room };
    }

    return { updated: false, becameActive: false, room };
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
