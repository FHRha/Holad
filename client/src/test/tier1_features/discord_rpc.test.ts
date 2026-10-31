import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDiscordRpc, isPublicWebUrl } from '../../hooks/useDiscordRpc';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAudioStore } from '../../store/audioStore';
import { useHoladStore } from '../../store/holadStore';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

// Mock @tauri-apps/api/core with vi.hoisted
const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

// Mock isTauri to return true
vi.mock('../../utils/StorageManager', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    isTauri: () => true,
  };
});

describe('useDiscordRpc Hook and Presence Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    resetAllStores();

    // Default to active device
    useHoladStore.setState({
      deviceId: 'device-test-1',
      activeDeviceId: 'device-test-1',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('syncs enableDiscordRpc toggle to backend on mount and update', () => {
    renderHook(() => useDiscordRpc());

    expect(mockInvoke).toHaveBeenCalledWith('set_discord_rpc_enabled', { enabled: true });

    act(() => {
      useSettingsStore.getState().setEnableDiscordRpc(false);
    });

    expect(mockInvoke).toHaveBeenCalledWith('set_discord_rpc_enabled', { enabled: false });
  });

  it('syncs custom discordClientId to backend', () => {
    renderHook(() => useDiscordRpc());

    act(() => {
      useSettingsStore.getState().setDiscordClientId('1234567890123456789');
    });

    expect(mockInvoke).toHaveBeenCalledWith('set_discord_client_id', { clientId: '1234567890123456789' });
  });

  it('broadcasts active track activity when playing', () => {
    const track = createMockTrack('track-100', 'Мертвые звезды', 406, 'Слава КПСС');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });
    useAudioStore.setState({
      duration: 406,
      progress: 5, // 5% -> ~20.3s
    });

    renderHook(() => useDiscordRpc());

    const updateCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'update_discord_activity');
    expect(updateCalls.length).toBeGreaterThan(0);
    const lastActivity = updateCalls[updateCalls.length - 1][1].activity;

    expect(lastActivity).not.toBeNull();
    expect(lastActivity.title).toBe('Мертвые звезды');
    expect(lastActivity.artist).toBe('Слава КПСС');
    expect(lastActivity.is_playing).toBe(true);
    expect(lastActivity.duration).toBe(406);
  });

  it('clears Discord activity immediately when playback is paused / stopped', () => {
    const track = createMockTrack('track-100', 'Катафалка', 240, 'Слава КПСС');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    const { rerender } = renderHook(() => useDiscordRpc());

    // Initially broadcasted
    expect(mockInvoke).toHaveBeenCalledWith(
      'update_discord_activity',
      expect.objectContaining({
        activity: expect.objectContaining({ title: 'Катафалка', is_playing: true }),
      })
    );

    // User presses Pause
    act(() => {
      usePlayerStore.setState({ isPlaying: false });
    });
    rerender();

    // Must be cleared (activity: null)
    expect(mockInvoke).toHaveBeenLastCalledWith('update_discord_activity', { activity: null });
  });

  it('clears Discord activity when user is not the active device', () => {
    const track = createMockTrack('track-100', 'Track 1', 200, 'Artist');
    useHoladStore.setState({
      roomId: 'room-1',
      deviceId: 'device-test-1',
      activeDeviceId: 'device-test-1',
    });
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    const { rerender } = renderHook(() => useDiscordRpc());

    act(() => {
      useHoladStore.setState({ activeDeviceId: 'different-device-999' });
    });
    rerender();

    expect(mockInvoke).toHaveBeenLastCalledWith('update_discord_activity', { activity: null });
  });

  it('clears Discord activity when enableDiscordRpc is disabled', () => {
    const track = createMockTrack('track-100', 'Track 1', 200, 'Artist');
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    const { rerender } = renderHook(() => useDiscordRpc());

    act(() => {
      useSettingsStore.getState().setEnableDiscordRpc(false);
    });
    rerender();

    expect(mockInvoke).toHaveBeenCalledWith('update_discord_activity', { activity: null });
  });

  it('correctly detects public vs local/private URLs to prevent Discord grey broken image bars', () => {
    // Local / private IP addresses that Discord fails on:
    expect(isPublicWebUrl('http://localhost:4000/api/cover/al-123')).toBe(false);
    expect(isPublicWebUrl('http://127.0.0.1:4533/rest/getCoverArt')).toBe(false);
    expect(isPublicWebUrl('http://192.168.1.50:4533/rest/getCoverArt')).toBe(false);
    expect(isPublicWebUrl('http://10.0.0.5:4533/rest/getCoverArt')).toBe(false);
    expect(isPublicWebUrl('http://server.local/cover.jpg')).toBe(false);
    expect(isPublicWebUrl(null)).toBe(false);
    expect(isPublicWebUrl('')).toBe(false);

    // Public URLs that Discord CDN proxy can cleanly fetch:
    expect(isPublicWebUrl('https://is1-ssl.mzstatic.com/image/thumb/Music116/cover.jpg/600x600bb.jpg')).toBe(true);
    expect(isPublicWebUrl('https://cdn-images.dzcdn.net/images/cover/badf8c9f757e30ddf810b407b6709436/500x500-000000-80-0-0.jpg')).toBe(true);
    expect(isPublicWebUrl('https://my-navidrome.example.com/rest/getCoverArt?id=123')).toBe(true);
  });
});
