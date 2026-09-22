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

  it('P3-4: When remote device is idle (isRemotePlaying=false), selecting a queue claims active role locally', () => {
    let emittedEvent: string | null = null;
    let emittedPayload: any = null;

    const mockSocket = {
      emit: (event: string, payload: any) => {
        emittedEvent = event;
        emittedPayload = payload;
      }
    } as any;

    useHoladStore.setState({
      socket: mockSocket,
      deviceId: 'mobile-client-99',
      activeDeviceId: 'desktop-host-1',
      roomId: 'user-room',
      devices: [
        { id: 'mobile-client-99', name: 'Mobile' },
        { id: 'desktop-host-1', name: 'Desktop' }
      ],
      isRemotePlaying: false, // Desktop is idle in other room
    });
    useHoladStore.getState().setupStoreSubscriptions();

    // Selecting a track/queue on mobile should claim active device locally
    usePlayerStore.getState().setQueueAndPlay(createMockAlbumTracks(3), 0);

    expect(emittedEvent).toBe('holad_setActiveDevice');
    expect(emittedPayload).toBe('mobile-client-99');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('P3-5: Safe setActiveDevice emits direct holad_setActiveDevice if previous active device is offline', () => {
    let emittedEvent: string | null = null;
    let emittedPayload: any = null;

    const mockSocket = {
      emit: (event: string, payload: any) => {
        emittedEvent = event;
        emittedPayload = payload;
      }
    } as any;

    useHoladStore.setState({
      socket: mockSocket,
      deviceId: 'mobile-client-99',
      activeDeviceId: 'desktop-host-offline',
      roomId: 'user-room',
      devices: [
        { id: 'mobile-client-99', name: 'Mobile' } // desktop-host-offline is NOT in devices
      ],
    });

    useHoladStore.getState().setActiveDevice('mobile-client-99');

    // Should immediately emit holad_setActiveDevice without waiting for offline device to reply
    expect(emittedEvent).toBe('holad_setActiveDevice');
    expect(emittedPayload).toBe('mobile-client-99');
  });
});
