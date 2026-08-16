import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useAudioStore } from '../../store/audioStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 4 - RW5: Interactive Navigation & Heavy Scrubbing Under Load', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('RW5-1: Heavy user interaction burst (skip, scrub, volume, settings) executes without race conditions', async () => {
    const tracks = createMockAlbumTracks(8);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(0);
    usePlayerStore.getState().setIsPlaying(true);

    const webAudio = new WebAudioCore();

    // Burst 1: Rapid skips
    usePlayerStore.getState().nextTrack();
    usePlayerStore.getState().nextTrack();
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(3);

    // Burst 2: Rapid scrubbing
    useAudioStore.getState().setIsSeeking(true);
    useAudioStore.getState().setProgress(85);
    webAudio.seek(145);
    useAudioStore.getState().setIsSeeking(false);
    expect(webAudio.getCurrentTime()).toBe(145);

    // Burst 3: Volume and settings adjustments
    usePlayerStore.getState().setVolume(0.85);
    webAudio.setVolume(0.85);
    useSettingsStore.getState().setCrossfadeDuration(8);
    usePlayerStore.getState().setVolumeMultiplier(1.8);

    // Burst 4: Prev skips
    usePlayerStore.getState().prevTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(2);

    // Final state assertions
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(usePlayerStore.getState().volume).toBe(0.85);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(8);

    webAudio.destroy();
  });
});
