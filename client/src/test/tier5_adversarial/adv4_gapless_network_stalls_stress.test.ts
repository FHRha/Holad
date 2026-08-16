import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioEngine } from '../../audio/AudioEngine';
import { AudioDeck } from '../../audio/AudioDeck';
import { TransitionManager } from '../../audio/TransitionManager';
import { PreloadManager } from '../../audio/PreloadManager';
import { createMockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Gapless Playback Under Network Stalls & Buffer Latency', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('ADV-GAP-1: Gapless handover during simulated network stalls on standby deck recovers smoothly', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);
    engine.updateSettings({ isCrossfadeEnabled: false, isGaplessEnabled: true });

    const track1 = createMockTrack('gap-1', 'Gapless Song 1', 180);
    const track2 = createMockTrack('gap-2', 'Gapless Song 2', 200);

    // Start playing track 1
    await engine.playTrack(track1, { immediate: true });
    expect(engine.getActiveDeckIndex()).toBe(0);
    expect(engine.getState()).toBe('playing');

    // Preload track 2 on standby deck (deck 1)
    await engine.preloadNextTrack(track2);

    // Simulate network stall on standby deck: buffer empty, waiting event fired
    (el1 as any).buffered = new MockTimeRanges([]);
    (el1 as any).simulateWaiting();

    let bufferingEventCount = 0;
    engine.on('buffering', (isBuffering: boolean) => {
      if (isBuffering) bufferingEventCount++;
    });

    // Active deck (track 1) finishes
    // Engine performs gapless handover to deck 1
    await engine.playTrack(track2, { immediate: false });
    expect(engine.getActiveDeckIndex()).toBe(1);

    // Simulate incoming deck is now stalled and emits waiting
    (el1 as any).simulateWaiting();
    expect(bufferingEventCount).toBeGreaterThan(0);

    // Network resolves chunk: incoming deck receives buffer data and canplaythrough
    (el1 as any).simulateBufferProgress(0, 30);
    (el1 as any).simulateCanPlay();

    expect(engine.getState()).toBe('playing');
    expect(engine.getWebAudioPipeline()?.getDeckGain(1)).toBe(1.0);
    expect(engine.getWebAudioPipeline()?.getDeckGain(0)).toBe(0.0);

    engine.destroy();
  });

  it('ADV-GAP-2: Slow buffer resolution during preloading does not delay active deck playback', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('gap-slow-1', 'Active Stream', 180);
    const track2 = createMockTrack('gap-slow-2', 'High Latency Stream', 240);

    await engine.playTrack(track1, { immediate: true });

    // Active deck continues playing smoothly while standby deck preloads
    (el0 as any).simulateTimeUpdate(170);
    expect(el0.paused).toBe(false);

    // Preload triggered with simulated latency
    const preloadPromise = engine.preloadNextTrack(track2);
    expect(el0.paused).toBe(false);
    expect(engine.getState()).toBe('playing');

    await preloadPromise;
    expect(engine.getState()).toBe('playing');

    engine.destroy();
  });

  it('ADV-GAP-3: Rapid sequence of gapless transitions across 10 tracks under fragmented buffer ranges', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);
    engine.updateSettings({ isCrossfadeEnabled: false, isGaplessEnabled: true });

    const tracks = Array.from({ length: 10 }, (_, i) => createMockTrack(`gap-frag-${i}`, `Track ${i}`, 100));

    // Play first track
    await engine.playTrack(tracks[0], { immediate: true });

    for (let i = 1; i < tracks.length; i++) {
      const nextTrack = tracks[i];
      // Preload next track
      await engine.preloadNextTrack(nextTrack);

      // Simulate fragmented buffer chunks on standby element
      const standbyIndex = (1 - engine.getActiveDeckIndex()) as 0 | 1;
      const standbyEl = standbyIndex === 0 ? el0 : el1;
      (standbyEl as any).buffered = new MockTimeRanges([
        { start: 0, end: 15 },
        { start: 30, end: 45 },
        { start: 60, end: 80 },
      ]);

      // Perform handover
      await engine.playTrack(nextTrack, { immediate: false });
      expect(engine.getActiveDeckIndex()).toBe(standbyIndex);
      expect(engine.getCurrentTrack().id).toBe(nextTrack.id);
    }

    expect(engine.getState()).toBe('playing');
    engine.destroy();
  });

  it('ADV-GAP-4: Dynamic seeking near track boundaries under simulated buffer stalls maintains state integrity', async () => {
    const el0 = createMockAudioElement();
    (el0 as any).duration = 200;
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track = createMockTrack('gap-seek-1', 'Boundary Track', 200);
    await engine.playTrack(track, { immediate: true });

    // Rapidly seek close to the end (199.9s)
    engine.seek(199.9);
    expect(engine.getCurrentTime()).toBe(199.9);

    // Simulate stalled buffer at new seek location
    (el0 as any).simulateWaiting();

    let bufferingStatus = false;
    engine.on('buffering', (status: boolean) => {
      bufferingStatus = status;
    });

    (el0 as any).simulateWaiting();
    expect(bufferingStatus).toBe(true);

    // Buffer arrives
    (el0 as any).simulateBufferProgress(199, 200);
    (el0 as any).simulateCanPlay();
    expect(bufferingStatus).toBe(false);

    engine.destroy();
  });

  it('ADV-GAP-5: Preload lookahead calculations with zero, negative, NaN, or Infinity durations handle safely', () => {
    const preload = new PreloadManager(15);

    expect(preload.shouldPreload(10, 0)).toBe(false);
    expect(preload.shouldPreload(10, -50)).toBe(false);
    expect(preload.shouldPreload(10, NaN)).toBe(false);
    expect(preload.shouldPreload(10, Infinity)).toBe(false);
    expect(preload.shouldPreload(NaN, 180)).toBe(false);

    // Normal valid thresholds
    expect(preload.shouldPreload(160, 180, 0)).toBe(false); // 20s remaining > 15s
    expect(preload.shouldPreload(170, 180, 0)).toBe(true);  // 10s remaining <= 15s
    expect(preload.shouldPreload(179, 180, 0)).toBe(true);  // 1s remaining <= 15s
  });

  it('ADV-GAP-6: Abort during gapless handover cleanly resets standby deck without dual audio leakage', async () => {
    const tm = new TransitionManager();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    await deck0.load('http://localhost:4000/stream/trk1', 0);
    await deck0.play();
    await deck1.load('http://localhost:4000/stream/trk2', 0);

    // Trigger handover
    const handoverPromise = tm.performGaplessHandover(deck0, deck1);
    // Immediately abort
    tm.abortActiveTransition(deck0, deck1);
    await deck0.play();

    await handoverPromise;

    expect(deck0.getState()).toBe('playing');
    expect(deck0.element.volume).toBe(1.0);
    expect(deck1.element.volume).toBe(0.0);

    deck0.destroy();
    deck1.destroy();
    tm.destroy();
  });
});
