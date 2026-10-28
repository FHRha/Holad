import type { Server, Socket } from 'socket.io';
import { ConnectRoomManager } from './ConnectRoomManager.js';
import type {
  HoladJoinRoomPayload,
  HoladLeavePayload,
  HoladRemoteCommand,
  SocketHoladData,
  ConnectSocketHandlerOptions,
  PlaybackSnapshot,
  HoladHeartbeatPayload,
  HoladTransferPlaybackPayload,
  HoladPingPayload
} from './types.js';
import { demoManager as defaultDemoManager } from '../demoManager.js';

export function broadcastConnectRemoteCommand(
  io: Server,
  roomId: string,
  command: HoladRemoteCommand | { type: string; payload?: any; [key: string]: any }
): void {
  io.to(`holad_${roomId}`).emit('holad_remoteCommand', command);
}

export function handleConnectDisconnect(
  io: Server,
  socket: Socket,
  roomManager: ConnectRoomManager
): void {
  const holadData = (socket as any).holadData as SocketHoladData | undefined;
  if (!holadData) return;

  const { roomId, deviceId } = holadData;
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  room.devices = room.devices.filter(d => d.socketId !== socket.id);

  if (room.activeDeviceId === deviceId) {
    // The active device disconnected!
    // Hold a 45-second Grace Period for network blips / mobile sleep / temporary disconnects.
    roomManager.startGracePeriod(roomId, deviceId, () => {
      const currentRoom = roomManager.getRoom(roomId);
      if (currentRoom && currentRoom.activeDeviceId === deviceId) {
        // Grace period expired without reconnect.
        // Server does NOT transfer sound to another device automatically!
        roomManager.handleLeaseExpiration(roomId, deviceId);
        io.to(`holad_${roomId}`).emit('holad_devices', {
          devices: currentRoom.devices,
          activeDeviceId: currentRoom.activeDeviceId
        });
        io.to(`holad_${roomId}`).emit('holad_syncState', currentRoom.snapshot);
        if (currentRoom.devices.length === 0) {
          roomManager.deleteRoom(roomId);
        }
      }
    });
  }

  io.to(`holad_${roomId}`).emit('holad_devices', {
    devices: room.devices,
    activeDeviceId: room.activeDeviceId
  });

  if (room.devices.length === 0 && !roomManager.hasGraceTimer(roomId, deviceId)) {
    roomManager.deleteRoom(roomId);
  }
}

