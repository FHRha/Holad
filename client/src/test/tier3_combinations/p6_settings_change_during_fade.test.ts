import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P6: Settings Change During Active Crossfade Transition', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('P6-1: Changing audio settings mid-crossfade does not throw or corrupt audio graph', async () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.8);

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/songB', 6, 0);
    await vi.advanceTimersByTimeAsync(3000);

    // Mid-fade settings change
    useSettingsStore.getState().setCrossfadeDuration(10);
    useSettingsStore.getState().setClickAction('play_next');

    await vi.advanceTimersByTimeAsync(3000);
    await crossfadePromise;

    expect(webAudio.getState()).toBe('playing');
    webAudio.destroy();
  });

  it('P6-2: Modifying visual theme settings during crossfade has zero impact on audio output', async () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.7);

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/songB', 4, 0);
    await vi.advanceTimersByTimeAsync(2000);

    // Theme changes
    useSettingsStore.getState().setTheme('light');
    useSettingsStore.getState().setAccentColor('purple');

    await vi.advanceTimersByTimeAsync(2000);
    await crossfadePromise;

    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().accentColor).toBe('purple');
    expect(webAudio.getState()).toBe('playing');

    webAudio.destroy();
  });

  it('P6-3: Volume slider adjustment during crossfade smoothly rescales active fading target', async () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.5);

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/songB', 4, 0);
    await vi.advanceTimersByTimeAsync(2000);

    // User cranks volume to 1.0 mid-fade
    webAudio.setVolume(1.0);

    await vi.advanceTimersByTimeAsync(2000);
    await crossfadePromise;

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(1.0);

    webAudio.destroy();
  });
});
