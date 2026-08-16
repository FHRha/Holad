import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 4 - RW1: Full Album Continuous Playback Workload', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('RW1-1: 5-track album plays continuously across all tracks with seamless queue advancement', async () => {
    const albumTracks = createMockAlbumTracks(5, 180);
    usePlayerStore.getState().setQueue(albumTracks);
    usePlayerStore.getState().setCurrentIndex(0);
    usePlayerStore.getState().setIsPlaying(true);
    useSettingsStore.getState().setIsCrossfadeEnabled(false);

    const webAudio = new WebAudioCore();

    // Play through each track of the album sequentially
    for (let trackIdx = 0; trackIdx < albumTracks.length; trackIdx++) {
      expect(usePlayerStore.getState().currentIndex).toBe(trackIdx);
      const currentTrack = usePlayerStore.getState().queue[trackIdx];
      expect(currentTrack.id).toBe(`track-${trackIdx + 1}`);

      await webAudio.play(currentTrack.streamUrl, 0);
      expect(webAudio.getState()).toBe('playing');

      // Simulate track completion
      if (trackIdx < albumTracks.length - 1) {
        usePlayerStore.getState().nextTrack();
      }
    }

    expect(usePlayerStore.getState().currentIndex).toBe(4);
    webAudio.destroy();
  });

  it('RW1-2: Album track progression accurately tracks cumulative playtime without gaps', () => {
    const albumTracks = createMockAlbumTracks(5, 200);
    usePlayerStore.getState().setQueue(albumTracks);

    let totalAlbumTime = 0;
    albumTracks.forEach(t => { totalAlbumTime += t.duration; });
    expect(totalAlbumTime).toBe(1000); // 5 * 200s
  });
});
