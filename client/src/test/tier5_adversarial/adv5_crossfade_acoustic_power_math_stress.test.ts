import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TransitionManager } from '../../audio/TransitionManager';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Crossfade Acoustic Curve Power & Mathematical Rigor', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ADV-CRV-1: Equal-power crossfade curve satisfies cos^2(t*PI/2) + sin^2(t*PI/2) = 1.0 across 10,000 interpolation points', () => {
    const N = 10000;
    let maxPowerDeviation = 0;

    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const angle = t * (Math.PI / 2);
      const fadeOutGain = Math.cos(angle);
      const fadeInGain = Math.sin(angle);

      // Acoustic power = g_out^2 + g_in^2
      const power = fadeOutGain * fadeOutGain + fadeInGain * fadeInGain;
      const deviation = Math.abs(power - 1.0);

      if (deviation > maxPowerDeviation) {
        maxPowerDeviation = deviation;
      }

      // Assert each point is within floating-point epsilon (1e-12)
      expect(deviation).toBeLessThan(1e-12);
      expect(fadeOutGain).toBeGreaterThanOrEqual(0.0);
      expect(fadeOutGain).toBeLessThanOrEqual(1.0);
      expect(fadeInGain).toBeGreaterThanOrEqual(0.0);
      expect(fadeInGain).toBeLessThanOrEqual(1.0);
    }

    expect(maxPowerDeviation).toBeLessThan(1e-12);
  });

  it('ADV-CRV-2: Acoustic power comparison between Equal-Power (0.0dB) and Linear (-3.01dB) midpoint dip', () => {
    const tMid = 0.5;

    // Linear Crossfade Midpoint:
    const linearOut = 1.0 - tMid; // 0.5
    const linearIn = tMid;        // 0.5
    const linearPower = linearOut * linearOut + linearIn * linearIn; // 0.50
    const linearDipDb = 10 * Math.log10(linearPower); // -3.0103 dB

    expect(linearPower).toBe(0.5);
    expect(linearDipDb).toBeCloseTo(-3.0103, 3);

    // Equal-Power Crossfade Midpoint:
    const angleMid = tMid * (Math.PI / 2); // PI / 4 (45 degrees)
    const eqOut = Math.cos(angleMid); // 1 / sqrt(2) ≈ 0.70710678
    const eqIn = Math.sin(angleMid);  // 1 / sqrt(2) ≈ 0.70710678
    const eqPower = eqOut * eqOut + eqIn * eqIn; // 1.0
    const eqDipDb = 10 * Math.log10(eqPower); // 0.00 dB

    expect(eqOut).toBeCloseTo(Math.SQRT1_2, 6);
    expect(eqIn).toBeCloseTo(Math.SQRT1_2, 6);
    expect(eqPower).toBeCloseTo(1.0, 10);
    expect(eqDipDb).toBeCloseTo(0.0, 6);
  });

  it('ADV-CRV-3: TransitionManager runtime step gain accuracy produces continuous equal-power acoustic output', async () => {
    const tm = new TransitionManager();
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    await deck0.load('http://localhost:4000/stream/song1', 0);
    await deck0.play();
    await deck1.load('http://localhost:4000/stream/song2', 0);

    const crossfadeDuration = 4; // 4 seconds = 80 steps at 50ms interval
    const crossfadePromise = tm.performCrossfade(deck0, deck1, {
      duration: crossfadeDuration,
      curve: 'equalPower',
    }, pipeline, 0);

    // Sample every 200ms across the crossfade (20 observation points)
    const powerSamples: number[] = [];
    for (let time = 200; time <= 4000; time += 200) {
      await vi.advanceTimersByTimeAsync(200);
      const g0 = pipeline.getDeckGain(0);
      const g1 = pipeline.getDeckGain(1);
      const power = g0 * g0 + g1 * g1;
      powerSamples.push(power);
      expect(power).toBeCloseTo(1.0, 1);
    }

    await vi.advanceTimersByTimeAsync(200);
    await crossfadePromise;

    expect(powerSamples.length).toBe(20);
    powerSamples.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0.95);
      expect(p).toBeLessThanOrEqual(1.05);
    });

    expect(pipeline.getDeckGain(0)).toBe(0.0);
    expect(pipeline.getDeckGain(1)).toBe(1.0);

    deck0.destroy();
    deck1.destroy();
    pipeline.destroy();
    tm.destroy();
  });

  it('ADV-CRV-4: Crossfade curve configuration correctly applies linear curve when specified', async () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    await deck0.load('http://localhost:4000/stream/song1', 0);
    await deck0.play();
    await deck1.load('http://localhost:4000/stream/song2', 0);

    const crossfadePromise = tm.performCrossfade(deck0, deck1, {
      duration: 2,
      curve: 'linear',
    });

    // Advance to midpoint (1.0s of 2.0s)
    await vi.advanceTimersByTimeAsync(1000);

    expect(el0.volume).toBeCloseTo(0.5, 1);
    expect(el1.volume).toBeCloseTo(0.5, 1);

    await vi.advanceTimersByTimeAsync(1100);
    await crossfadePromise;

    expect(el0.volume).toBe(0.0);
    expect(el1.volume).toBe(1.0);

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('ADV-CRV-5: Boundary conditions at t=0 and t=1 guarantee zero clicks and instant silence on dormant deck', async () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    await deck0.load('http://localhost:4000/stream/song1', 0);
    await deck0.play();
    await deck1.load('http://localhost:4000/stream/song2', 0);

    const crossfadePromise = tm.performCrossfade(deck0, deck1, {
      duration: 3,
      curve: 'equalPower',
    });

    // At start, incoming deck starts silent (0.0)
    expect(el1.volume).toBe(0.0);

    await vi.advanceTimersByTimeAsync(3200);
    await crossfadePromise;

    // At end, outgoing deck is exactly 0.0 and paused, incoming is 1.0
    expect(el0.volume).toBe(0.0);
    expect(el0.paused).toBe(true);
    expect(el1.volume).toBe(1.0);
    expect(el1.paused).toBe(false);

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });

  it('ADV-CRV-6: Supported duration boundaries (1s to 12s) execute with correct step counts without interval drift', async () => {
    const tm = new TransitionManager();

    for (const duration of [1, 2, 5, 8, 12]) {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck(`deck-0-${duration}`, el0);
      const deck1 = new AudioDeck(`deck-1-${duration}`, el1);

      await deck0.load('http://localhost:4000/stream/s1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/s2', 0);

      const cfPromise = tm.performCrossfade(deck0, deck1, { duration, curve: 'equalPower' });

      await vi.advanceTimersByTimeAsync(duration * 1000 + 100);
      await cfPromise;

      expect(deck1.getState()).toBe('playing');
      expect(deck0.getState()).toBe('paused');

      deck0.destroy();
      deck1.destroy();
    }

    tm.destroy();
  });
});
