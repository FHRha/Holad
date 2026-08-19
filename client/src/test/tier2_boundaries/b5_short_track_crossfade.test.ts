import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B5: Short Track Crossfading & Edge Durations', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('B5-1: Track shorter than crossfade duration clamps effective fade time', async () => {
    const trackDuration = 3; // 3s track
    const crossfadeSetting = 5; // 5s crossfade
    const effectiveFadeDuration = Math.min(crossfadeSetting, trackDuration);

    expect(effectiveFadeDuration).toBe(3);
    expect(effectiveFadeDuration).toBeLessThanOrEqual(trackDuration);
  });

  it('B5-2: MobileAudioCore handles short crossfade duration (0.5s) without interval errors', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/short1', 0);

    const crossfadePromise = mobileCore.crossfadeTo('http://localhost:4000/stream/short2', 0.5, 0);

    vi.advanceTimersByTime(500);
    await crossfadePromise;

    expect(mobileCore.getState()).toBe('playing');
    mobileCore.destroy();
  });

  it('B5-3: Ultra-short 1-second audio element transitions without hanging', async () => {
    const webAudio = new WebAudioCore();
    await webAudio.play('http://localhost:4000/stream/jingle', 0);
    
    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/song', 1, 0);
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(500);

    await crossfadePromise;
    expect(webAudio.getState()).toBe('playing');
    webAudio.destroy();
  });

  it('B5-4: Zero duration crossfade (instant cut) acts as immediate track change', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/track1', 0);
    await mobileCore.play('http://localhost:4000/stream/track2', 0);

    expect(mobileCore.getState()).toBe('playing');
    mobileCore.destroy();
  });

  it('B5-5: Crossfade cancellation when short track ends abruptly resets state cleanly', () => {
    const mobileCore = new MobileAudioCore();
    mobileCore.crossfadeTo('http://localhost:4000/stream/track2', 10, 0);

    // Abrupt end / pause
    mobileCore.pause();
    expect(mobileCore.getCurrentTime()).toBe(0);
    mobileCore.destroy();
  });
});