export function registerConnectSocketHandlers(
  io: Server,
  socket: Socket,
  database: any,
  roomManager: ConnectRoomManager,
  options?: ConnectSocketHandlerOptions
): void {
  socket.on('holad_joinRoom', async (data: HoladJoinRoomPayload) => {
    const { roomId, deviceId, deviceName, auth, demoSessionId } = data || {};

    if (!auth || typeof auth.user !== 'string' || typeof auth.salt !== 'string' || typeof auth.token !== 'string' || typeof auth.url !== 'string') {
      socket.emit('holad_authError', { code: 'AUTH_FAILED', message: 'Missing or invalid authentication credentials' });
      socket.disconnect();
      return;
    }

    const demoMgr = options?.demoManager ?? defaultDemoManager;
    const demoSession = demoMgr?.isEnabled()
      ? (demoSessionId ? demoMgr.getSession(demoSessionId) : demoMgr.getSessionByGuestUserId(roomId))
      : null;

    const rawRoom = (typeof roomId === 'string' ? roomId : '').trim();
    const authUserClean = auth.user.trim().toLowerCase();
    const normalizedRoom = rawRoom ? rawRoom.toLowerCase() : authUserClean;

    const isDemoMatch = !!demoSession && (
      normalizedRoom === demoSession.guestUserId.toLowerCase() || 
      (authUserClean === demoSession.account.user.toLowerCase() && normalizedRoom === demoSession.guestUserId.toLowerCase())
    );

    if (!isDemoMatch && authUserClean !== normalizedRoom) {
      socket.emit('holad_authError', { code: 'AUTH_FAILED', message: 'Room mismatch: You can only join your own room' });
      socket.disconnect();
      return;
    }

    let accounts = options?.getNavidromeAccounts ? options.getNavidromeAccounts() : database.getNavidromeAccounts();
    if (accounts.length === 0) {
      accounts = database.getNavidromeAccounts();
      if (options?.setNavidromeAccounts) {
        options.setNavidromeAccounts(accounts);
      }
    }

    const dbAccount = accounts.find((a: any) => a.user.toLowerCase() === authUserClean);
    const isEnvUser = !!process.env.NAVIDROME_USER && process.env.NAVIDROME_USER.toLowerCase() === authUserClean;
    const isKnownUser = !!dbAccount || isEnvUser || isDemoMatch;

    const isWhitelisted = !!process.env.NAVIDROME_URL || accounts.length === 0 || isKnownUser || accounts.some((a: any) => a.url.replace(/\/$/, '') === auth.url.replace(/\/$/, ''));
    if (!isWhitelisted) {
      socket.emit('holad_authError', { code: 'AUTH_FAILED', message: 'Unauthorized server URL' });
      socket.disconnect();
      return;
    }

    // Try resolving URL candidates for Subsonic verification
    const candidates = options?.getNavidromeCandidates 
      ? options.getNavidromeCandidates(auth.url, dbAccount?.url) 
      : [auth.url];
    let resolvedUrl = candidates[0] || auth.url;
    let isPingSuccessful = false;

    for (const candidate of candidates) {
      try {
        const pingUrl = `${candidate.replace(/\/$/, '')}/rest/ping.view?u=${encodeURIComponent(auth.user)}&t=${encodeURIComponent(auth.token)}&s=${encodeURIComponent(auth.salt)}&v=1.16.1&c=StreamNavi&f=json`;
        const response = await fetch(pingUrl, { signal: AbortSignal.timeout(3000) });
        const json = await response.json().catch(() => null);
        if (response.ok && json?.['subsonic-response']?.status === 'ok') {
          isPingSuccessful = true;
          resolvedUrl = candidate;
          break;
        }
      } catch (error: any) {
        // Continue to next candidate
      }
    }

    if (!isPingSuccessful && !isKnownUser) {
      socket.emit('holad_authError', { code: 'AUTH_FAILED', message: 'Invalid Subsonic credentials or unverified server' });
      socket.disconnect();
      return;
    }

    // Register or refresh account in DB only if this user is an authorized account on an allowed target server
    try {
      const cleanAuthUrl = resolvedUrl.replace(/\/$/, '');
      const isAllowed = options?.isTargetServerAllowed ? options.isTargetServerAllowed(cleanAuthUrl) : true;
      if (isAllowed) {
        const isExistingAccount = accounts.some((a: any) => a.user.toLowerCase() === auth.user.toLowerCase());
        if (isExistingAccount || accounts.length === 0) {
          database.saveNavidromeAccount({
            url: cleanAuthUrl,
            user: auth.user,
            token: auth.token,
            salt: auth.salt
          });
          const updated = database.getNavidromeAccounts();
          if (options?.setNavidromeAccounts) {
            options.setNavidromeAccounts(updated);
          }
        }
      }
    } catch (e) {
      console.warn('[Holad] Failed to auto-save account on joinRoom:', e);
    }

    socket.join(`holad_${normalizedRoom}`);

    const room = roomManager.addDevice(normalizedRoom, {
      id: deviceId,
      name: deviceName,
      socketId: socket.id
    });

    (socket as any).holadData = { roomId: normalizedRoom, deviceId };

    // Register user presence for social features
    if (options?.registerUserPresence) {
      const socialUserId = demoSession ? demoSession.guestUserId : auth.user;
      const socialUsername = demoSession ? `Гость #${demoSession.slotId}` : auth.user;
      const userRecord = database.ensureUserWithTag(socialUserId, socialUsername);
      options.registerUserPresence(socket, userRecord.user_id, userRecord.username, userRecord.tag);
    }

    const devicesPayload = { devices: room.devices, activeDeviceId: room.activeDeviceId };
    socket.emit('holad_devices', devicesPayload);
    io.to(`holad_${normalizedRoom}`).emit('holad_devices', devicesPayload);

    // SSOT: Emit PlaybackSnapshot to newly connected client
    socket.emit('holad_syncState', room.snapshot);

    if (room.activeDeviceId && room.activeDeviceId !== deviceId) {
      const activeDev = room.devices.find(d => d.id === room.activeDeviceId);
      if (activeDev) {
        io.to(activeDev.socketId).emit('holad_remoteCommand', {
          type: 'requestState',
          fromUserId: normalizedRoom,
          fromDeviceId: deviceId
        });
      }
    }

    // Sync current exclusions from DB to newly joined device
    try {
      const userExclusions = database.getExclusions(normalizedRoom);
      socket.emit('holad_remoteCommand', {
        type: 'exclusionsSynced',
        payload: userExclusions
      });
    } catch (e) {
      console.error('[Holad] Failed to sync exclusions on joinRoom:', e);
    }
  });

  // NTP-light ping/pong
  socket.on('holad_ping', (data: HoladPingPayload) => {
    socket.emit('holad_pong', { t0: data?.t0, serverTime: Date.now() });
  });

  // Heartbeat handler for drift correction and lease renewal
  socket.on('holad_heartbeat', (data: HoladHeartbeatPayload) => {
    const holadData = (socket as any).holadData as SocketHoladData | undefined;
    const targetRoomId = (data?.roomId || holadData?.roomId || '').trim().toLowerCase();
    const targetDeviceId = data?.deviceId || holadData?.deviceId;
    if (!targetRoomId || !targetDeviceId) return;

    const result = roomManager.handleHeartbeat(targetRoomId, targetDeviceId, data);
    if (result && result.shouldBroadcast) {
      socket.to(`holad_${targetRoomId}`).emit('holad_syncState', result.snapshot);
    }
  });

  // Explicit playback transfer to target device
  socket.on('holad_transferPlayback', (data: HoladTransferPlaybackPayload) => {
    const holadData = (socket as any).holadData as SocketHoladData | undefined;
    const targetRoomId = (data?.roomId || holadData?.roomId || '').trim().toLowerCase();
    const targetDeviceId = data?.targetDeviceId;
    if (!targetRoomId || !targetDeviceId) return;

    const room = roomManager.transferPlayback(targetRoomId, targetDeviceId);
    if (room) {
      const payload = { devices: room.devices, activeDeviceId: room.activeDeviceId };
      io.to(`holad_${targetRoomId}`).emit('holad_devices', payload);
      io.to(`holad_${targetRoomId}`).emit('holad_syncState', room.snapshot);
    }
  });

  socket.on('holad_setActiveDevice', (deviceId: string) => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    const room = roomManager.setActiveDevice(data.roomId, deviceId);
    if (room) {
      const payload = { devices: room.devices, activeDeviceId: room.activeDeviceId };
      socket.emit('holad_devices', payload);
      io.to(`holad_${data.roomId}`).emit('holad_devices', payload);
      io.to(`holad_${data.roomId}`).emit('holad_syncState', room.snapshot);
    }
  });

  socket.on('holad_updateSnapshot', (patch: Partial<PlaybackSnapshot>) => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    const result = roomManager.updateSnapshot(data.roomId, data.deviceId, patch);
    if (result && result.updated) {
      if (result.becameActive) {
        const payload = { devices: result.room.devices, activeDeviceId: result.room.activeDeviceId };
        io.to(`holad_${data.roomId}`).emit('holad_devices', payload);
      }
      socket.to(`holad_${data.roomId}`).emit('holad_syncState', result.room.snapshot);
    }
  });

  socket.on('holad_requestState', () => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    const room = roomManager.getRoom(data.roomId);
    if (room) {
      socket.emit('holad_syncState', room.snapshot);
      if (room.activeDeviceId && room.activeDeviceId !== data.deviceId) {
        const activeDev = room.devices.find(d => d.id === room.activeDeviceId);
        if (activeDev) {
          io.to(activeDev.socketId).emit('holad_remoteCommand', {
            type: 'requestState',
            fromUserId: data.roomId,
            fromDeviceId: data.deviceId
          });
        }
      }
    }
  });

  socket.on('holad_updateState', (state: any) => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    const result = roomManager.updateState(data.roomId, data.deviceId, state);
    if (result && result.updated) {
      if (result.becameActive) {
        const payload = { devices: result.room.devices, activeDeviceId: result.room.activeDeviceId };
        io.to(`holad_${data.roomId}`).emit('holad_devices', payload);
      }
      socket.to(`holad_${data.roomId}`).emit('holad_syncState', result.room.snapshot);
    }
  });

  socket.on('holad_updateSettings', (settings: any) => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    const room = roomManager.updateSettings(data.roomId, settings);
    if (room) {
      io.to(`holad_${data.roomId}`).emit('holad_syncSettings', settings);
    }
  });

  socket.on('holad_remoteCommand', (command: { type: string; payload?: any; [key: string]: any }) => {
    const data = (socket as any).holadData as SocketHoladData | undefined;
    if (!data) return;
    io.to(`holad_${data.roomId}`).emit('holad_remoteCommand', {
      ...command,
      fromUserId: data.roomId,
      fromDeviceId: data.deviceId
    });
  });

  socket.on('holad_syncTime', (data: any) => {
    const holadData = (socket as any).holadData as SocketHoladData | undefined;
    if (!holadData) return;
    socket.to(`holad_${holadData.roomId}`).emit('holad_syncTime', data);
  });

  socket.on('holad_leave', (data: HoladLeavePayload) => {
    const rawRoom = data?.roomId || (socket as any).holadData?.roomId;
    const rawDevice = data?.deviceId || (socket as any).holadData?.deviceId;
    if (!rawRoom || !rawDevice) return;
    const normalizedRoom = typeof rawRoom === 'string' ? rawRoom.trim().toLowerCase() : '';
    if (!normalizedRoom) return;
    const room = roomManager.getRoom(normalizedRoom);
    if (room) {
      roomManager.clearGraceTimer(normalizedRoom, rawDevice);
      room.devices = room.devices.filter(d => d.id !== rawDevice && d.socketId !== socket.id);
      if (room.activeDeviceId === rawDevice) {
        // Hold 45 second grace period timer
        roomManager.startGracePeriod(normalizedRoom, rawDevice, () => {
          const currentRoom = roomManager.getRoom(normalizedRoom);
          if (currentRoom && currentRoom.activeDeviceId === rawDevice) {
            roomManager.handleLeaseExpiration(normalizedRoom, rawDevice);
            io.to(`holad_${normalizedRoom}`).emit('holad_devices', {
              devices: currentRoom.devices,
              activeDeviceId: currentRoom.activeDeviceId
            });
            io.to(`holad_${normalizedRoom}`).emit('holad_syncState', currentRoom.snapshot);
            if (currentRoom.devices.length === 0) {
              roomManager.deleteRoom(normalizedRoom);
            }
          }
        });
      }
      io.to(`holad_${normalizedRoom}`).emit('holad_devices', {
        devices: room.devices,
        activeDeviceId: room.activeDeviceId
      });
      if (room.devices.length === 0 && !roomManager.hasGraceTimer(normalizedRoom, rawDevice)) {
        roomManager.deleteRoom(normalizedRoom);
      }
    }
  });
}
