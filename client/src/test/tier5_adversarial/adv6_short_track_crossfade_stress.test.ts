import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { TransitionManager } from '../../audio/TransitionManager';
import { AudioDeck } from '../../audio/AudioDeck';
import { createMockAudioElement } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Short Track Crossfading & Edge Duration Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ADV-SHT-1: Outgoing track duration (1.5s) shorter than crossfade window (10s) completes without hanging', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({
      isCrossfadeEnabled: true,
      crossfadeDuration: 10,
    });

    const shortTrack1 = createMockTrack('short-1', 'Short Jingle 1', 1.5);
    const longTrack2 = createMockTrack('long-2', 'Full Song 2', 200);

    // Play short track
    await engine.playTrack(shortTrack1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);

    // Crossfade to track 2 with 10s window
    const crossfadePromise = engine.playTrack(longTrack2, { transitionDuration: 10 });

    // Advance 1.5 seconds (short track finishes)
    await vi.advanceTimersByTimeAsync(1500);
    (el0 as any).simulateEnded();

    // Advance remainder of crossfade
    await vi.advanceTimersByTimeAsync(9000);
    await crossfadePromise;

    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getState()).toBe('playing');
    expect(engine.getCurrentTrack().id).toBe('long-2');

    engine.destroy();
  });

  it('ADV-SHT-2: Rapid micro-tracks queue (0.2s, 0.4s, 0.5s) with 8s crossfade setting executes cleanly', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({
      isCrossfadeEnabled: true,
      crossfadeDuration: 8,
    });

    const microTracks = [
      createMockTrack('micro-1', 'Micro Track 1', 0.2),
      createMockTrack('micro-2', 'Micro Track 2', 0.4),
      createMockTrack('micro-3', 'Micro Track 3', 0.5),
      createMockTrack('micro-4', 'Micro Track 4', 0.3),
    ];

    for (let i = 0; i < microTracks.length; i++) {
      const track = microTracks[i];
      const p = engine.playTrack(track);
      if (i > 0) {
        await vi.advanceTimersByTimeAsync(8500);
      }
      await p;
      expect(engine.getState()).toBe('playing');
      expect(engine.getCurrentTrack().id).toBe(track.id);
    }

    engine.destroy();
  });

  it('ADV-SHT-3: Zero, negative, and NaN track duration parameters clamp safely without division by zero', () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    // Extreme duration options
    const invalidOptions = [
      { duration: 0 },
      { duration: -5 },
      { duration: NaN },
      { duration: Infinity },
      { duration: undefined },
    ];

    invalidOptions.forEach(async (opt) => {
      expect(() => {
        tm.performCrossfade(deck0, deck1, opt);
      }).not.toThrow();
    });

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('ADV-SHT-4: Instant seek during active short-track crossfade resolves without stuck audio', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('seek-t1', 'Track 1', 2.0);
    const track2 = createMockTrack('seek-t2', 'Track 2', 180);

    await engine.playTrack(track1, { immediate: true });

    // Start crossfade
    const cfPromise = engine.playTrack(track2, { transitionDuration: 5 });
    await vi.advanceTimersByTimeAsync(1000);

    // User seeks in new track
    engine.seek(50);
    expect(engine.getCurrentTime()).toBe(50);

    await vi.advanceTimersByTimeAsync(5000);
    await cfPromise;

    expect(engine.getState()).toBe('playing');
    engine.destroy();
  });

  it('ADV-SHT-5: Incoming track shorter than crossfade window (0.5s incoming track under 4s crossfade)', async () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    (el1 as any).duration = 0.5;

    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    await deck0.load('http://localhost:4000/stream/s1', 0);
    await deck0.play();
    await deck1.load('http://localhost:4000/stream/short_in', 0);

    const cfPromise = tm.performCrossfade(deck0, deck1, { duration: 4, curve: 'equalPower' });

    // At 0.5s incoming finishes
    await vi.advanceTimersByTimeAsync(500);
    (el1 as any).simulateEnded();

    // Advance remainder of crossfade
    await vi.advanceTimersByTimeAsync(4000);
    await cfPromise;

    expect(tm.getIsTransitioning()).toBe(false);

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('ADV-SHT-6: Rapid back-to-back 10x crossfade trigger storm aborts prior timers and leaves single active deck', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const tracks = Array.from({ length: 10 }, (_, i) => createMockTrack(`storm-${i}`, `Storm ${i}`, 1.0));

    // Fire 10 crossfades in 100ms intervals
    for (const track of tracks) {
      engine.playTrack(track, { transitionDuration: 3 });
      await vi.advanceTimersByTimeAsync(100);
    }

    // Let the final transition complete
    await vi.advanceTimersByTimeAsync(4000);

    expect(engine.getState()).toBe('playing');
    expect(engine.getCurrentTrack().id).toBe('storm-9');

    engine.destroy();
  });
});
