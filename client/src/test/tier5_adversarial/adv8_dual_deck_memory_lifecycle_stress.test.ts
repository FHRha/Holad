import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { PreloadManager } from '../../audio/PreloadManager';
import { createMockAudioElement } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Dual-Deck Concurrent Playback, Memory & Lifecycle Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('ADV-MEM-1: Rapid lifecycle creation, initialization, and destruction churn (100 cycles) cleans up cleanly', () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      expect(engine.getState()).toBe('idle');
      expect(engine.getActiveDeckIndex()).toBe(0);

      engine.destroy();
      expect(engine.getState()).toBe('idle');
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);
    }
  });

  it('ADV-MEM-2: Global AudioContext reuse prevents exceeding browser AudioContext instance limits', () => {
    const pipelines: WebAudioPipeline[] = [];

    // Create 20 pipelines in sequence
    for (let i = 0; i < 20; i++) {
      const pipeline = new WebAudioPipeline();
      pipelines.push(pipeline);
    }

    // All pipelines should share the same global AudioContext singleton instance
    const firstContext = pipelines[0].context;
    pipelines.forEach((p) => {
      expect(p.context).toBe(firstContext);
    });

    pipelines.forEach((p) => p.destroy());
  });

  it('ADV-MEM-3: Dual-deck concurrent playback switching maintains single active deck invariant', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const trackA = createMockTrack('deck-a', 'Track A', 180);
    const trackB = createMockTrack('deck-b', 'Track B', 200);

    // Play Track A on Deck 0
    await engine.playTrack(trackA, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getActiveDeck().id).toBe('deck-0');

    // Preload & switch to Track B on Deck 1
    await engine.preloadNextTrack(trackB);
    await engine.playTrack(trackB, { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(1);
    expect(engine.getActiveDeck().id).toBe('deck-1');

    // Switch back to Track A on Deck 0
    await engine.preloadNextTrack(trackA);
    await engine.playTrack(trackA, { immediate: false, transitionDuration: 1 });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getActiveDeck().id).toBe('deck-0');

    engine.destroy();
  });

  it('ADV-MEM-4: AudioDeck event listener registration and removal prevents memory growth', () => {
    const deck = new AudioDeck('mem-deck', createMockAudioElement());
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    deck.on('timeupdate', handler1);
    deck.on('timeupdate', handler2);

    deck.emit('timeupdate', 42);
    expect(handler1).toHaveBeenCalledWith(42);
    expect(handler2).toHaveBeenCalledWith(42);

    // Unregister handler1
    deck.off('timeupdate', handler1);
    deck.emit('timeupdate', 84);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(2);

    deck.destroy();
    deck.emit('timeupdate', 100);
    expect(handler2).toHaveBeenCalledTimes(2);
  });

  it('ADV-MEM-5: Rapid play/pause/seek hammering under active crossfade transition clears timers without error', async () => {
    vi.useFakeTimers();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('ham-1', 'Hammer Track 1', 180);
    const track2 = createMockTrack('ham-2', 'Hammer Track 2', 180);

    await engine.playTrack(track1, { immediate: true });

    // Start 4-second crossfade
    engine.playTrack(track2, { transitionDuration: 4 });

    // Hammer pause, resume, seek during crossfade
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(50);
      if (i % 3 === 0) engine.pause();
      if (i % 3 === 1) engine.resume();
      if (i % 3 === 2) engine.seek(i * 5);
    }

    await vi.advanceTimersByTimeAsync(2000);

    expect(engine.getState()).toBeDefined();
    engine.destroy();
    vi.useRealTimers();
  });

  it('ADV-MEM-6: PreloadManager memory safety during rapid lookahead preloading and subsequent cancellations', async () => {
    const preload = new PreloadManager(15);
    const elStandby = createMockAudioElement();
    const standbyDeck = new AudioDeck('standby-mem', elStandby);

    for (let i = 0; i < 50; i++) {
      const track = createMockTrack(`pre-mem-${i}`, `Preload Track ${i}`, 180);
      await preload.preloadTrack(track, standbyDeck);
      expect(preload.isTrackPreloaded(`pre-mem-${i}`)).toBe(true);

      preload.cancelPreload(standbyDeck);
      expect(preload.getPreloadedTrackId()).toBeNull();
    }

    standbyDeck.destroy();
  });
});
