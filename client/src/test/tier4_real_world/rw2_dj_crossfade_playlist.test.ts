import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 4 - RW2: DJ Party Playlist with Equal-Power Crossfading', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('RW2-1: Consecutive tracks transition through 6-second crossfades across the entire party set', async () => {
    const playlist = createMockAlbumTracks(4, 240);
    usePlayerStore.getState().setQueue(playlist);
    usePlayerStore.getState().setCurrentIndex(0);
    usePlayerStore.getState().setIsPlaying(true);
    useSettingsStore.getState().setIsCrossfadeEnabled(true);
    useSettingsStore.getState().setCrossfadeDuration(6);

    const mobileCore = new MobileAudioCore();
    await mobileCore.play(playlist[0].streamUrl, 0);
    expect(mobileCore.getState()).toBe('playing');

    // Transition 1: Track 1 -> Track 2
    const fade1 = mobileCore.crossfadeTo(playlist[1].streamUrl, 6, 0);
    await vi.advanceTimersByTimeAsync(6000);
    await fade1;
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(1);

    // Transition 2: Track 2 -> Track 3
    const fade2 = mobileCore.crossfadeTo(playlist[2].streamUrl, 6, 0);
    await vi.advanceTimersByTimeAsync(6000);
    await fade2;
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(2);

    // Transition 3: Track 3 -> Track 4
    const fade3 = mobileCore.crossfadeTo(playlist[3].streamUrl, 6, 0);
    await vi.advanceTimersByTimeAsync(6000);
    await fade3;
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(3);

    expect(mobileCore.getState()).toBe('playing');
    mobileCore.destroy();
  });
});
