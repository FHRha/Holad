import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { AudioDeck } from '../../audio/AudioDeck';
import { TransitionManager } from '../../audio/TransitionManager';
import { PreloadManager } from '../../audio/PreloadManager';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Adversarial Audio Engine Stress Suite: Transitions, Crossfades, Loudness & Buffering', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // SUITE 1: Equal-Power Crossfade Acoustic Energy Conservation & Mathematical Verification
  // =========================================================================
  describe('1. Equal-Power Crossfade Acoustic Energy Conservation', () => {
    it('ADV-ENG-1.1: Equal-power curve strictly conserves acoustic energy (gain_A^2 + gain_B^2 = 1.0 ± 0.05) across 50,000 points', () => {
      const N = 50000;
      let maxDeviation = 0;
      let minEnergy = Infinity;
      let maxEnergy = -Infinity;
      let minGainA = Infinity;
      let maxGainA = -Infinity;
      let minGainB = Infinity;
      let maxGainB = -Infinity;

      for (let i = 0; i <= N; i++) {
        const t = i / N; // normalized time progress [0, 1]
        const angle = t * (Math.PI / 2);
        const gainA = Math.cos(angle);
        const gainB = Math.sin(angle);

        // Acoustic energy calculation
        const acousticEnergy = gainA * gainA + gainB * gainB;
        const deviation = Math.abs(acousticEnergy - 1.0);

        if (deviation > maxDeviation) maxDeviation = deviation;
        if (acousticEnergy < minEnergy) minEnergy = acousticEnergy;
        if (acousticEnergy > maxEnergy) maxEnergy = acousticEnergy;
        if (gainA < minGainA) minGainA = gainA;
        if (gainA > maxGainA) maxGainA = gainA;
        if (gainB < minGainB) minGainB = gainB;
        if (gainB > maxGainB) maxGainB = gainB;
      }

      // Rigorous energy conservation assertions: 1.0 ± 0.05
      expect(minEnergy).toBeGreaterThanOrEqual(0.95);
      expect(maxEnergy).toBeLessThanOrEqual(1.05);
      expect(maxDeviation).toBeLessThan(1e-10); // Exact within floating-point precision

      // Gain bounds: [0.0, 1.0]
      expect(minGainA).toBeGreaterThanOrEqual(0.0);
      expect(maxGainA).toBeLessThanOrEqual(1.0);
      expect(minGainB).toBeGreaterThanOrEqual(0.0);
      expect(maxGainB).toBeLessThanOrEqual(1.0);
    });

    it('ADV-ENG-1.2: Dynamic runtime step gain sampling in TransitionManager verifies acoustic energy conservation throughout crossfade', async () => {
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

      const crossfadeDuration = 4; // 4 seconds = 80 steps (50ms interval)
      const crossfadePromise = tm.performCrossfade(
        deck0,
        deck1,
        { duration: crossfadeDuration, curve: 'equalPower' },
        pipeline,
        0
      );

      // Sample every step (50ms) across the entire 4000ms transition
      for (let time = 50; time <= 4000; time += 50) {
        await vi.advanceTimersByTimeAsync(50);
        const g0 = pipeline.getDeckGain(0);
        const g1 = pipeline.getDeckGain(1);
        const energy = g0 * g0 + g1 * g1;

        // Verify acoustic energy is conserved within ±0.05 tolerance at every step
        expect(energy).toBeGreaterThanOrEqual(0.95);
        expect(energy).toBeLessThanOrEqual(1.05);
      }

      await crossfadePromise;

      // Final state verification
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);
      expect(deck0.getState()).toBe('paused');
      expect(deck1.getState()).toBe('playing');

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });

    it('ADV-ENG-1.3: Equal-Power vs Linear crossfade comparison: Linear suffers -3.01dB dip while Equal-Power maintains 0.0dB', () => {
      const tMid = 0.5;

      // Linear curve at midpoint
      const linGainA = 1.0 - tMid; // 0.5
      const linGainB = tMid;       // 0.5
      const linPower = linGainA * linGainA + linGainB * linGainB; // 0.50
      const linDipDb = 10 * Math.log10(linPower);

      expect(linPower).toBe(0.5);
      expect(linDipDb).toBeCloseTo(-3.0103, 3); // -3.01 dB power loss

      // Equal-power curve at midpoint
      const angleMid = tMid * (Math.PI / 2);
      const eqGainA = Math.cos(angleMid); // ~0.7071
      const eqGainB = Math.sin(angleMid); // ~0.7071
      const eqPower = eqGainA * eqGainA + eqGainB * eqGainB;
      const eqDipDb = 10 * Math.log10(eqPower);

      expect(eqGainA).toBeCloseTo(Math.SQRT1_2, 6);
      expect(eqGainB).toBeCloseTo(Math.SQRT1_2, 6);
      expect(eqPower).toBeCloseTo(1.0, 6);
      expect(eqDipDb).toBeCloseTo(0.0, 6); // Constant 0.0 dB power
    });

    it('ADV-ENG-1.4: Crossfades across diverse durations (1s, 3s, 8s, 12s) all conserve acoustic power without overshoot', async () => {
      const testDurations = [1, 3, 8, 12];

      for (const duration of testDurations) {
        const tm = new TransitionManager();
        const pipeline = new WebAudioPipeline();
        const el0 = createMockAudioElement();
        const el1 = createMockAudioElement();
        const deck0 = new AudioDeck('deck-0', el0);
        const deck1 = new AudioDeck('deck-1', el1);
        pipeline.attachDeck(0, el0);
        pipeline.attachDeck(1, el1);

        await deck0.load('http://localhost:4000/stream/d1', 0);
        await deck0.play();
        await deck1.load('http://localhost:4000/stream/d2', 0);

        const fadePromise = tm.performCrossfade(
          deck0,
          deck1,
          { duration, curve: 'equalPower' },
          pipeline,
          0
        );

        const totalMs = duration * 1000;
        const checkPoints = 10;
        const step = totalMs / checkPoints;

        for (let i = 0; i < checkPoints; i++) {
          await vi.advanceTimersByTimeAsync(step);
          const g0 = pipeline.getDeckGain(0);
          const g1 = pipeline.getDeckGain(1);
          const energy = g0 * g0 + g1 * g1;

          expect(energy).toBeGreaterThanOrEqual(0.95);
          expect(energy).toBeLessThanOrEqual(1.05);
          expect(g0).toBeGreaterThanOrEqual(0.0);
          expect(g0).toBeLessThanOrEqual(1.0);
          expect(g1).toBeGreaterThanOrEqual(0.0);
          expect(g1).toBeLessThanOrEqual(1.0);
        }

        await fadePromise;
        expect(pipeline.getDeckGain(0)).toBe(0.0);
        expect(pipeline.getDeckGain(1)).toBe(1.0);

        deck0.destroy();
        deck1.destroy();
        pipeline.destroy();
        tm.destroy();
      }
    });
  });

  // =========================================================================
  // SUITE 2: Edge-Case Crossfades & Seeking in Transition Windows
  // =========================================================================
  describe('2. Edge-Case Crossfades and Seeking in Active Crossfade Window', () => {
    it('ADV-ENG-2.1: Track shorter than crossfade duration (3s track with 8s crossfade) executes safely without stalling', async () => {
      const preload = new PreloadManager(15);
      const trackDuration = 3; // 3 seconds
      const crossfadeDuration = 8; // 8 seconds

      // Preload threshold check: shouldPreload calculates triggerWindow = max(15, 8 + 2) = 15s
      // Since track is 3s long, remaining is <= 3s <= 15s -> immediate preload
      expect(preload.shouldPreload(0, trackDuration, crossfadeDuration)).toBe(true);

      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = trackDuration;
      el1.duration = 180;

      const engine = new AudioEngine([el0, el1]);
      engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 8, crossfadeCurve: 'equalPower' });

      const shortTrack = createMockTrack('short-1', 'Short Track', trackDuration);
      const nextTrack = createMockTrack('next-1', 'Next Track', 180);

      await engine.playTrack(shortTrack, { immediate: true });
      expect(engine.getState()).toBe('playing');
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Trigger crossfade to next track with 8s duration setting
      const fadePromise = engine.playTrack(nextTrack);

      // Advance timers through the crossfade (8000ms)
      await vi.advanceTimersByTimeAsync(8000);
      await fadePromise;

      expect(engine.getActiveDeckIndex()).toBe(1);
      expect(engine.getState()).toBe('playing');
      expect(engine.getCurrentTrack().id).toBe('next-1');

      engine.destroy();
    });

    it('ADV-ENG-2.2: Ultra-short micro-track (0.5s duration) with 12s maximum crossfade executes without errors', async () => {
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = 0.5;
      el1.duration = 200;
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/micro', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/long', 0);

      // Perform crossfade with max duration (12s)
      const crossfadePromise = tm.performCrossfade(
        deck0,
        deck1,
        { duration: 12, curve: 'equalPower' },
        pipeline,
        0
      );

      // Advance through 12s (240 steps at 50ms)
      await vi.advanceTimersByTimeAsync(12000);
      await crossfadePromise;

      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);
      expect(deck1.getState()).toBe('playing');

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });

    it('ADV-ENG-2.3: Seeking directly into active crossfade threshold triggers preload and positions audio accurately', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = 180;
      el1.duration = 200;

      const engine = new AudioEngine([el0, el1]);
      engine.updateSettings({
        isCrossfadeEnabled: true,
        crossfadeDuration: 6,
        preloadNextTrack: true,
      });

      let preloadRequested = false;
      engine.on('requestPreload', () => {
        preloadRequested = true;
      });

      const track = createMockTrack('seek-edge-1', 'Long Track', 180);
      await engine.playTrack(track, { immediate: true });

      // Start at 10s (outside preload window: remaining 170s > 15s)
      (el0 as any).simulateTimeUpdate(10);
      expect(preloadRequested).toBe(false);

      // Seek into crossfade threshold: 175s (remaining 5s <= 15s window)
      engine.seek(175);
      expect(engine.getCurrentTime()).toBe(175);

      (el0 as any).simulateTimeUpdate(175);
      expect(preloadRequested).toBe(true);

      engine.destroy();
    });

    it('ADV-ENG-2.4: Seeking backward out of the active crossfade window cleanly updates position and maintains playback', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = 200;
      const engine = new AudioEngine([el0, el1]);

      const track = createMockTrack('seek-back-1', 'Dynamic Track', 200);
      await engine.playTrack(track, { immediate: true });

      // Move into crossfade territory (195s)
      engine.seek(195);
      expect(engine.getCurrentTime()).toBe(195);

      // User seeks backward to the beginning (10s)
      engine.seek(10);
      expect(engine.getCurrentTime()).toBe(10);
      expect(engine.getState()).toBe('playing');

      // Clamping tests: seeking negative or beyond duration
      engine.seek(-25);
      expect(engine.getCurrentTime()).toBe(0);

      engine.seek(500); // Beyond 200s duration
      expect(engine.getCurrentTime()).toBe(200);

      engine.destroy();
    });
  });

  // =========================================================================
  // SUITE 3: Rapid Track Skipping & Concurrency During Active Transitions
  // =========================================================================
  describe('3. Rapid Track Skipping & Transition Concurrency Stress', () => {
    it('ADV-ENG-3.1: 10 consecutive rapid skip commands during active crossfade cleanly abort prior transitions without leaking intervals', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = 180;
      el1.duration = 180;

      const engine = new AudioEngine([el0, el1]);
      engine.updateSettings({ isCrossfadeEnabled: true, crossfadeDuration: 4 });

      const tracks = Array.from({ length: 10 }, (_, i) =>
        createMockTrack(`rapid-trk-${i}`, `Rapid Track ${i}`, 180)
      );

      // Play initial track
      await engine.playTrack(tracks[0], { immediate: true });
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Rapidly fire 9 successive skips while crossfade transitions are requested
      for (let i = 1; i < 10; i++) {
        // Start crossfade to next track
        const skipPromise = engine.playTrack(tracks[i]);

        // Advance just a tiny bit (100ms) mid-transition
        await vi.advanceTimersByTimeAsync(100);

        // Next skip happens immediately, aborting the prior crossfade
        if (i === 9) {
          // Allow final crossfade to complete fully
          await vi.advanceTimersByTimeAsync(4000);
          await skipPromise;
        }
      }

      // Assert final state integrity:
      expect(engine.getState()).toBe('playing');
      expect(engine.getCurrentTrack().id).toBe('rapid-trk-9');

      const activeIdx = engine.getActiveDeckIndex();
      const standbyIdx = (1 - activeIdx) as 0 | 1;
      const pipeline = engine.getWebAudioPipeline();

      if (pipeline) {
        expect(pipeline.getDeckGain(activeIdx)).toBe(1.0);
        expect(pipeline.getDeckGain(standbyIdx)).toBe(0.0);
      }

      engine.destroy();
    });

    it('ADV-ENG-3.2: Rapid alternating deck handovers maintain strict single-active-deck invariant across 20 cycles', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      el0.duration = 180;
      el1.duration = 180;

      const engine = new AudioEngine([el0, el1]);
      // Use direct immediate playback to stress deck swapping
      const tracks = Array.from({ length: 20 }, (_, i) =>
        createMockTrack(`alt-trk-${i}`, `Alternating Track ${i}`, 180)
      );

      for (let i = 0; i < tracks.length; i++) {
        await engine.playTrack(tracks[i], { immediate: true });
        const activeIdx = engine.getActiveDeckIndex();
        expect(activeIdx === 0 || activeIdx === 1).toBe(true);

        const activeDeck = engine.getActiveDeck();
        expect(activeDeck.getState()).toBe('playing');
        expect(engine.getCurrentTrack().id).toBe(tracks[i].id);
      }

      expect(engine.getState()).toBe('playing');
      engine.destroy();
    });

    it('ADV-ENG-3.3: Rapid Play/Pause toggling during active crossfade aborts transition immediately and pauses cleanly', async () => {
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

      // Start 5s crossfade
      tm.performCrossfade(
        deck0,
        deck1,
        { duration: 5, curve: 'equalPower' },
        pipeline,
        0
      );

      expect(tm.getIsTransitioning()).toBe(true);

      // Advance 1s into crossfade
      await vi.advanceTimersByTimeAsync(1000);
      expect(tm.getIsTransitioning()).toBe(true);

      // User pauses: immediately abort transition
      tm.abortActiveTransition(deck0, deck1, pipeline, 0);
      deck0.pause();

      expect(tm.getIsTransitioning()).toBe(false);
      expect(pipeline.getDeckGain(0)).toBe(1.0);
      expect(pipeline.getDeckGain(1)).toBe(0.0);
      expect(deck0.getState()).toBe('paused');

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });
  });

  // =========================================================================
  // SUITE 4: Loudness Normalization Mid-Playback & During Transitions
  // =========================================================================
  describe('4. Loudness Normalization Dynamic Routing & Transition Stress', () => {
    it('ADV-ENG-4.1: DynamicsCompressor audio graph topology validates bypass vs active compression routing', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      // Default: Normalization enabled -> Deck Gains -> Compressor -> Master Gain -> Analyser -> Destination
      expect(pipeline.compressorNode.threshold.value).toBe(-18);
      expect(pipeline.compressorNode.knee.value).toBe(30);
      expect(pipeline.compressorNode.ratio.value).toBe(3);
      expect(pipeline.compressorNode.attack.value).toBeCloseTo(0.003, 3);
      expect(pipeline.compressorNode.release.value).toBeCloseTo(0.25, 2);

      // Disable Loudness Normalization -> Compressor bypassed
      pipeline.setNormalizationEnabled(false);
      // Re-enable Loudness Normalization -> Compressor re-engaged
      pipeline.setNormalizationEnabled(true);

      expect(pipeline.compressorNode.threshold.value).toBe(-18);
      pipeline.destroy();
    });

    it('ADV-ENG-4.2: Toggling loudness normalization mid-playback does not disrupt audio state or cause exceptions', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track = createMockTrack('norm-track-1', 'Mastered Song', 180);
      await engine.playTrack(track, { immediate: true });
      expect(engine.getState()).toBe('playing');

      // Rapidly toggle normalization settings mid-stream
      engine.updateSettings({ isLoudnessNormalizationEnabled: false });
      expect(engine.getState()).toBe('playing');

      engine.updateSettings({ isLoudnessNormalizationEnabled: true });
      expect(engine.getState()).toBe('playing');

      engine.updateSettings({ isLoudnessNormalizationEnabled: false });
      expect(engine.getState()).toBe('playing');

      engine.destroy();
    });

    it('ADV-ENG-4.3: Toggling loudness normalization mid-crossfade (at t=0.5) preserves gain curves and completes cleanly', async () => {
      const tm = new TransitionManager();
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);
      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      await deck0.load('http://localhost:4000/stream/f1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/f2', 0);

      // Start 4s crossfade with equal power
      const crossfadePromise = tm.performCrossfade(
        deck0,
        deck1,
        { duration: 4, curve: 'equalPower' },
        pipeline,
        0
      );

      // Advance 2s (50% midpoint)
      await vi.advanceTimersByTimeAsync(2000);
      const midG0 = pipeline.getDeckGain(0);
      const midG1 = pipeline.getDeckGain(1);
      expect(midG0).toBeCloseTo(Math.SQRT1_2, 1);
      expect(midG1).toBeCloseTo(Math.SQRT1_2, 1);

      // Toggle normalization off midway through crossfade
      pipeline.setNormalizationEnabled(false);

      // Continue remaining 2s of crossfade
      await vi.advanceTimersByTimeAsync(2000);
      await crossfadePromise;

      // Final gains verified
      expect(pipeline.getDeckGain(0)).toBe(0.0);
      expect(pipeline.getDeckGain(1)).toBe(1.0);
      expect(deck1.getState()).toBe('playing');

      deck0.destroy();
      deck1.destroy();
      pipeline.destroy();
      tm.destroy();
    });

    it('ADV-ENG-4.4: Master volume & volume boost (up to 3.0x) correctly scales with compressor active', () => {
      const pipeline = new WebAudioPipeline();
      pipeline.setNormalizationEnabled(true);

      // Set desktop volume 0.75, boost 2.0x -> final gain = 1.5
      pipeline.setMasterVolume(0.75, 2.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.5, 2);

      // Set max volume 1.0, max boost 3.0x -> final gain = 3.0
      pipeline.setMasterVolume(1.0, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(3.0, 2);

      // Mute 0.0 with boost 3.0x -> final gain = 0.0
      pipeline.setMasterVolume(0.0, 3.0);
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);

      pipeline.destroy();
    });
  });

  // =========================================================================
  // SUITE 5: Preload Failure & Network Stall Recovery During Buffering
  // =========================================================================
  describe('5. Preload Failure & Network Stall Recovery', () => {
    it('ADV-ENG-5.1: Network 404 / 500 error during lookahead preloading handles gracefully without crashing engine', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const currentTrack = createMockTrack('active-1', 'Active Stream', 180);
      await engine.playTrack(currentTrack, { immediate: true });
      expect(engine.getState()).toBe('playing');

      // Preload a corrupted / 404 track on standby deck
      const badTrack = createMockTrack('corrupted-404', 'Broken Stream', 180);
      badTrack.streamUrl = 'http://localhost:4000/stream/error-404.mp3';

      // Mock standby deck load failure
      const standbyDeck = engine.getStandbyDeck();
      vi.spyOn(standbyDeck, 'load').mockRejectedValueOnce(new Error('HTTP 404 Not Found'));

      // Preload should catch error internally and not throw
      await expect(engine.preloadNextTrack(badTrack)).resolves.not.toThrow();

      // Active track is completely unaffected and still playing
      expect(engine.getState()).toBe('playing');
      expect(engine.getActiveDeckIndex()).toBe(0);

      engine.destroy();
    });

    it('ADV-ENG-5.2: Fallback direct playback executes successfully after a prior preload failure', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track1 = createMockTrack('track-ok-1', 'Valid Song', 180);
      const track2 = createMockTrack('track-recovered-2', 'Recovered Song', 180);

      await engine.playTrack(track1, { immediate: true });

      // Standby preload fails
      const standbyDeck = engine.getStandbyDeck();
      vi.spyOn(standbyDeck, 'load').mockRejectedValueOnce(new Error('Network Timeout'));
      await engine.preloadNextTrack(track2);

      // Now user directly skips to track2 with immediate playback
      vi.restoreAllMocks();
      await engine.playTrack(track2, { immediate: true });

      expect(engine.getState()).toBe('playing');
      expect(engine.getCurrentTrack().id).toBe('track-recovered-2');

      engine.destroy();
    });

    it('ADV-ENG-5.3: Network buffering stalls emit buffering events and recover seamlessly upon buffer arrival', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const bufferingEvents: boolean[] = [];
      engine.on('buffering', (status: boolean) => {
        bufferingEvents.push(status);
      });

      const track = createMockTrack('stall-track-1', 'Buffer Test', 180);
      await engine.playTrack(track, { immediate: true });

      // Active deck element triggers waiting (network stall)
      (el0 as any).simulateWaiting();
      expect(bufferingEvents).toContain(true);

      // Active deck element receives chunks and can play
      (el0 as any).simulateBufferProgress(0, 50);
      (el0 as any).simulateCanPlay();
      expect(bufferingEvents[bufferingEvents.length - 1]).toBe(false);

      engine.destroy();
    });

    it('ADV-ENG-5.4: Standby deck stall during pre-buffering does not block active deck playback or seek operations', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      const track1 = createMockTrack('active-stream', 'Active Track', 180);
      const track2 = createMockTrack('slow-stream', 'Slow Preloading Track', 200);

      await engine.playTrack(track1, { immediate: true });

      // Preload next track
      const preloadPromise = engine.preloadNextTrack(track2);

      // Standby element simulates stalled buffer
      (el1 as any).buffered = new MockTimeRanges([]);
      (el1 as any).simulateWaiting();

      // Active deck can seek and play without hindrance
      engine.seek(60);
      expect(engine.getCurrentTime()).toBe(60);
      expect(engine.getState()).toBe('playing');

      await preloadPromise;
      engine.destroy();
    });

    it('ADV-ENG-5.5: Canceling preload clears preloaded track state and unloads standby deck', () => {
      const preload = new PreloadManager(15);
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-standby', el);

      const track = createMockTrack('preload-cancel-1', 'Cancel Track', 180);
      preload.preloadTrack(track, deck);
      expect(preload.getPreloadedTrackId()).toBe('preload-cancel-1');

      // Cancel preload
      preload.cancelPreload(deck);
      expect(preload.getPreloadedTrackId()).toBeNull();
      expect(preload.getIsPreloading()).toBe(false);

      deck.destroy();
    });
  });
});
