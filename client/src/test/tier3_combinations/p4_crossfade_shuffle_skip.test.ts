import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 3 - P4: Crossfade + Shuffle Mode + Next Track Skip During Active Fade', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('P4-1: Shuffle mode randomizes upcoming tracks while crossfade is enabled', () => {
    const tracks = createMockAlbumTracks(10);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(0);
    useSettingsStore.getState().setIsCrossfadeEnabled(true);

    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().isShuffle).toBe(true);
    expect(usePlayerStore.getState().queue.length).toBe(10);
  });

  it('P4-2: User clicking next during active crossfade aborts prior transition and begins new transition', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/track1', 0);

    // Start crossfade to track2
    const p1 = mobileCore.crossfadeTo('http://localhost:4000/stream/track2', 6, 0);
    await vi.advanceTimersByTimeAsync(2000); // 2s into fade

    // User skips immediately to track3
    const p2 = mobileCore.crossfadeTo('http://localhost:4000/stream/track3', 4, 0);
    await vi.advanceTimersByTimeAsync(4000);

    await Promise.all([p1, p2]);
    expect(mobileCore.getState()).toBe('playing');
    mobileCore.destroy();
  });

  it('P4-3: Toggling shuffle mid-transition preserves current playing track and updates remaining queue', () => {
    const tracks = createMockAlbumTracks(5);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(1);

    const currentTrackId = usePlayerStore.getState().queue[1].id;
    usePlayerStore.getState().toggleShuffle();

    expect(usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex].id).toBe(currentTrackId);
  });
});
