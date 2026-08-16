import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { PreloadManager } from '../../audio/PreloadManager';
import { createMockAudioElement } from '../mocks/mockAudio';
import { createMockTrack, createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Queue & Lifecycle Race Conditions Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('ADV-QUEUE-1: Rapid track skipping (100 rapid nextTrack calls) does not throw or exceed queue boundaries', () => {
    const tracks = createMockAlbumTracks(10);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setIsPlaying(true);

    expect(usePlayerStore.getState().currentIndex).toBe(0);

    // Blast 100 rapid nextTrack calls
    for (let i = 0; i < 100; i++) {
      usePlayerStore.getState().nextTrack();
    }

    // With repeatMode = 'none', it should safely halt at the last track index (9)
    expect(usePlayerStore.getState().currentIndex).toBe(9);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Blast 100 rapid prevTrack calls
    for (let i = 0; i < 100; i++) {
      usePlayerStore.getState().prevTrack();
    }

    // Halts at the first track index (0)
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it('ADV-QUEUE-2: Repeat mode permutations at queue boundaries handle rollover and loop seamlessly', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(2); // At last track

    // repeatMode = 'all': nextTrack rolls over to index 0
    usePlayerStore.getState().setRepeatMode('all');
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);

    // repeatMode = 'one': nextTrack stays on index 0
    usePlayerStore.getState().setRepeatMode('one');
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);

    // repeatMode = 'none': advance to end
    usePlayerStore.getState().setRepeatMode('none');
    usePlayerStore.getState().nextTrack(); // index 1
    usePlayerStore.getState().nextTrack(); // index 2
    usePlayerStore.getState().nextTrack(); // stays at index 2
    expect(usePlayerStore.getState().currentIndex).toBe(2);
  });

  it('ADV-QUEUE-3: Empty queue edge cases and invalid indices do not crash store or audio engine', () => {
    const store = usePlayerStore.getState();

    // Operations on completely empty queue
    expect(() => {
      store.clearQueue();
      store.addToQueue([]);
      store.playNext([]);
      store.removeFromQueue(0);
      store.removeFromQueue(-1);
      store.removeFromQueue(99);
      store.reorderQueue(0, 5);
      store.reorderQueue(-1, 99);
      store.nextTrack();
      store.prevTrack();
      store.toggleShuffle();
    }).not.toThrow();

    expect(usePlayerStore.getState().queue.length).toBe(0);
    expect(usePlayerStore.getState().currentIndex).toBe(-1);
  });

  it('ADV-QUEUE-4: Shuffle mode toggle churn with 100 tracks preserves total track count and current track', () => {
    const tracks = createMockAlbumTracks(100);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(42);
    const activeTrackId = tracks[42].id;

    // Toggle shuffle 50 times in rapid succession
    for (let i = 0; i < 50; i++) {
      usePlayerStore.getState().toggleShuffle();
      const currentQueue = usePlayerStore.getState().queue;
      const currentIdx = usePlayerStore.getState().currentIndex;

      expect(currentQueue.length).toBe(100);
      expect(currentQueue[currentIdx].id).toBe(activeTrackId);
    }
  });

  it('ADV-QUEUE-5: Rapid playTrack load storm on AudioEngine handles AbortError gracefully without unhandled rejections', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const tracks = createMockAlbumTracks(20);

    // Rapidly switch tracks 20 times concurrently without awaiting each before firing next
    const promises = tracks.map((track) => 
      engine.playTrack(track, { immediate: true })
    );

    // All should resolve or catch cleanly without unhandled rejection
    await Promise.allSettled(promises);

    expect(engine.getState()).toBe('playing');
    expect(engine.getCurrentTrack().id).toBe(tracks[19].id);

    engine.destroy();
  });

  it('ADV-QUEUE-6: PreloadManager lookahead cancellation when skipped tracks bypass preloaded track', async () => {
    const preload = new PreloadManager(15);
    const elStandby = createMockAudioElement();
    const standbyDeck = new (await import('../../audio/AudioDeck')).AudioDeck('standby', elStandby);

    const upcomingTrack = createMockTrack('pre-1', 'Preload Track 1');
    const skippedToTrack = createMockTrack('pre-99', 'Skipped Track 99');

    // Preload track 1
    await preload.preloadTrack(upcomingTrack, standbyDeck);
    expect(preload.isTrackPreloaded('pre-1')).toBe(true);

    // User suddenly skips past track 1 to track 99
    preload.cancelPreload(standbyDeck);
    expect(preload.isTrackPreloaded('pre-1')).toBe(false);
    expect(preload.getPreloadedTrackId()).toBeNull();

    // Now preload track 99
    await preload.preloadTrack(skippedToTrack, standbyDeck);
    expect(preload.isTrackPreloaded('pre-99')).toBe(true);

    standbyDeck.destroy();
  });

  it('ADV-QUEUE-7: Queue reordering during active playback preserves active track playing index', () => {
    const tracks = createMockAlbumTracks(5); // id: track-1 to track-5
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(2); // Playing track-3 (index 2)
    usePlayerStore.getState().setIsPlaying(true);

    // Move track-1 (index 0) to index 4 (after track-3)
    usePlayerStore.getState().reorderQueue(0, 4);

    // track-3 should now be at index 1
    const newIdx = usePlayerStore.getState().currentIndex;
    expect(newIdx).toBe(1);
    expect(usePlayerStore.getState().queue[newIdx].id).toBe('track-3');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });
});
