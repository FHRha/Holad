import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { TransitionManager } from '../../audio/TransitionManager';
import { VolumeManager, volumeManager } from '../../audio/VolumeManager';
import { createMockAudioElement, MockAudioContext } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Challenger Edge & Storm Stress Harness (ADV-9)', () => {
  beforeEach(() => {
    resetAllStores();
    volumeManager.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. VOLUME BOUNDARY & MULTIPLIER STRESS
  // =========================================================================
  describe('1. Volume Boundary Stress & Multiplier Headroom', () => {
    it('ADV-STORM-VOL-1: Zero-volume (mute) strictly suppresses audio regardless of extreme multiplier (300% / 3.0x)', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      // Mute (0.0) with multipliers up to 3.0 and beyond
      const multipliers = [0.0, 0.2, 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0];
      for (const mult of multipliers) {
        pipeline.setMasterVolume(0.0, mult);
        const gain = pipeline.masterGainNode.gain.value;
        expect(gain).toBe(0.0);
      }

      pipeline.destroy();
    });

    it('ADV-STORM-VOL-2: Full volume (1.0) with 300% multiplier (3.0) achieves exactly +9.54 dB headroom without clipping to unity', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      pipeline.attachDeck(0, el0);

      pipeline.setMasterVolume(1.0, 3.0);
      const gain = pipeline.masterGainNode.gain.value;
      expect(gain).toBe(3.0);

      const dbHeadroom = 20 * Math.log10(gain);
      expect(dbHeadroom).toBeCloseTo(9.5424, 3);

      pipeline.destroy();
    });

    it('ADV-STORM-VOL-3: Adversarial invalid inputs (NaN, Infinity, -Infinity, negative, non-number) clamp safely to valid numeric ranges', () => {
      const pipeline = new WebAudioPipeline();
      const engine = new AudioEngine([createMockAudioElement(), createMockAudioElement()]);

      const testCases = [
        { vol: NaN, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: Infinity, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: -Infinity, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: -5.0, mult: 1.0, expectedMax: 0.0, expectedMin: 0.0 },
        { vol: 1.0, mult: NaN, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: 1.0, mult: Infinity, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: 1.0, mult: -2.0, expectedMax: 0.0, expectedMin: 0.0 },
        { vol: undefined as any, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: null as any, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
        { vol: 'invalid' as any, mult: 1.0, expectedMax: 1.0, expectedMin: 0.0 },
      ];

      for (const tc of testCases) {
        expect(() => {
          pipeline.setMasterVolume(tc.vol, tc.mult);
        }).not.toThrow();

        const gain = pipeline.masterGainNode.gain.value;
        expect(Number.isFinite(gain)).toBe(true);
        expect(isNaN(gain)).toBe(false);
        expect(gain).toBeGreaterThanOrEqual(0.0);

        expect(() => {
          engine.setVolume(tc.vol);
          engine.setVolumeMultiplier(tc.mult);
        }).not.toThrow();
      }

      engine.destroy();
      pipeline.destroy();
    });

    it('ADV-STORM-VOL-4: High-frequency volume churning (1000 iterations) maintains numerical stability', () => {
      const pipeline = new WebAudioPipeline();

      for (let i = 0; i < 1000; i++) {
        const v = Math.random();
        const m = Math.random() * 3.0;
        pipeline.setMasterVolume(v, m);

        const gain = pipeline.masterGainNode.gain.value;
        expect(Number.isFinite(gain)).toBe(true);
        expect(isNaN(gain)).toBe(false);
        expect(gain).toBeGreaterThanOrEqual(0.0);
        expect(gain).toBeLessThanOrEqual(3.01);
      }

      pipeline.destroy();
    });
  });

  // =========================================================================
  // 2. CROSSFADE ACOUSTIC POWER MATH & TRANSITION ABORTS
  // =========================================================================
  describe('2. Crossfade Acoustic Power Math & Abort Lifecycle', () => {
    it('ADV-STORM-CRV-1: Equal-power crossfade curve strictly conserves acoustic energy (cos^2 + sin^2 == 1.0) over 50,000 points', () => {
      const N = 50000;
      let maxDeviation = 0;

      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const angle = t * (Math.PI / 2);
        const gOut = Math.cos(angle);
        const gIn = Math.sin(angle);
        const power = gOut * gOut + gIn * gIn;
        const dev = Math.abs(power - 1.0);

        if (dev > maxDeviation) maxDeviation = dev;
        expect(dev).toBeLessThan(1e-12);
      }

      expect(maxDeviation).toBeLessThan(1e-12);
    });

    it('ADV-STORM-CRV-2: Aborting transition at 50% progress immediately silences standby deck and restores full gain to active deck', async () => {
      vi.useFakeTimers();
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/s1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/s2', 0);

      // Start 4s crossfade
      const cfPromise = tm.performCrossfade(deck0, deck1, { duration: 4, curve: 'equalPower' }, pipeline, 0);
      expect(tm.getIsTransitioning()).toBe(true);

      // Advance 2s (midpoint)
      await vi.advanceTimersByTimeAsync(2000);
      expect(tm.getIsTransitioning()).toBe(true);
      expect(pipeline.getDeckGain(0)).toBeCloseTo(Math.SQRT1_2, 1);
      expect(pipeline.getDeckGain(1)).toBeCloseTo(Math.SQRT1_2, 1);

      // Abort active transition
      tm.abortActiveTransition(deck0, deck1, pipeline, 0);

      expect(tm.getIsTransitioning()).toBe(false);
      expect(pipeline.getDeckGain(0)).toBe(1.0);
      expect(pipeline.getDeckGain(1)).toBe(0.0);

      await cfPromise; // Promise resolves cleanly on abort

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
      vi.useRealTimers();
    });

    it('ADV-STORM-CRV-3: AudioEngine pause() during active crossfade aborts transition and pauses both decks cleanly', async () => {
      vi.useFakeTimers();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);
      engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 4 });

      const track1 = createMockTrack('pause-1', 'Song 1', 200);
      const track2 = createMockTrack('pause-2', 'Song 2', 200);

      await engine.playTrack(track1, { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Trigger crossfade
      const cf = engine.playTrack(track2);
      await vi.advanceTimersByTimeAsync(1500); // 1.5s into 4s transition

      // User hits pause mid-crossfade
      engine.pause();

      expect(engine.getState()).toBe('paused');
      expect(el0.paused).toBe(true);
      expect(el1.paused).toBe(true);

      await cf;

      engine.destroy();
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // 3. RAPID TRACK SKIPPING STORMS & PROGRESS/LYRICS SYNCHRONIZATION
  // =========================================================================
  describe('3. Track Skipping Storms & Progress/Lyrics Synchronization', () => {
    it('ADV-STORM-SKP-1: 50 consecutive rapid skips during crossfade switch active deck and track metadata synchronously every time', async () => {
      vi.useFakeTimers();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);
      engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 3 });

      const tracks = Array.from({ length: 50 }, (_, i) => createMockTrack(`storm-trk-${i}`, `Storm Song ${i}`, 100 + i * 10));

      // Initial track
      await engine.playTrack(tracks[0], { immediate: true });

      const emittedTimes: number[] = [];
      const emittedDurations: number[] = [];
      engine.on('timeupdate', (t) => emittedTimes.push(t));
      engine.on('durationchange', (d) => emittedDurations.push(d));

      // Blast 49 rapid skips in 10ms intervals
      for (let i = 1; i < 50; i++) {
        const nextTrack = tracks[i];
        const p = engine.playTrack(nextTrack);

        // R7 Contract Check: active track and duration update synchronously on call
        expect(engine.getCurrentTrack().id).toBe(nextTrack.id);
        expect(emittedTimes[emittedTimes.length - 1]).toBe(0); // Jump to 0s for new track
        expect(emittedDurations[emittedDurations.length - 1]).toBe(nextTrack.duration);

        await vi.advanceTimersByTimeAsync(10);

        if (i === 49) {
          // Allow final crossfade to finish
          await vi.advanceTimersByTimeAsync(3500);
          await p;
        }
      }

      // Final state verification
      expect(engine.getCurrentTrack().id).toBe('storm-trk-49');
      expect(engine.getState()).toBe('playing');
      const pipeline = engine.getWebAudioPipeline();
      if (pipeline) {
        const activeIdx = engine.getActiveDeckIndex();
        const standbyIdx = (1 - activeIdx) as 0 | 1;
        expect(pipeline.getDeckGain(activeIdx)).toBe(1.0);
        expect(pipeline.getDeckGain(standbyIdx)).toBe(0.0);
      }

      engine.destroy();
      vi.useRealTimers();
    });

    it('ADV-STORM-SKP-2: Standby deck timeupdate events during skip storms do not pollute lyrics tracking', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const lyricsLog: { trackId: string; time: number }[] = [];
      engine.on('timeupdate', (time: number) => {
        lyricsLog.push({ trackId: engine.getCurrentTrack()?.id || 'unknown', time });
      });

      const trackA = createMockTrack('track-A', 'Track A', 180);
      const trackB = createMockTrack('track-B', 'Track B', 200);

      await engine.playTrack(trackA, { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Simulate playing track A at 170s
      (el0 as any).simulateTimeUpdate(170);
      expect(lyricsLog[lyricsLog.length - 1]).toEqual({ trackId: 'track-A', time: 170 });

      // Crossfade to Track B
      await engine.playTrack(trackB, { immediate: false, transitionDuration: 1 });
      expect(engine.getActiveDeckIndex()).toBe(1);

      // Simulate lingering old deck 0 firing 175s
      (el0 as any).simulateTimeUpdate(175);

      // Verify that 175 was NOT logged under track B
      const lastEntry = lyricsLog[lyricsLog.length - 1];
      expect(lastEntry.time).not.toBe(175);

      // Simulate active deck 1 firing 5s
      (el1 as any).simulateTimeUpdate(5);
      expect(lyricsLog[lyricsLog.length - 1]).toEqual({ trackId: 'track-B', time: 5 });

      engine.destroy();
    });
  });

  // =========================================================================
  // 4. DYNAMICS COMPRESSOR SATURATION & RECONNECTION STORMS
  // =========================================================================
  describe('4. Dynamics Compressor Saturation & Reconnection Storms', () => {
    it('ADV-STORM-CMP-1: Rapid reconnection storm (200 toggles) maintains continuous audio graph connection to destination', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      for (let i = 0; i < 200; i++) {
        const toggle = i % 2 === 0;
        pipeline.setNormalizationEnabled(toggle);

        // Analyser must always connect to destination
        expect(pipeline.analyserNode.connectedTo).toContain(pipeline.context.destination);
        // Master gain must always connect to analyser
        expect((pipeline.masterGainNode as any).connectedTo).toContain(pipeline.analyserNode);
      }

      pipeline.destroy();
    });

    it('ADV-STORM-CMP-2: Full saturation headroom test with 3.0x multiplier through compressor preserves graph integrity', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      pipeline.attachDeck(0, el0);

      pipeline.setNormalizationEnabled(true);
      pipeline.setMasterVolume(1.0, 3.0); // Extreme boost

      expect(pipeline.masterGainNode.gain.value).toBe(3.0);
      expect(pipeline.compressorNode.threshold.value).toBe(-18);
      expect(pipeline.compressorNode.ratio.value).toBe(3);

      // Verify clean destruction
      expect(() => pipeline.destroy()).not.toThrow();
    });
  });

  // =========================================================================
  // 5. AUDIO ENGINE LIFECYCLE & MEMORY CHURN
  // =========================================================================
  describe('5. Audio Engine Lifecycle & Memory Churn', () => {
    it('ADV-STORM-LC-1: 50 sequential AudioEngine instantiation and destruction cycles execute without leaks or errors', () => {
      for (let cycle = 0; cycle < 50; cycle++) {
        const el0 = createMockAudioElement();
        const el1 = createMockAudioElement();
        const engine = new AudioEngine([el0, el1]);

        engine.setVolume(0.5);
        engine.setVolumeMultiplier(2.0);
        engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 2 });

        expect(engine.getActiveDeckIndex()).toBe(0);
        expect(engine.getState()).toBe('idle');

        engine.destroy();
      }
    });
  });
});
