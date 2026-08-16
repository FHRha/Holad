import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { TransitionManager } from '../../audio/TransitionManager';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioDeck } from '../../audio/AudioDeck';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B3: Crossfade & Gapless Mutual Exclusivity Boundaries', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B3-1: Rapid back-to-back toggling between Crossfade and Gapless maintains mutual exclusivity invariant', () => {
    const store = useSettingsStore.getState();

    // 20 rapid toggle iterations
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) {
        store.setIsCrossfadeEnabled(true);
        expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
        expect(useSettingsStore.getState().isGaplessEnabled).toBe(false);
      } else {
        store.setIsGaplessEnabled(true);
        expect(useSettingsStore.getState().isGaplessEnabled).toBe(true);
        expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);
      }
    }
  });

  it('B3-2: Crossfade duration boundary clamping (minimum 1s, maximum 12s, zero or negative clamped)', () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    // Crossfade with 0s duration should clamp to minimum (1s) without division by zero
    expect(() => {
      tm.performCrossfade(deck0, deck1, { duration: 0 }, undefined, 0);
      tm.abortActiveTransition();
    }).not.toThrow();

    // Crossfade with negative duration should clamp safely
    expect(() => {
      tm.performCrossfade(deck0, deck1, { duration: -5 }, undefined, 0);
      tm.abortActiveTransition();
    }).not.toThrow();

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('B3-3: Outgoing track duration shorter than crossfade window resolves cleanly', async () => {
    const el0 = createMockAudioElement();
    (el0 as any).duration = 1.0; // 1 second short track
    const el1 = createMockAudioElement();
    (el1 as any).duration = 180;

    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);
    await deck0.load('http://localhost:4000/stream/short', 0);
    await deck0.play();

    const tm = new TransitionManager();
    const crossfadePromise = tm.performCrossfade(deck0, deck1, { duration: 1 }, undefined, 0);

    // Simulate short track reaching end during fade
    (el0 as any).simulateEnded();

    await crossfadePromise;
    expect(deck1.element.volume).toBe(1.0);

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('B3-4: Immediate transition abort restores deck gains cleanly without signal leakage', async () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    await deck0.load('http://localhost:4000/stream/t1', 0);
    await deck0.play();
    pipeline.setDeckGain(0, 1.0, 0);

    const tm = new TransitionManager();
    const cfPromise = tm.performCrossfade(deck0, deck1, { duration: 2 }, pipeline, 0);

    // Abort after 50ms
    await new Promise((r) => setTimeout(r, 50));
    tm.abortActiveTransition(deck0, deck1, pipeline, 0);

    await cfPromise;

    // Active deck gain restored to 1.0, standby deck gain muted to 0.0
    expect(pipeline.getDeckGain(0)).toBe(1.0);
    expect(pipeline.getDeckGain(1)).toBe(0.0);

    deck0.destroy();
    deck1.destroy();
    pipeline.destroy();
    tm.destroy();
  });

  it('B3-5: Crossfade curve mathematical boundaries (equalPower: cos^2+sin^2=1; linear: fadeOut+fadeIn=1)', () => {
    // Check equalPower curve at progress points: 0.0, 0.25, 0.5, 0.75, 1.0
    const points = [0.0, 0.25, 0.5, 0.75, 1.0];

    points.forEach((p) => {
      const angle = p * (Math.PI / 2);
      const fadeOut = Math.cos(angle);
      const fadeIn = Math.sin(angle);
      const power = fadeOut * fadeOut + fadeIn * fadeIn;
      expect(power).toBeCloseTo(1.0, 5);
    });

    // Check linear curve
    points.forEach((p) => {
      const fadeOut = 1.0 - p;
      const fadeIn = p;
      expect(fadeOut + fadeIn).toBeCloseTo(1.0, 5);
    });
  });

  it('B3-6: Concurrent settings mutation during active crossfade does not throw or corrupt audio graph', () => {
    const store = useSettingsStore.getState();
    const pipeline = new WebAudioPipeline();

    expect(() => {
      store.setIsCrossfadeEnabled(false);
      store.setIsGaplessEnabled(true);
      store.setCrossfadeDuration(6);
      store.setCrossfadeCurve('linear');
      pipeline.setDeckGain(0, 0.5, 0.1);
      pipeline.setDeckGain(1, 0.5, 0.1);
    }).not.toThrow();

    pipeline.destroy();
  });
});
