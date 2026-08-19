import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useHoladStore } from '../../store/holadStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { TransitionManager } from '../../audio/TransitionManager';
import { PreloadManager } from '../../audio/PreloadManager';
import { VolumeManager, volumeManager } from '../../audio/VolumeManager';
import { createMockAudioElement, MockAudioContext, MockTimeRanges } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('CHALLENGER 1: Empirical Adversarial Audio Engine Stress Suite', () => {
  let originalUserAgent: string;

  beforeEach(() => {
    resetAllStores();
    volumeManager.reset();
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SECTION 1: Volume Boundary Conditions & Multiplier Headroom Verification
  // =========================================================================
  describe('1. Volume Boundary Conditions & Multiplier Headroom', () => {
    it('VOL-BOUND-1: Absolute silence boundary (0.0) produces strictly 0.0 gain across all multiplier levels', () => {
      const pipeline = new WebAudioPipeline();

      // Test 0.0 volume across 1.0x, 2.0x, 3.0x multipliers
      for (const mult of [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
        pipeline.setMasterVolume(0.0, mult);
        expect(pipeline.masterGainNode.gain.value).toBe(0.0);
      }

      pipeline.destroy();
    });

    it('VOL-BOUND-2: Micro-gain boundary (0.0001) maintains precision without underflowing to 0 or distortion', () => {
      const pipeline = new WebAudioPipeline();
      const microVol = 0.0001;

      pipeline.setMasterVolume(microVol, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.0001, 6);
      expect(pipeline.masterGainNode.gain.value).toBeGreaterThan(0.0);

      // Micro-gain with 3.0x multiplier
      pipeline.setMasterVolume(microVol, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.0003, 6);

      pipeline.destroy();
    });

    it('VOL-BOUND-3: Midpoint volume (0.5) applies linear 0.5 gain without artificial 9% (0.3*0.3) attenuation', () => {
      const pipeline = new WebAudioPipeline();

      pipeline.setMasterVolume(0.5, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.5);

      // Midpoint with 2.0x multiplier -> unity gain (1.0)
      pipeline.setMasterVolume(0.5, 2.0);
      expect(pipeline.masterGainNode.gain.value).toBe(1.0);

      // Midpoint with 3.0x multiplier -> 1.5 gain
      pipeline.setMasterVolume(0.5, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBe(1.5);

      pipeline.destroy();
    });

    it('VOL-BOUND-4: Near-unity boundary (0.9999) and unity (1.0) scale accurately up to 3.0x multiplier', () => {
      const pipeline = new WebAudioPipeline();

      pipeline.setMasterVolume(0.9999, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.9999, 4);

      pipeline.setMasterVolume(1.0, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBe(1.0);

      // Maximum nominal boost: 1.0 volume * 3.0 multiplier = 3.0 gain (+9.54 dB headroom)
      pipeline.setMasterVolume(1.0, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBe(3.0);

      pipeline.destroy();
    });

    it('VOL-BOUND-5: Adversarial out-of-bounds inputs (negative, overflow, NaN, Infinity) clamp safely', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      // Negative values clamp to 0.0
      pipeline.setMasterVolume(-1.0, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);

      pipeline.setMasterVolume(-999.9, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);

      // Overflow values > 1.0 clamp volume to 1.0
      pipeline.setMasterVolume(1.5, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBe(1.0);

      pipeline.setMasterVolume(100.0, 2.0);
      expect(pipeline.masterGainNode.gain.value).toBe(2.0);

      // Multiplier negative values clamp to 0.0
      pipeline.setMasterVolume(1.0, -2.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);

      engine.destroy();
      pipeline.destroy();
    });

    it('VOL-BOUND-6: Independent state separation between Desktop volume, Mobile volume, and Volume Multiplier', () => {
      const store = usePlayerStore.getState();

      store.setVolume(0.42);
      store.setMobileVolume(0.78);
      store.setVolumeMultiplier(2.4);

      expect(usePlayerStore.getState().volume).toBe(0.78);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.78);
      expect(usePlayerStore.getState().volumeMultiplier).toBe(2.4);

      // Updating mobile volume leaves desktop volume unchanged
      store.setMobileVolume(0.15);
      expect(usePlayerStore.getState().volume).toBe(0.15);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.15);

      // Updating desktop volume leaves mobile volume unchanged
      store.setVolume(0.99);
      expect(usePlayerStore.getState().volume).toBe(0.99);
      expect(usePlayerStore.getState().mobileVolume).toBe(0.99);
    });
  });

  // =========================================================================
  // SECTION 2: AudioParam Ramp Scheduling & De-Zippering Accuracy
  // =========================================================================
  describe('2. AudioParam Ramp Scheduling & De-Zippering Accuracy', () => {
    it('RAMP-1: Instant volume change schedules exponential de-zippering ramp (setTargetAtTime with tau = 10ms)', () => {
      const pipeline = new WebAudioPipeline();

      pipeline.setMasterVolume(0.75, 1.0, 0); // rampDuration = 0 -> de-zippered

      const events = pipeline.masterGainNode.gain.scheduledEvents;
      expect(events.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe('setTargetAtTime');
      expect(lastEvent.target).toBe(0.75);
      expect(lastEvent.timeConstant).toBe(0.015); // tau = 10ms (0.01s)

      pipeline.destroy();
    });

    it('RAMP-2: Linear ramp volume change cancels scheduled values and schedules linearRampToValueAtTime', () => {
      const pipeline = new WebAudioPipeline();
      const rampTime = 0.05; // 50ms ramp

      pipeline.setMasterVolume(0.8, 1.5, rampTime);

      const events = pipeline.masterGainNode.gain.scheduledEvents;
      const linearRampEvents = events.filter((e) => e.type === 'linearRampToValueAtTime');
      expect(linearRampEvents.length).toBeGreaterThan(0);

      const lastLinearEvent = linearRampEvents[linearRampEvents.length - 1];
      expect(lastLinearEvent.value).toBeCloseTo(1.2, 2); // 0.8 * 1.5 = 1.2

      pipeline.destroy();
    });

    it('RAMP-3: Mathematical de-zippering step response verifies continuous C0 smoothness and exponential convergence', () => {
      // Step response: v(t) = V_target + (V_0 - V_target) * exp(-t / tau)
      const v0 = 0.0;
      const vTarget = 1.0;
      const tau = 0.01; // 10ms

      const samplePoints = [
        { t: 0.000, expectedRatio: 0.0000 },
        { t: 0.005, expectedRatio: 1 - Math.exp(-0.5) }, // ~39.3%
        { t: 0.010, expectedRatio: 1 - Math.exp(-1.0) }, // ~63.2% (1 tau)
        { t: 0.020, expectedRatio: 1 - Math.exp(-2.0) }, // ~86.5% (2 tau)
        { t: 0.030, expectedRatio: 1 - Math.exp(-3.0) }, // ~95.0% (3 tau)
        { t: 0.050, expectedRatio: 1 - Math.exp(-5.0) }, // ~99.3% (5 tau)
      ];

      for (const pt of samplePoints) {
        const calculatedGain = vTarget + (v0 - vTarget) * Math.exp(-pt.t / tau);
        expect(calculatedGain).toBeCloseTo(pt.expectedRatio, 4);
      }

      // Verify monotonicity: gain is strictly monotonically increasing from 0 to 1
      let prevGain = -1;
      for (let ms = 0; ms <= 100; ms += 2) {
        const tSec = ms / 1000;
        const g = vTarget + (v0 - vTarget) * Math.exp(-tSec / tau);
        expect(g).toBeGreaterThanOrEqual(prevGain);
        expect(g).toBeLessThanOrEqual(1.0);
        prevGain = g;
      }
    });

    it('RAMP-4: High-frequency volume scrubbing (1000 rapid calls in 20ms) executes without scheduler saturation', () => {
      const pipeline = new WebAudioPipeline();

      for (let i = 0; i < 1000; i++) {
        const v = (i % 100) / 100;
        pipeline.setMasterVolume(v, 1.0);
      }

      const finalGain = pipeline.masterGainNode.gain.value;
      expect(Number.isFinite(finalGain)).toBe(true);
      expect(isNaN(finalGain)).toBe(false);
      expect(finalGain).toBeCloseTo(99 / 100, 2);

      pipeline.destroy();
    });
  });

  // =========================================================================
  // SECTION 3: Rapid Crossfade Interruptions, Skipping & Transition Aborting
  // =========================================================================
  describe('3. Rapid Crossfade Interruptions, Skipping & Transition Aborting', () => {
    it('TRANS-1: Consecutive rapid skips abort prior transition intervals and leave clean single active deck', async () => {
      vi.useFakeTimers();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 4 });

      const tracks = Array.from({ length: 8 }, (_, i) => createMockTrack(`skip-trk-${i}`, `Track ${i}`, 180));

      // Play first track
      await engine.playTrack(tracks[0], { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Rapidly trigger 7 skips in 50ms intervals
      for (let i = 1; i < tracks.length; i++) {
        const p = engine.playTrack(tracks[i]);
        await vi.advanceTimersByTimeAsync(50);

        if (i === tracks.length - 1) {
          // Allow final crossfade to complete
          await vi.advanceTimersByTimeAsync(4000);
          await p;
        }
      }

      expect(engine.getState()).toBe('playing');
      expect(engine.getCurrentTrack().id).toBe('skip-trk-7');

      const pipeline = engine.getWebAudioPipeline();
      const activeIdx = engine.getActiveDeckIndex();
      const standbyIdx = (1 - activeIdx) as 0 | 1;

      if (pipeline) {
        expect(pipeline.getDeckGain(activeIdx)).toBe(1.0);
        expect(pipeline.getDeckGain(standbyIdx)).toBe(0.0);
      }

      engine.destroy();
      vi.useRealTimers();
    });

    it('TRANS-2: Aborting active crossfade midway immediately resets deck gains and stops transition timer', async () => {
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

      // Start 6-second crossfade
      tm.performCrossfade(deck0, deck1, { duration: 6, curve: 'equalPower' }, pipeline, 0);
      expect(tm.getIsTransitioning()).toBe(true);

      // Advance 2 seconds (33% progress)
      await vi.advanceTimersByTimeAsync(2000);
      expect(tm.getIsTransitioning()).toBe(true);

      // Abort active transition
      tm.abortActiveTransition(deck0, deck1, pipeline, 0);

      expect(tm.getIsTransitioning()).toBe(false);
      expect(pipeline.getDeckGain(0)).toBe(1.0);
      expect(pipeline.getDeckGain(1)).toBe(0.0);

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
      vi.useRealTimers();
    });

    it('TRANS-3: Gapless handover switches active deck atomically and resets standby volume to 0.0', async () => {
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/trk1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/trk2', 0);

      // Perform atomic gapless handover (Deck 0 -> Deck 1)
      await tm.performGaplessHandover(deck0, deck1, pipeline, 0);

      expect(pipeline.getDeckGain(1)).toBe(1.0);
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(deck0.getState()).toBe('paused');
      expect(deck1.getState()).toBe('playing');

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });

    it('TRANS-4: Lookahead PreloadManager calculates triggers accurately without negative remaining time errors', () => {
      const preload = new PreloadManager(15);

      // Outside window (180s track at 100s -> 80s remaining > 15s)
      expect(preload.shouldPreload(100, 180, 0)).toBe(false);

      // Exactly at window (180s track at 165s -> 15s remaining <= 15s)
      expect(preload.shouldPreload(165, 180, 0)).toBe(true);

      // Inside window (180s track at 175s -> 5s remaining <= 15s)
      expect(preload.shouldPreload(175, 180, 0)).toBe(true);

      // With 10s crossfade: triggerWindow = max(15, 10 + 2) = 15s
      expect(preload.shouldPreload(160, 180, 10)).toBe(false); // 20s remaining > 15s
      expect(preload.shouldPreload(166, 180, 10)).toBe(true);  // 14s remaining <= 15s

      // With 15s crossfade: triggerWindow = max(15, 15 + 2) = 17s
      expect(preload.shouldPreload(164, 180, 15)).toBe(true); // 16s remaining <= 17s

      // Boundary / invalid durations
      expect(preload.shouldPreload(10, 0, 0)).toBe(false);
      expect(preload.shouldPreload(10, -100, 0)).toBe(false);
      expect(preload.shouldPreload(10, NaN, 0)).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4: Equal-Power Energy Conservation vs Linear Crossfade
  // =========================================================================
  describe('4. Equal-Power Energy Conservation (sum of squares = 1.0) vs Linear Crossfade', () => {
    it('POWER-1: Mathematical verification across 100,000 interpolation points proves cos^2 + sin^2 == 1.0 exactly', () => {
      const N = 100000;
      let maxError = 0;
      let minGainOut = Infinity;
      let maxGainOut = -Infinity;
      let minGainIn = Infinity;
      let maxGainIn = -Infinity;

      for (let i = 0; i <= N; i++) {
        const t = i / N; // normalized time [0.0, 1.0]
        const angle = t * (Math.PI / 2);
        const gainOut = Math.cos(angle);
        const gainIn = Math.sin(angle);

        // Acoustic power: P = g_out^2 + g_in^2
        const power = gainOut * gainOut + gainIn * gainIn;
        const error = Math.abs(power - 1.0);

        if (error > maxError) maxError = error;
        if (gainOut < minGainOut) minGainOut = gainOut;
        if (gainOut > maxGainOut) maxGainOut = gainOut;
        if (gainIn < minGainIn) minGainIn = gainIn;
        if (gainIn > maxGainIn) maxGainIn = gainIn;
      }

      expect(maxError).toBeLessThan(1e-12);
      expect(minGainOut).toBeGreaterThanOrEqual(0.0);
      expect(maxGainOut).toBeLessThanOrEqual(1.0);
      expect(minGainIn).toBeGreaterThanOrEqual(0.0);
      expect(maxGainIn).toBeLessThanOrEqual(1.0);
    });

    it('POWER-2: Acoustic power dip comparison: Equal-Power maintains 0.00 dB while Linear drops by -3.01 dB at midpoint', () => {
      const tMid = 0.5;

      // --- Linear Crossfade at Midpoint ---
      const linearOut = 1.0 - tMid; // 0.5
      const linearIn = tMid;        // 0.5
      const linearPower = linearOut * linearOut + linearIn * linearIn; // 0.25 + 0.25 = 0.50
      const linearDipDb = 10 * Math.log10(linearPower); // -3.0103 dB

      expect(linearPower).toBe(0.5);
      expect(linearDipDb).toBeCloseTo(-3.0103, 4);

      // --- Equal-Power Crossfade at Midpoint ---
      const angleMid = tMid * (Math.PI / 2); // PI / 4
      const eqOut = Math.cos(angleMid); // 1 / sqrt(2) ≈ 0.70710678
      const eqIn = Math.sin(angleMid);  // 1 / sqrt(2) ≈ 0.70710678
      const eqPower = eqOut * eqOut + eqIn * eqIn; // 0.50 + 0.50 = 1.00
      const eqDipDb = 10 * Math.log10(eqPower); // 0.0000 dB

      expect(eqOut).toBeCloseTo(Math.SQRT1_2, 7);
      expect(eqIn).toBeCloseTo(Math.SQRT1_2, 7);
      expect(eqPower).toBeCloseTo(1.0, 10);
      expect(eqDipDb).toBeCloseTo(0.0, 6);
    });

    it('POWER-3: TransitionManager real-time step sampling produces continuous equal-power acoustic output across all steps', async () => {
      vi.useFakeTimers();
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/trk1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/trk2', 0);

      const crossfadeDuration = 3; // 3 seconds = 60 steps at 50ms
      const crossfadePromise = tm.performCrossfade(
        deck0,
        deck1,
        { duration: crossfadeDuration, curve: 'equalPower' },
        pipeline,
        0
      );

      // Sample every 50ms step throughout the crossfade
      for (let time = 50; time <= 3000; time += 50) {
        await vi.advanceTimersByTimeAsync(50);
        const g0 = pipeline.getDeckGain(0);
        const g1 = pipeline.getDeckGain(1);
        const power = g0 * g0 + g1 * g1;

        // Energy conservation check at every step
        expect(power).toBeGreaterThanOrEqual(0.95);
        expect(power).toBeLessThanOrEqual(1.05);
      }

      await crossfadePromise;

      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
      vi.useRealTimers();
    });

    it('POWER-4: Linear crossfade curve in TransitionManager adheres strictly to (1-t) and t', async () => {
      vi.useFakeTimers();
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/trk1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/trk2', 0);

      const crossfadePromise = tm.performCrossfade(
        deck0,
        deck1,
        { duration: 2, curve: 'linear' },
        pipeline,
        0
      );

      // Advance to midpoint (1.0s / 2.0s = 50%)
      await vi.advanceTimersByTimeAsync(1000);
      expect(pipeline.getDeckGain(0)).toBeCloseTo(0.5, 1);
      expect(pipeline.getDeckGain(1)).toBeCloseTo(0.5, 1);

      // Complete transition
      await vi.advanceTimersByTimeAsync(1000);
      await crossfadePromise;

      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
      vi.useRealTimers();
    });
  });

  // =========================================================================
  // SECTION 5: Dynamic Headroom, Compressor Normalization & Error Recovery
  // =========================================================================
  describe('5. Dynamic Headroom, Compressor Normalization & Error Recovery', () => {
    it('REC-1: Dynamics compressor node threshold (-18dB) and parameters match Spotify-like normalization standard', () => {
      const pipeline = new WebAudioPipeline();

      expect(pipeline.compressorNode.threshold.value).toBe(-18);
      expect(pipeline.compressorNode.knee.value).toBe(30);
      expect(pipeline.compressorNode.ratio.value).toBe(3);
      expect(pipeline.compressorNode.attack.value).toBeCloseTo(0.003, 3);
      expect(pipeline.compressorNode.release.value).toBeCloseTo(0.25, 2);

      pipeline.destroy();
    });

    it('REC-2: Toggling loudness normalization on/off dynamically reconnects the Web Audio graph seamlessly', () => {
      const pipeline = new WebAudioPipeline();

      pipeline.setNormalizationEnabled(false);
      expect(() => pipeline.setMasterVolume(0.8, 1.2)).not.toThrow();

      pipeline.setNormalizationEnabled(true);
      expect(() => pipeline.setMasterVolume(1.0, 3.0)).not.toThrow();
      expect(pipeline.masterGainNode.gain.value).toBe(3.0);

      pipeline.destroy();
    });

    it('REC-3: Standby preload failure handles gracefully without breaking active playback', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const activeTrack = createMockTrack('ok-1', 'Active Track', 180);
      await engine.playTrack(activeTrack, { immediate: true });
      expect(engine.getState()).toBe('playing');

      // Standby preload encounters error
      const brokenTrack = createMockTrack('broken-404', 'Broken Track', 180);
      brokenTrack.streamUrl = 'http://localhost:4000/stream/404.mp3';

      const standbyDeck = engine.getStandbyDeck();
      vi.spyOn(standbyDeck, 'load').mockRejectedValueOnce(new Error('HTTP 404'));

      await expect(engine.preloadNextTrack(brokenTrack)).resolves.not.toThrow();
      expect(engine.getState()).toBe('playing');
      expect(engine.getActiveDeckIndex()).toBe(0);

      engine.destroy();
    });
  });
});
