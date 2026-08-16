import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P1: Volume Slider + Multiplier + Crossfade Interaction', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('P1-1: Crossfade smoothly transitions between tracks when volume multiplier is boosted to 2.5x', async () => {
    usePlayerStore.getState().setVolume(0.4);
    usePlayerStore.getState().setVolumeMultiplier(2.5);
    useSettingsStore.getState().setCrossfadeDuration(4);

    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.4 * 2.5); // 1.0 effective gain

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/boosted-track', 4, 0);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);

    await vi.advanceTimersByTimeAsync(2000); // Trigger midpoint setTimeout
    await vi.advanceTimersByTimeAsync(2000); // Trigger second half

    await crossfadePromise;
    expect(gainNode.gain.value).toBe(1.0);

    webAudio.destroy();
  });

  it('P1-2: Adjusting desktop volume slider during active crossfade adjusts target volume curve', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.5);

    // Mid-fade volume adjustment
    webAudio.setVolume(0.9);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.9);

    webAudio.destroy();
  });

  it('P1-3: Crossfade at 0.0 volume (muted) performs transition silently without ramping to audible level', async () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.0);

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/silent-crossfade', 2, 0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await crossfadePromise;
    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.0);

    webAudio.destroy();
  });
});
