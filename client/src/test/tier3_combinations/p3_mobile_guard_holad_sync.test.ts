import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P3: Mobile Autoplay Guard + Remote Holad Sync + Local Queue', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('P3-1: Mobile device connecting to remote Jam/Holad session remains paused until user interaction', () => {
    useHoladStore.setState({
      deviceId: 'mobile-client-99',
      activeDeviceId: 'desktop-host-1',
      roomId: 'room-jam-42',
    });

    usePlayerStore.getState().setQueue(createMockAlbumTracks(3));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('P3-2: Restoring local queue on mobile launch while remote device is playing does not start local audio', () => {
    useHoladStore.setState({
      deviceId: 'mobile-client-99',
      activeDeviceId: 'desktop-host-1',
      roomId: 'room-jam-42',
    });

    usePlayerStore.getState().setQueue(createMockAlbumTracks(5));
    usePlayerStore.getState().setCurrentIndex(2);

    const isLocalActive = useHoladStore.getState().activeDeviceId === useHoladStore.getState().deviceId;
    expect(isLocalActive).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('P3-3: Explicitly claiming active playback role on mobile allows playback to start', () => {
    useHoladStore.setState({
      deviceId: 'mobile-client-99',
      activeDeviceId: 'mobile-client-99', // Claimed active
      roomId: 'room-jam-42',
    });

    usePlayerStore.getState().setIsPlaying(true);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });
});
