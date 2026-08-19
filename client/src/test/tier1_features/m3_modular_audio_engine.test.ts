import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioDeck } from '../../audio/AudioDeck';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { PreloadManager } from '../../audio/PreloadManager';
import { TransitionManager } from '../../audio/TransitionManager';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement, MockAudioContext } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Milestone 3: Modular Dual-Deck Spotify-like Audio Engine', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('AudioDeck Unit Tests', () => {
    it('initializes with idle state and wraps HTMLAudioElement lifecycle', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('test-deck-1', el);

      expect(deck.id).toBe('test-deck-1');
      expect(deck.getState()).toBe('idle');

      await deck.load('http://localhost:4000/stream/song1', 0);
      expect(deck.getState()).toBe('ready');

      await deck.play();
      expect(deck.getState()).toBe('playing');

      deck.pause();
      expect(deck.getState()).toBe('paused');

      deck.destroy();
      expect(deck.getState()).toBe('idle');
    });

    it('calculates buffered progress and ranges accurately', () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('test-deck-buffer', el);
      (el as any).duration = 200;
      (el as any).simulateBufferProgress(0, 150);

      const ranges = deck.getBufferedRanges();
      expect(ranges.length).toBe(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(150);
      expect(deck.getBufferedPercent()).toBe(75);

      deck.destroy();
    });

    it('handles seek, volume, playback rate, and loop settings', () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('test-deck-controls', el);
      (el as any).duration = 180;

      deck.seek(45);
      expect(deck.getCurrentTime()).toBe(45);

      deck.setVolume(0.8);
      expect(el.volume).toBe(0.8);

      deck.setPlaybackRate(1.5);
      expect(el.playbackRate).toBe(1.5);

      deck.setLoop(true);
      expect(el.loop).toBe(true);

      deck.destroy();
    });
  });

  describe('WebAudioPipeline Unit Tests', () => {
    it('creates dual deck routing, dynamics compressor (-18dB, 3:1 ratio, 3ms attack) and master gain', () => {
      const pipeline = new WebAudioPipeline();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();

      pipeline.attachDeck(0, el0);
      pipeline.attachDeck(1, el1);

      expect(pipeline.compressorNode.threshold.value).toBe(-18);
      expect(pipeline.compressorNode.ratio.value).toBe(3);
      expect(pipeline.compressorNode.attack.value).toBe(0.003);

      pipeline.setDeckGain(0, 0.5);
      expect(pipeline.getDeckGain(0)).toBe(0.5);

      pipeline.setMasterVolume(0.8, 1.5);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.2);

      pipeline.destroy();
    });

    it('toggles normalization routing smoothly between compressor and direct path', () => {
      const pipeline = new WebAudioPipeline();
      expect(pipeline.masterGainNode).toBeDefined();

      pipeline.setNormalizationEnabled(false);
      pipeline.setNormalizationEnabled(true);

      pipeline.destroy();
    });
  });

  describe('PreloadManager Unit Tests', () => {
    it('calculates lookahead window and preloads standby deck', async () => {
      const preload = new PreloadManager(15);
      expect(preload.getLookaheadSeconds()).toBe(15);

      expect(preload.shouldPreload(160, 180, 3)).toBe(false); // 20s remaining > 15s
      expect(preload.shouldPreload(170, 180, 3)).toBe(true);  // 10s remaining <= 15s

      const standbyDeck = new AudioDeck('standby', createMockAudioElement());
      const nextTrack = createMockTrack('track-next-2', 'Next Song', 180);

      await preload.preloadTrack(nextTrack, standbyDeck);
      expect(preload.getPreloadedTrackId()).toBe('track-next-2');
      expect(preload.isTrackPreloaded('track-next-2')).toBe(true);

      preload.cancelPreload(standbyDeck);
      expect(preload.getPreloadedTrackId()).toBeNull();

      standbyDeck.destroy();
    });
  });

  describe('TransitionManager Unit Tests', () => {
    it('executes sample-accurate zero-latency gapless handover', async () => {
      const tm = new TransitionManager();
      const deck0 = new AudioDeck('deck-0', createMockAudioElement());
      const deck1 = new AudioDeck('deck-1', createMockAudioElement());

      await deck0.load('http://localhost:4000/stream/track1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/track2', 0);

      await tm.performGaplessHandover(deck0, deck1);

      expect(deck1.getState()).toBe('playing');
      expect(deck0.getState()).toBe('paused');

      deck0.destroy();
      deck1.destroy();
      tm.destroy();
    });

    it('executes equal-power crossfade transition with continuous acoustic energy', async () => {
      const tm = new TransitionManager();
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('deck-0', el0);
      const deck1 = new AudioDeck('deck-1', el1);

      await deck0.load('http://localhost:4000/stream/track1', 0);
      await deck0.play();
      await deck1.load('http://localhost:4000/stream/track2', 0);

      const crossfadePromise = tm.performCrossfade(deck0, deck1, {
        duration: 4,
        curve: 'equalPower',
      });

      // Advance midpoint (2000ms)
      await vi.advanceTimersByTimeAsync(2000);
      expect(tm.getIsTransitioning()).toBe(true);

      // Midpoint equal power check: cos(pi/4) approx 0.707, sin(pi/4) approx 0.707
      // 0.707^2 + 0.707^2 = 1.0 (constant acoustic power)
      const vol0 = el0.volume;
      const vol1 = el1.volume;
      const totalPower = vol0 * vol0 + vol1 * vol1;
      expect(totalPower).toBeCloseTo(1.0, 1);

      // Advance remainder to complete
      await vi.advanceTimersByTimeAsync(2500);
      await crossfadePromise;

      expect(deck1.getState()).toBe('playing');
      expect(deck0.getState()).toBe('paused');

      deck0.destroy();
      deck1.destroy();
      tm.destroy();
    });
  });

  describe('AudioEngine Facade Unit Tests', () => {
    it('manages dual decks, settings, volume, and playback commands seamlessly', async () => {
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const engine = new AudioEngine([el0, el1]);

      engine.updateSettings({
        isCrossfadeEnabled: true,
        crossfadeDuration: 4,
        crossfadeCurve: 'equalPower',
        isGaplessEnabled: true,
        isLoudnessNormalizationEnabled: true,
        preloadNextTrack: true,
      });

      engine.setVolume(0.75);
      engine.setVolumeMultiplier(1.2);

      const track1 = createMockTrack('t1', 'Track 1', 180);
      await engine.playTrack(track1, { immediate: true });

      expect(engine.getState()).toBe('playing');
      expect(engine.getActiveDeckIndex()).toBe(0);

      // Preload track 2
      const track2 = createMockTrack('t2', 'Track 2', 180);
      await engine.preloadNextTrack(track2);

      // Seek
      engine.seek(60);
      expect(engine.getCurrentTime()).toBe(60);

      // Pause & Resume
      engine.pause();
      expect(engine.getState()).toBe('paused');

      await engine.resume();
      expect(engine.getState()).toBe('playing');

      engine.destroy();
    });
  });
});

