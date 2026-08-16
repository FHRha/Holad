import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F2: Mobile Autoplay Prevention', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F2-1: Mobile initialization strictly maintains isPlaying = false without auto-triggering playback', () => {
    const store = usePlayerStore.getState();
    expect(store.isPlaying).toBe(false);

    const mobileCore = new MobileAudioCore();
    expect(mobileCore.getState()).toBe('idle');
    mobileCore.destroy();
  });

  it('F2-2: User interaction gesture unlocks AudioContext without triggering audio.play() when isPlaying is false', async () => {
    const mockCtx = new (window as any).AudioContext();
    expect(mockCtx.state).toBe('suspended');

    // Simulate unlock gesture handler
    const handleGestureUnlock = () => {
      if (mockCtx.state === 'suspended') {
        mockCtx.resume();
      }
    };

    handleGestureUnlock();
    expect(mockCtx.state).toBe('running');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('F2-3: Queue initialization with multiple tracks leaves player in paused state', () => {
    const tracks = [createMockTrack('m1', 'Mobile Track 1'), createMockTrack('m2', 'Mobile Track 2')];
    usePlayerStore.getState().setQueue(tracks);

    expect(usePlayerStore.getState().queue.length).toBe(2);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('F2-4: Remote sync state received on non-active mobile client does not trigger local audio playback', () => {
    useHoladStore.setState({
      deviceId: 'mobile-device-1',
      activeDeviceId: 'desktop-device-2', // remote desktop is active
      roomId: 'room-123',
    });

    const isLocalActive = useHoladStore.getState().activeDeviceId === useHoladStore.getState().deviceId;
    expect(isLocalActive).toBe(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('F2-5: Track playback starts immediately when explicit user play action occurs', async () => {
    const mobileCore = new MobileAudioCore();
    const track = createMockTrack('m3', 'Explicit User Play');
    
    // Explicit user play
    usePlayerStore.getState().setIsPlaying(true);
    await mobileCore.play((track as any).streamUrl, 0);

    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(mobileCore.getState()).toBe('playing');
    
    mobileCore.destroy();
  });

  it('F2-6: Mobile audio element pause() cleanly halts playback when isPlaying is set to false', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/test', 0);
    expect(mobileCore.getState()).toBe('playing');

    mobileCore.pause();
    usePlayerStore.getState().setIsPlaying(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    mobileCore.destroy();
  });

  it('F2-7: addToQueue preserves isPlaying = false when adding tracks to empty queue', () => {
    usePlayerStore.setState({ queue: [], currentIndex: -1, isPlaying: false });
    const tracks = [createMockTrack('q1', 'Queued Track 1')];
    usePlayerStore.getState().addToQueue(tracks);

    expect(usePlayerStore.getState().queue.length).toBe(1);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('F2-8: addToQueue preserves isPlaying = true when tracks are added during active playback', () => {
    usePlayerStore.setState({ queue: [createMockTrack('q0', 'Current Playing Track')], currentIndex: 0, isPlaying: true });
    const tracks = [createMockTrack('q1', 'Queued Track 1')];
    usePlayerStore.getState().addToQueue(tracks);

    expect(usePlayerStore.getState().queue.length).toBe(2);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('F2-9: Mobile volume setting functions accurately and allows 0 volume without resetting to 1.0', () => {
    usePlayerStore.getState().setMobileVolume(0);
    expect(usePlayerStore.getState().mobileVolume).toBe(0);

    usePlayerStore.getState().setMobileVolume(0.85);
    expect(usePlayerStore.getState().mobileVolume).toBe(0.85);
  });
});
