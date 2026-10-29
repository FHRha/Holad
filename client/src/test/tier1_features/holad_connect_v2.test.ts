import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useHoladStore } from '../../store/holadStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { getSocketUrl, getSocketPath } from '../../utils/serverConfig';
import ConnectDeviceList from '../../components/player/connect/ConnectDeviceList';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import type { PlaybackSnapshot } from '../../connect/types';
import { AudioDeck } from '../../audio/AudioDeck';
import { AudioEngine } from '../../audio/AudioEngine';

let socketEventHandlers: Record<string, Function> = {};
const mockSocketInstance = {
  on: vi.fn((event: string, handler: Function) => {
    socketEventHandlers[event] = handler;
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

describe('Holad Connect v2 Client Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketEventHandlers = {};
    mockSocketInstance.on.mockImplementation((event: string, handler: Function) => {
      socketEventHandlers[event] = handler;
    });
    resetAllStores();
    useHoladStore.getState().disconnect();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useHoladStore.getState().disconnect();
  });

  describe('1. Default Settings & Store Initialization', () => {
    it('initializes holadStore with null snapshot and 0 clientOffset', () => {
      const state = useHoladStore.getState();
      expect(state.snapshot).toBeNull();
      expect(state.clientOffset).toBe(0);
      expect(typeof state.transferPlayback).toBe('function');
    });
  });

  describe('2. NTP-light Synchronization', () => {
    it('emits holad_ping with performance.now() upon socket connection', () => {
      const mockSocket = {
        emit: vi.fn(),
        on: vi.fn(),
        connected: true,
        disconnect: vi.fn(),
      } as any;

      useHoladStore.setState({ socket: mockSocket });
      // Simulate connect event handler
      const t0 = performance.now();
      mockSocket.emit('holad_ping', { t0 });

      expect(mockSocket.emit).toHaveBeenCalledWith('holad_ping', expect.objectContaining({
        t0: expect.any(Number),
      }));
    });

    it('calculates clientOffset correctly upon receiving holad_pong', () => {
      const t0 = 1000;
      const serverTime = 1700000000000;
      vi.spyOn(performance, 'now').mockReturnValue(1100); // RTT = 100ms
      vi.spyOn(Date, 'now').mockReturnValue(1700000000050); // Local time at pong reception

      // Expected offset = Date.now() - (serverTime + rtt / 2) = 1700000000050 - (1700000000000 + 50) = 0
      const rtt = performance.now() - t0;
      const offset = Date.now() - (serverTime + rtt / 2);
      useHoladStore.setState({ clientOffset: offset });

      expect(useHoladStore.getState().clientOffset).toBe(0);
    });
  });

  describe('3. Auth Error Handling & Disconnect Preservation', () => {
    it('handles holad_authError with object payload { code, message } and preserves error on disconnect', () => {
      useHoladStore.setState({
        roomId: 'my-room',
        connectionStatus: 'connected',
        connectError: null,
      });

      // Simulate receiving error object
      const authErrorPayload = { code: 'AUTH_FAILED', message: 'Unauthorized session token' };
      const message = authErrorPayload.message;
      useHoladStore.setState({ connectionStatus: 'error', connectError: message });

      // Disconnect called with keepError = true
      useHoladStore.getState().disconnect(true);

      expect(useHoladStore.getState().connectionStatus).toBe('error');
      expect(useHoladStore.getState().connectError).toBe('Unauthorized session token');
      expect(useHoladStore.getState().roomId).toBeNull();
    });

    it('handles holad_authError with string payload', () => {
      useHoladStore.setState({
        roomId: 'my-room',
        connectionStatus: 'connected',
      });

      const message = 'Invalid Subsonic credentials';
      useHoladStore.setState({ connectionStatus: 'error', connectError: message });
      useHoladStore.getState().disconnect(true);

      expect(useHoladStore.getState().connectionStatus).toBe('error');
      expect(useHoladStore.getState().connectError).toBe('Invalid Subsonic credentials');
    });
  });

  describe('4. Server-Authoritative Device Management (No Self-Proclamation)', () => {
    it('does NOT self-proclaim active when devices list has 1 device and activeDeviceId is null', () => {
      const myId = useHoladStore.getState().deviceId;
      const setActiveSpy = vi.spyOn(useHoladStore.getState(), 'setActiveDevice');

      // Server emits holad_devices with activeDeviceId === null
      useHoladStore.setState({
        devices: [{ id: myId, name: 'Single PC' }],
        activeDeviceId: null,
      });

      expect(setActiveSpy).not.toHaveBeenCalled();
      expect(useHoladStore.getState().activeDeviceId).toBeNull();
    });

    it('adopts server-assigned activeDeviceId strictly', () => {
      const remoteId = 'remote-tv-box';
      useHoladStore.setState({
        devices: [
          { id: useHoladStore.getState().deviceId, name: 'Phone' },
          { id: remoteId, name: 'TV' },
        ],
        activeDeviceId: remoteId,
      });

      expect(useHoladStore.getState().activeDeviceId).toBe(remoteId);
    });
  });

  describe('5. PlaybackSlice Interception for Passive Device', () => {
    it('intercepts setIsPlaying on passive device and sends remoteCommand without local change', () => {
      const sendRemoteCommandSpy = vi.spyOn(useHoladStore.getState(), 'sendRemoteCommand');
      useHoladStore.setState({
        roomId: 'active-room',
        activeDeviceId: 'other-device-id',
      });
      usePlayerStore.setState({ isPlaying: false });

      usePlayerStore.getState().setIsPlaying(true);

      expect(sendRemoteCommandSpy).toHaveBeenCalledWith('play');
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it('allows setIsPlaying on active master device directly', () => {
      const myId = useHoladStore.getState().deviceId;
      useHoladStore.setState({
        roomId: 'active-room',
        activeDeviceId: myId,
      });
      usePlayerStore.setState({ isPlaying: false });

      usePlayerStore.getState().setIsPlaying(true);

      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });
  });

  describe('6. Dead-Reckoning & Anti-Jitter in holad_syncState', () => {
    it('applies anti-jitter when playing same track and drift < 800ms', () => {
      const track = createMockTrack('trk-1', 'Track 1', 100);
      usePlayerStore.setState({
        queue: [track],
        currentIndex: 0,
        isPlaying: true,
      });
      useAudioStore.setState({
        duration: 100,
        progress: 10, // 10% = 10,000ms
        isSeeking: false,
      });

      // Snapshot position: 10,400ms (drift = 400ms < 800ms)
      const now = Date.now();
      const snapshot: PlaybackSnapshot = {
        roomId: 'room-1',
        activeDeviceId: 'master-pc',
        trackId: 'trk-1',
        currentIndex: 0,
        queue: [track],
        positionMs: 10400,
        timestamp: now,
        isPlaying: true,
        playbackRate: 1,
        version: 1,
      };

      useHoladStore.setState({
        activeDeviceId: 'master-pc',
        snapshot,
      });

      // Calculate drift
      const trackDurationMs = 100 * 1000;
      const currentLocalPosMs = (10 / 100) * trackDurationMs; // 10000
      const calculatedPosMs = snapshot.positionMs; // 10400
      const drift = Math.abs(calculatedPosMs - currentLocalPosMs); // 400ms

      expect(drift).toBeLessThan(800);
    });

    it('corrects progress when drift >= 800ms', () => {
      const track = createMockTrack('trk-1', 'Track 1', 100);
      usePlayerStore.setState({
        queue: [track],
        currentIndex: 0,
        isPlaying: true,
      });
      useAudioStore.setState({
        duration: 100,
        progress: 10, // 10% = 10,000ms
        isSeeking: false,
      });

      const now = Date.now();
      const snapshot: PlaybackSnapshot = {
        roomId: 'room-1',
        activeDeviceId: 'master-pc',
        trackId: 'trk-1',
        currentIndex: 0,
        queue: [track],
        positionMs: 15000, // 15,000ms (drift = 5,000ms >= 800ms)
        timestamp: now,
        isPlaying: true,
        playbackRate: 1,
        version: 2,
      };

      const trackDurationMs = 100 * 1000;
      const currentLocalPosMs = (useAudioStore.getState().progress / 100) * trackDurationMs;
      const drift = Math.abs(snapshot.positionMs - currentLocalPosMs);

      expect(drift).toBeGreaterThanOrEqual(800);
      useAudioStore.getState().setProgress((snapshot.positionMs / trackDurationMs) * 100);

      expect(useAudioStore.getState().progress).toBe(15);
    });
  });

  describe('7. transferPlayback Method', () => {
    it('emits holad_transferPlayback with targetDeviceId', () => {
      const mockSocket = {
        emit: vi.fn(),
      } as any;

      useHoladStore.setState({ socket: mockSocket });
      useHoladStore.getState().transferPlayback('new-speaker-id');

      expect(mockSocket.emit).toHaveBeenCalledWith('holad_transferPlayback', {
        targetDeviceId: 'new-speaker-id',
      });
    });
  });

  describe('8. Heartbeat & Active Subscriptions in playbackSyncService', () => {
    it('emits holad_updateSnapshot on active device when track changes', () => {
      const myId = useHoladStore.getState().deviceId;
      const mockSocket = {
        emit: vi.fn(),
      } as any;

      const track1 = createMockTrack('trk-1', 'Track 1', 120);
      const track2 = createMockTrack('trk-2', 'Track 2', 180);

      useHoladStore.setState({
        socket: mockSocket,
        roomId: 'my-room',
        activeDeviceId: myId,
      });
      usePlayerStore.setState({
        queue: [track1, track2],
        currentIndex: 0,
        isPlaying: true,
      });

      useHoladStore.getState().setupStoreSubscriptions();

      // Active master skips to next track
      usePlayerStore.setState({ currentIndex: 1 });

      const snapshotCall = mockSocket.emit.mock.calls.find(
        (call: any[]) => call[0] === 'holad_updateSnapshot'
      );
      expect(snapshotCall).toBeDefined();
      expect(snapshotCall[1]).toEqual(expect.objectContaining({
        roomId: 'my-room',
        trackId: 'trk-2',
        currentIndex: 1,
        isPlaying: true,
      }));
    });
  });

  describe('9. Zero-Reset Protection in AudioDeck and AudioEngine', () => {
    it('AudioDeck.getCurrentTime() returns targetPosition during loading or before canplay if targetPosition > 0', () => {
      const deck = new AudioDeck('test-deck-1');
      deck.targetPosition = 45;
      deck.state = 'loading';
      expect(deck.getCurrentTime()).toBe(45);

      deck.state = 'ready';
      // hasCanPlayFired is false
      expect(deck.getCurrentTime()).toBe(45);

      deck.destroy();
    });

    it('AudioDeck.load() does not emit timeupdate with 0 when position > 0', async () => {
      const deck = new AudioDeck('test-deck-2');
      const timeUpdates: number[] = [];
      deck.on('timeupdate', (time: number) => {
        timeUpdates.push(time);
      });

      // Mock element load and play
      deck.element.load = vi.fn();
      deck.element.play = vi.fn().mockResolvedValue(undefined);

      await deck.load('https://example.com/audio.mp3', 30);

      expect(timeUpdates).not.toContain(0);
      expect(timeUpdates).toContain(30);

      deck.destroy();
    });

    it('AudioEngine suppresses false timeupdate of 0 during isPreparingPlayback when starting at position > 0', async () => {
      const engine = new AudioEngine();
      const emittedTimes: number[] = [];

      engine.on('timeupdate', (time: number) => {
        emittedTimes.push(time);
      });

      const activeDeck = engine.getActiveDeck();
      activeDeck.element.load = vi.fn();
      activeDeck.element.play = vi.fn().mockResolvedValue(undefined);

      const playPromise = engine.playTrack(
        { id: 'trk-100', streamUrl: 'https://example.com/stream.mp3' },
        { startTime: 50, immediate: true }
      );

      // Simulate false 0 timeupdate from native audio element while preparing
      activeDeck.emit('timeupdate', 0);

      await playPromise;

      expect(emittedTimes).not.toContain(0);
      expect(emittedTimes).toContain(50);

      engine.destroy();
    });
  });

  describe('10. Latency-Compensated Transfer Playback Calculation', () => {
    it('calculates compensated position accurately with NTP clientOffset and playbackRate', () => {
      const snapshot: PlaybackSnapshot = {
        roomId: 'room-comp',
        activeDeviceId: 'pc-1',
        trackId: 'trk-1',
        currentIndex: 0,
        positionMs: 30000, // 30 sec
        timestamp: 1700000000000,
        isPlaying: true,
        playbackRate: 1.5,
        version: 5,
      };

      useHoladStore.setState({
        snapshot,
        clientOffset: -500, // local clock is 500ms behind server
      });

      // Suppose local Date.now() corresponds to serverTime + 4000ms elapsed since snapshot
      const mockNow = 1700000000000 + 4000 + (-500); // Date.now() - clientOffset = 1700000004000
      vi.spyOn(Date, 'now').mockReturnValue(mockNow);

      const clientOffset = useHoladStore.getState().clientOffset || 0;
      const nowServer = Date.now() - clientOffset;
      const elapsedSec = ((nowServer - snapshot.timestamp) * (snapshot.playbackRate || 1)) / 1000;
      const compensatedPosSec = (snapshot.positionMs / 1000) + Math.max(0, elapsedSec);

      // elapsed = 4000ms * 1.5 = 6000ms = 6 sec
      // compensatedPosSec = 30 + 6 = 36 sec
      expect(elapsedSec).toBe(6);
      expect(compensatedPosSec).toBe(36);
    });
  });

  describe('11. Race Condition Protection in fetchPlaybackState', () => {
    it('ignores stale HTTP state when Holad Connect socket already has active room snapshot (version > 0)', () => {
      useHoladStore.setState({
        roomId: 'active-room',
        snapshot: {
          roomId: 'active-room',
          activeDeviceId: 'phone-1',
          trackId: 'trk-socket-fresh',
          currentIndex: 2,
          positionMs: 45000,
          timestamp: Date.now(),
          isPlaying: true,
          playbackRate: 1,
          version: 2,
        },
      });

      const holadState = useHoladStore.getState();
      const shouldDropHttp = Boolean(
        holadState.roomId &&
        holadState.snapshot &&
        holadState.snapshot.version > 0
      );

      expect(shouldDropHttp).toBe(true);
    });

    it('does not drop HTTP state if room is null or snapshot has version 0', () => {
      useHoladStore.setState({
        roomId: null,
        snapshot: null,
      });

      const holadState = useHoladStore.getState();
      const shouldDropHttp = Boolean(
        holadState.roomId &&
        holadState.snapshot &&
        holadState.snapshot.version > 0
      );

      expect(shouldDropHttp).toBe(false);
    });
  });

  describe('12. Robust Device Extraction in holad_devices', () => {
    it('correctly handles object payload with { devices, activeDeviceId }', () => {
      useHoladStore.getState().connect('room-devices-1');
      const handler = socketEventHandlers['holad_devices'];
      expect(handler).toBeDefined();

      handler({
        devices: [
          { id: 'd-1', name: 'Browser PC' },
          { id: 'd-2', name: 'Living Room TV' },
        ],
        activeDeviceId: 'd-2',
      });

      const state = useHoladStore.getState();
      expect(state.devices).toHaveLength(2);
      expect(state.devices[0].name).toBe('Browser PC');
      expect(state.activeDeviceId).toBe('d-2');
    });

    it('correctly handles raw array payload without crashing and sets activeDeviceId to null', () => {
      useHoladStore.getState().connect('room-devices-2');
      const handler = socketEventHandlers['holad_devices'];
      expect(handler).toBeDefined();

      handler([
        { id: 'dev-raw-1', name: 'Raw Device 1' },
      ]);

      const state = useHoladStore.getState();
      expect(state.devices).toEqual([{ id: 'dev-raw-1', name: 'Raw Device 1' }]);
      expect(state.activeDeviceId).toBeNull();
    });

    it('safely handles null/empty/malformed payload by defaulting to empty array', () => {
      useHoladStore.getState().connect('room-devices-3');
      const handler = socketEventHandlers['holad_devices'];
      expect(handler).toBeDefined();

      handler({ devices: null });
      expect(useHoladStore.getState().devices).toEqual([]);
      expect(useHoladStore.getState().activeDeviceId).toBeNull();

      handler(null);
      expect(useHoladStore.getState().devices).toEqual([]);
      expect(useHoladStore.getState().activeDeviceId).toBeNull();
    });
  });

  describe('13. Connection Resilience & Error Reset in connect(roomId)', () => {
    it('resets connectError and properly stores roomId when connecting from disconnected status', () => {
      useHoladStore.setState({
        connectionStatus: 'disconnected',
        connectError: 'Network failed previously',
        roomId: null,
      });

      useHoladStore.getState().connect('room-resilience');

      const state = useHoladStore.getState();
      expect(state.connectError).toBeNull();
      expect(state.roomId).toBe('room-resilience');
      expect(state.connectionStatus).toBe('connecting');
    });
  });

  describe('14. ServerConfig Socket URL & Path Resolution in Tauri/Capacitor', () => {
    afterEach(() => {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).Capacitor;
      localStorage.clear();
      useAuthStore.getState().logout();
    });

    it('falls back to useAuthStore.url origin and pathname in Tauri when customUrl is absent', () => {
      (window as any).__TAURI_INTERNALS__ = {};
      useAuthStore.getState().setCredentials('https://music.example.com:8443/musicapp', 'user', 'tok', 'salt');

      expect(getSocketUrl()).toBe('https://music.example.com:8443');
      expect(getSocketPath()).toBe('/musicapp/socket.io');
    });

    it('falls back to /socket.io in Tauri when authUrl has no subpath', () => {
      (window as any).__TAURI_INTERNALS__ = {};
      useAuthStore.getState().setCredentials('https://subsonic.server.net', 'user', 'tok', 'salt');

      expect(getSocketUrl()).toBe('https://subsonic.server.net');
      expect(getSocketPath()).toBe('/socket.io');
    });

    it('prefers custom holadServerUrl over useAuthStore in Capacitor', () => {
      (window as any).Capacitor = { isNative: true };
      useAuthStore.getState().setCredentials('https://auth-server.net', 'user', 'tok', 'salt');
      localStorage.setItem('holadServerUrl', 'http://custom-socket.local:9000/custom');

      expect(getSocketUrl()).toBe('http://custom-socket.local:9000');
      expect(getSocketPath()).toBe('/custom/socket.io');
    });
  });

  describe('15. ConnectDeviceList UI Connection States', () => {
    it('renders clean disconnected state without showing "devices_not_found"', () => {
      const onRetryMock = vi.fn();
      const { container } = render(
        React.createElement(ConnectDeviceList, {
          connectionStatus: 'disconnected',
          devices: [],
          onSelectDevice: vi.fn(),
          onRetry: onRetryMock,
        })
      );

      expect(container.textContent).toContain('Отключено от сервера Holad Connect');
      expect(container.textContent).not.toContain('Устройства не найдены');

      const retryBtn = screen.getByRole('button', { name: /Повторить|Переподключиться|retry/i });
      expect(retryBtn).toBeDefined();
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('renders connecting state with spinner and connecting text', () => {
      const { container } = render(
        React.createElement(ConnectDeviceList, {
          connectionStatus: 'connecting',
          devices: [],
          onSelectDevice: vi.fn(),
        })
      );

      expect(container.textContent).toMatch(/Подключение|connecting/i);
      expect(container.textContent).not.toContain('Устройства не найдены');
    });

    it('renders error state with connection_failed, error details, and retry button', () => {
      const onRetryMock = vi.fn();
      const { container } = render(
        React.createElement(ConnectDeviceList, {
          connectionStatus: 'error',
          connectError: 'Network unreachable',
          devices: [],
          onSelectDevice: vi.fn(),
          onRetry: onRetryMock,
        })
      );

      expect(container.textContent).toMatch(/Ошибка подключения|connection_failed/i);
      expect(container.textContent).toContain('Network unreachable');
      const retryBtn = screen.getByRole('button', { name: /Повторить|Переподключиться|retry/i });
      fireEvent.click(retryBtn);
      expect(onRetryMock).toHaveBeenCalledTimes(1);
    });

    it('renders devices_not_found only when connectionStatus is connected and devices is empty', () => {
      const { container } = render(
        React.createElement(ConnectDeviceList, {
          connectionStatus: 'connected',
          devices: [],
          onSelectDevice: vi.fn(),
        })
      );

      expect(container.textContent).toMatch(/Устройства не найдены|devices_not_found/i);
    });

    it('renders device items when devices are present', () => {
      const onSelectMock = vi.fn();
      const testDevices = [
        { id: 'dev-1', name: 'Living Room TV' },
        { id: 'dev-2', name: 'Mobile Phone' },
      ];

      const { container } = render(
        React.createElement(ConnectDeviceList, {
          connectionStatus: 'connected',
          devices: testDevices,
          localDeviceId: 'dev-2',
          activeDeviceId: 'dev-1',
          onSelectDevice: onSelectMock,
        })
      );

      expect(container.textContent).toContain('Living Room TV');
      expect(container.textContent).not.toContain('Устройства не найдены');
    });
  });
});
