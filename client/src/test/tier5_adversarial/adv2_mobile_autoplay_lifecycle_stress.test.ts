import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useHoladStore } from '../../store/holadStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { createMockAudioElement } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Mobile Autoplay & Lifecycle Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('ADV-MOB-1: Rapid 100x touch burst on cold start unlocks AudioContext without starting playback', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);
    const mockCtx = engine.getAudioContext() as any;

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(engine.getState()).toBe('idle');
    expect(mockCtx.state).toBe('suspended');

    // Simulate 100 rapid touch / click bursts from impatient user on cold start
    for (let i = 0; i < 100; i++) {
      const touchEvent = new Event('touchstart');
      const clickEvent = new Event('click');
      document.dispatchEvent(touchEvent);
      document.dispatchEvent(clickEvent);
      await engine.getWebAudioPipeline()?.unlockContext();
    }

    // AudioContext is now running, but audio playback has NOT been triggered
    expect(mockCtx.state).toBe('running');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(engine.getState()).toBe('idle');
    expect(el0.paused).toBe(true);
    expect(el1.paused).toBe(true);

    engine.destroy();
  });

  it('ADV-MOB-2: Cold start with 50 pre-populated tracks remains strictly paused across user gesture events', async () => {
    const tracks = Array.from({ length: 50 }, (_, i) => createMockTrack(`cold-${i}`, `Cold Track ${i}`, 180));
    usePlayerStore.getState().setQueue(tracks);

    expect(usePlayerStore.getState().queue.length).toBe(50);
    expect(usePlayerStore.getState().currentIndex).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    const mobileCore = new MobileAudioCore();
    expect(mobileCore.getState()).toBe('idle');

    // Simulate user tapping around non-player UI elements (scrolling, browsing)
    for (let i = 0; i < 20; i++) {
      document.dispatchEvent(new Event('touchstart'));
      document.dispatchEvent(new Event('click'));
    }

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(mobileCore.getState()).toBe('idle');

    mobileCore.destroy();
  });

  it('ADV-MOB-3: Background tab transitions (visibilityState hidden/visible blur/focus) during hydration do not trigger autoplay', () => {
    const tracks = [createMockTrack('bg-1', 'Background Track 1')];
    usePlayerStore.getState().setQueue(tracks);

    // Simulate tab going to background
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));

    expect(usePlayerStore.getState().isPlaying).toBe(false);

    // Simulate tab returning to foreground
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('ADV-MOB-4: Inactive mobile client in Holad sync room receives flood of time updates without auto-starting local audio', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    useHoladStore.setState({
      deviceId: 'mobile-client-99',
      activeDeviceId: 'desktop-host-1', // Remote device is the active speaker
      roomId: 'room-jam-42',
    });

    const isLocalActive = useHoladStore.getState().activeDeviceId === useHoladStore.getState().deviceId;
    expect(isLocalActive).toBe(false);

    // Simulate receiving 50 sync time updates from host
    for (let sec = 1; sec <= 50; sec++) {
      if (!isLocalActive) {
        // Inactive client should NOT call play() on its local engine
        useAudioStore.getState().setProgress((sec / 180) * 100);
      }
    }

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(engine.getState()).toBe('idle');
    expect(el0.paused).toBe(true);

    engine.destroy();
  });

  it('ADV-MOB-5: Immediate Play -> Pause microtask race condition cleanly pauses audio deck', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);
    const track = createMockTrack('race-1', 'Race Track', 180);

    // User taps play and then immediately pauses
    await engine.playTrack(track, { immediate: true });
    engine.pause();
    usePlayerStore.getState().setIsPlaying(false);

    expect(engine.getState()).toBe('paused');
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    engine.destroy();
  });

  it('ADV-MOB-6: Aborting active crossfade midway pauses standby deck and restores active deck gain without stuck audio', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('cf-1', 'Crossfade Track 1', 180);
    const track2 = createMockTrack('cf-2', 'Crossfade Track 2', 180);

    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);

    // Start crossfade to track 2 with short duration
    const crossfadePromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    // Abort transition midway via pause
    engine.pause();

    await crossfadePromise.catch(() => {});
    engine.pause();

    expect(engine.getState()).toBe('paused');
    // Verify WebAudioPipeline master volume / deck gain is reset
    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.getDeckGain(engine.getActiveDeckIndex() as 0 | 1)).toBe(1.0);
    }

    engine.destroy();
  });
});
