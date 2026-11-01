import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useHoladStore } from '../../store/holadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { checkAndRestoreSockets } from '../../hooks/useWindowVisibility';

// Mock getAudioEngine
const mockSeek = vi.fn();
const mockSetPlaybackRate = vi.fn();
let mockCurrentTime = 10;
const mockGetActiveTrackId = vi.fn().mockReturnValue('track-1');
const mockGetState = vi.fn().mockReturnValue('playing');
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockPause = vi.fn();

vi.mock('../../audio/AudioEngine', () => ({
  getAudioEngine: () => ({
    seek: mockSeek,
    setPlaybackRate: mockSetPlaybackRate,
    getCurrentTime: () => mockCurrentTime,
    getActiveTrackId: mockGetActiveTrackId,
    getState: mockGetState,
    resume: mockResume,
    pause: mockPause,
    getDuration: () => 180,
  }),
}));

describe('Jam Deadband Audio Sync & Socket Lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    usePlayerStore.setState({
      roomId: 'room-1',
      role: 'listener',
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any,
      currentIndex: 0,
      isPlaying: true,
      initialPosition: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps playbackRate at 1.0 when lag is within Deadband Zone [0.0, 0.50]', () => {
    // Listener is at 10.0s. Host currentTime = 10.15s.
    // hostEstimatedTime = 10.15 + 0.10 = 10.25s.
    // lag = 10.25 - 10.0 = 0.25s (exactly TARGET_LAG).
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 10.15,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
    });

    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.0);
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('applies micro-adjustment 1.025x when listener is behind (0.50 < lag <= 1.50) and resets to 1.0 after timer', () => {
    // Listener is at 10.0s. Host currentTime = 10.70s.
    // hostEstimatedTime = 10.70 + 0.10 = 10.80s.
    // lag = 10.80 - 10.0 = 0.80s (in (0.50, 1.50]).
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 10.70,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
    });

    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.025);
    expect(mockSeek).not.toHaveBeenCalled();

    // Fast-forward timer: timeToSyncSec = (0.80 - 0.25) / 0.025 = 22s -> capped at 8000ms
    vi.advanceTimersByTime(8000);
    expect(mockSetPlaybackRate).toHaveBeenLastCalledWith(1.0);
  });

  it('applies micro-adjustment 0.975x when listener is ahead (-1.0 <= lag < 0.0) and resets to 1.0 after timer', () => {
    // Listener is at 10.0s. Host currentTime = 9.70s.
    // hostEstimatedTime = 9.70 + 0.10 = 9.80s.
    // lag = 9.80 - 10.0 = -0.20s (in [-1.0, 0.0)).
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 9.70,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
    });

    expect(mockSetPlaybackRate).toHaveBeenCalledWith(0.975);
    expect(mockSeek).not.toHaveBeenCalled();

    // Fast-forward timer: capped at 8000ms
    vi.advanceTimersByTime(8000);
    expect(mockSetPlaybackRate).toHaveBeenLastCalledWith(1.0);
  });

  it('performs hard seek when lag > 1.50s', () => {
    // Listener is at 10.0s. Host currentTime = 12.0s.
    // hostEstimatedTime = 12.0 + 0.10 = 12.10s.
    // lag = 12.10 - 10.0 = 2.10s > 1.50s.
    // Seek to Math.max(0, 12.10 - 0.25) = 11.85s.
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 12.0,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
    });

    expect(mockSeek).toHaveBeenCalledWith(12.10 - 0.25);
    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.0);
  });

  it('performs hard seek when lag < -1.0s', () => {
    // Listener is at 10.0s. Host currentTime = 8.0s.
    // hostEstimatedTime = 8.0 + 0.10 = 8.10s.
    // lag = 8.10 - 10.0 = -1.90s < -1.0s.
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 8.0,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
    });

    expect(mockSeek).toHaveBeenCalledWith(8.10 - 0.25);
    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.0);
  });

  it('performs hard seek when isSeek is explicitly true', () => {
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 10.15,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
      isSeek: true,
    });

    expect(mockSeek).toHaveBeenCalledWith(10.25 - 0.25);
    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.0);
  });

  it('host never adjusts playback rate or seeks in applySyncState', () => {
    usePlayerStore.setState({ role: 'host' });
    mockCurrentTime = 10.0;
    (jamSocket as any).applySyncState({
      currentTime: 20.0,
      isPlaying: true,
      currentIndex: 0,
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }],
      isSeek: true,
    });

    expect(mockSetPlaybackRate).toHaveBeenCalledWith(1.0);
    expect(mockSeek).not.toHaveBeenCalled();
  });

  it('offsets initial position by TARGET_LAG on track change for listener', () => {
    usePlayerStore.setState({
      role: 'listener',
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any,
      currentIndex: 0,
    });

    (jamSocket as any).applySyncState({
      currentTime: 10.0,
      isPlaying: true,
      currentIndex: 1,
      queue: [
        { id: 'track-1', title: 'Song 1', duration: 180 },
        { id: 'track-2', title: 'Song 2', duration: 180 },
      ],
    });

    expect(usePlayerStore.getState().initialPosition).toBe((10.0 - 0.25) * 1000);
  });

  it('sets initial position to 0 on track change when currentTime is 0', () => {
    usePlayerStore.setState({
      role: 'listener',
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any,
      currentIndex: 0,
    });

    (jamSocket as any).applySyncState({
      currentTime: 0,
      isPlaying: true,
      currentIndex: 1,
      queue: [
        { id: 'track-1', title: 'Song 1', duration: 180 },
        { id: 'track-2', title: 'Song 2', duration: 180 },
      ],
    });

    expect(usePlayerStore.getState().initialPosition).toBe(0);
  });

  it('auto-reconnects holadStore and jamSocket on window visibility restore', () => {
    const refreshSpy = vi.fn();
    useAuthStore.setState({ isAuthenticated: true });
    useHoladStore.setState({
      connectionStatus: 'disconnected',
      socket: null,
      refreshDevices: refreshSpy,
    });

    const connectSpy = vi.spyOn(jamSocket, 'connect').mockImplementation(() => {});
    vi.spyOn(jamSocket, 'isConnected').mockReturnValue(false);

    checkAndRestoreSockets();

    expect(refreshSpy).toHaveBeenCalled();
    expect(connectSpy).toHaveBeenCalled();
  });

  it('handles onCloseRequested when closeToTray is true: does not emit holad_leave and preserves isPlaying', async () => {
    let closeHandler: (() => void) | null = null;
    (window as any).__TAURI_INTERNALS__ = {};

    vi.doMock('@tauri-apps/api/window', () => ({
      getCurrentWindow: () => ({
        onCloseRequested: vi.fn((cb) => {
          closeHandler = cb;
          return Promise.resolve(vi.fn());
        }),
      }),
    }));

    const mockEmit = vi.fn();
    const mockDisconnect = vi.fn();
    useSettingsStore.setState({ closeToTray: true });
    usePlayerStore.setState({
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any,
      currentIndex: 0,
      isPlaying: true,
    });
    useHoladStore.setState({
      roomId: 'room-1',
      deviceId: 'dev-1',
      socket: { emit: mockEmit } as any,
      disconnect: mockDisconnect,
    });

    const { renderHook } = await import('@testing-library/react');
    const { useAppLifecycle } = await import('../../hooks/useAppLifecycle');
    const { unmount } = renderHook(() => useAppLifecycle());

    await vi.waitFor(() => expect(closeHandler).not.toBeNull());

    closeHandler!();

    expect(mockEmit).toHaveBeenCalledWith('holad_updateState', expect.objectContaining({
      isPlaying: true,
      roomId: 'room-1',
      deviceId: 'dev-1',
    }));
    expect(mockEmit).not.toHaveBeenCalledWith('holad_leave', expect.anything());
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(localStorage.getItem('holad_track')).toBe('track-1');

    unmount();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('handles onCloseRequested when closeToTray is false: emits holad_leave and disconnects', async () => {
    let closeHandler: (() => void) | null = null;
    (window as any).__TAURI_INTERNALS__ = {};

    vi.doMock('@tauri-apps/api/window', () => ({
      getCurrentWindow: () => ({
        onCloseRequested: vi.fn((cb) => {
          closeHandler = cb;
          return Promise.resolve(vi.fn());
        }),
      }),
    }));

    const mockEmit = vi.fn();
    const mockDisconnect = vi.fn();
    useSettingsStore.setState({ closeToTray: false });
    usePlayerStore.setState({
      queue: [{ id: 'track-1', title: 'Song 1', duration: 180 }] as any,
      currentIndex: 0,
      isPlaying: true,
    });
    useHoladStore.setState({
      roomId: 'room-1',
      deviceId: 'dev-1',
      socket: { emit: mockEmit } as any,
      disconnect: mockDisconnect,
    });

    const { renderHook } = await import('@testing-library/react');
    const { useAppLifecycle } = await import('../../hooks/useAppLifecycle');
    const { unmount } = renderHook(() => useAppLifecycle());

    await vi.waitFor(() => expect(closeHandler).not.toBeNull());

    closeHandler!();

    expect(mockEmit).toHaveBeenCalledWith('holad_updateState', expect.objectContaining({
      isPlaying: false,
      roomId: 'room-1',
      deviceId: 'dev-1',
    }));
    expect(mockEmit).toHaveBeenCalledWith('holad_leave', {
      roomId: 'room-1',
      deviceId: 'dev-1',
    });
    expect(mockDisconnect).toHaveBeenCalled();

    unmount();
    delete (window as any).__TAURI_INTERNALS__;
  });
});
