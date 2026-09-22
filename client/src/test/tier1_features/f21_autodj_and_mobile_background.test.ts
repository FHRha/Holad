import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioDeck } from '../../audio/AudioDeck';
import { TransitionManager } from '../../audio/TransitionManager';
import { createMockTrack, resetAllStores } from '../helpers/testUtils';
import * as subsonicApi from '../../api/subsonic';
import * as downloadStore from '../../store/downloadStore';
import * as networkStatus from '../../utils/networkStatus';
import { renderHook, act } from '@testing-library/react';
import { useAutoDj } from '../../hooks/useAutoDj';

describe('Tier 1 - F21: Auto DJ Rules & Mobile Background Playback Stability', () => {
  beforeEach(() => {
    resetAllStores();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auto DJ Duration & Deduplication Filtering', () => {
    it('F21-1: Auto DJ strictly excludes tracks with duration < 10 seconds from recommendations', async () => {
      const initialQueue = [
        createMockTrack('q1', 'Current Track', 180),
        createMockTrack('q2', 'Next Track', 200),
      ];
      usePlayerStore.setState({
        queue: initialQueue,
        currentIndex: 0, // currentIndex >= queue.length - 2 (0 >= 0 is true)
        isAutoDjEnabled: true,
      });

      const candidateTracks = [
        { id: 'short-1', title: 'Intro Jingle', duration: 4, albumId: 'alb-1', artist: 'Art' },
        { id: 'short-2', title: 'Skit', duration: 9, albumId: 'alb-1', artist: 'Art' },
        { id: 'valid-1', title: 'Full Track 1', duration: 15, albumId: 'alb-1', artist: 'Art' },
        { id: 'valid-2', title: 'Full Track 2', duration: 180, albumId: 'alb-1', artist: 'Art' },
      ];

      vi.spyOn(networkStatus, 'isOffline').mockReturnValue(false);
      vi.spyOn(subsonicApi, 'fetchRandomTracks').mockResolvedValue(candidateTracks as any);

      renderHook(() => useAutoDj());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const updatedQueue = usePlayerStore.getState().queue;
      const addedIds = updatedQueue.slice(2).map((t) => t.id);

      expect(addedIds).toContain('valid-1');
      expect(addedIds).toContain('valid-2');
      expect(addedIds).not.toContain('short-1');
      expect(addedIds).not.toContain('short-2');
    });

    it('F21-2: Auto DJ strictly prevents duplicate tracks from the current queue and consecutive identical tracks', async () => {
      const initialQueue = [
        createMockTrack('existing-1', 'Track 1', 120),
        createMockTrack('existing-2', 'Track 2', 150),
      ];
      usePlayerStore.setState({
        queue: initialQueue,
        currentIndex: 0,
        isAutoDjEnabled: true,
      });

      // API returns a mix of tracks that already exist in queue and new ones
      const candidateTracks = [
        { id: 'existing-2', title: 'Duplicate of Existing', duration: 150, albumId: 'alb-1' },
        { id: 'existing-1', title: 'Duplicate of Current', duration: 120, albumId: 'alb-1' },
        { id: 'new-1', title: 'Brand New Track 1', duration: 160, albumId: 'alb-2' },
        { id: 'new-1', title: 'Duplicate in Same Batch', duration: 160, albumId: 'alb-2' },
        { id: 'new-2', title: 'Brand New Track 2', duration: 210, albumId: 'alb-3' },
      ];

      vi.spyOn(networkStatus, 'isOffline').mockReturnValue(false);
      vi.spyOn(subsonicApi, 'fetchRandomTracks').mockResolvedValue(candidateTracks as any);

      renderHook(() => useAutoDj());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const updatedQueue = usePlayerStore.getState().queue;
      const trackIds = updatedQueue.map((t) => t.id);

      // Verify no duplicates anywhere in queue
      const uniqueIds = new Set(trackIds);
      expect(trackIds.length).toBe(uniqueIds.size);

      // Verify new tracks were added, but no duplicates from queue were added
      expect(trackIds).toEqual(['existing-1', 'existing-2', 'new-1', 'new-2']);
    });

    it('F21-3: Auto DJ in offline mode filters tracks < 10s and tracks already in current queue', async () => {
      const initialQueue = [createMockTrack('off-1', 'Offline Track 1', 120)];
      usePlayerStore.setState({
        queue: initialQueue,
        currentIndex: 0,
        isAutoDjEnabled: true,
      });

      const offlineLibrary = [
        createMockTrack('off-1', 'Offline Track 1', 120), // Duplicate of current queue
        createMockTrack('off-short', 'Short Sound Effect', 5), // < 10s
        createMockTrack('off-2', 'Offline Track 2', 200), // Valid
        createMockTrack('off-3', 'Offline Track 3', 300), // Valid
      ];

      vi.spyOn(networkStatus, 'isOffline').mockReturnValue(true);
      vi.spyOn(downloadStore, 'getOfflineTracks').mockReturnValue(offlineLibrary as any);

      renderHook(() => useAutoDj());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const updatedQueue = usePlayerStore.getState().queue;
      const ids = updatedQueue.map((t) => t.id);

      expect(ids).not.toContain('off-short');
      // off-1 should appear only once (the original one)
      expect(ids.filter((id) => id === 'off-1').length).toBe(1);
      expect(ids).toContain('off-2');
      expect(ids).toContain('off-3');
    });
  });

  describe('Mobile Background Audio Stability', () => {
    it('F21-4: AudioDeck.load resolves immediately without blocking for 1500ms when position is 0', async () => {
      const deck = new AudioDeck('test-deck-quick');
      const startTime = performance.now();

      // load() with position 0 must resolve immediately, enabling instant play() initiation
      await deck.load('http://localhost:4000/stream/instant', 0);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(100);
      deck.destroy();
    });

    it('F21-5: AudioDeck.load with position > 0 sets targetPosition and does not block indefinitely', async () => {
      const deck = new AudioDeck('test-deck-seek');
      const startTime = performance.now();

      await deck.load('http://localhost:4000/stream/seek-track', 45);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(100);
      expect(deck.targetPosition).toBe(45);
      deck.destroy();
    });

    it('F21-6: TransitionManager performs immediate full-volume handover when document is hidden (background playback)', async () => {
      const manager = new TransitionManager();
      const deck0 = new AudioDeck('deck-bg-0');
      const deck1 = new AudioDeck('deck-bg-1');

      // Simulate document.hidden = true (phone in pocket / locked screen)
      Object.defineProperty(document, 'hidden', {
        value: true,
        configurable: true,
        writable: true,
      });

      deck0.setVolume(1.0);
      deck1.setVolume(0.0);

      const crossfadePromise = manager.performCrossfade(
        deck0,
        deck1,
        { duration: 4 },
        undefined, // no WebAudio pipeline (Capacitor / mobile)
        0,
        1.0
      );

      await crossfadePromise;

      // In background, handover must be immediate: incoming deck at full masterVolume, outgoing paused and silenced
      expect(deck1.element.volume).toBe(1.0);
      expect(deck0.element.volume).toBe(0.0);
      expect(deck0.element.paused).toBe(true);
      expect(manager.getIsTransitioning()).toBe(false);

      // Restore document.hidden
      Object.defineProperty(document, 'hidden', {
        value: false,
        configurable: true,
        writable: true,
      });

      deck0.destroy();
      deck1.destroy();
      manager.destroy();
    });
  });
});
