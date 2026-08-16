import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { createMockTrack, createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B3: Queue Boundary States', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B3-1: Empty queue initialization safely handles nextTrack and prevTrack', () => {
    const store = usePlayerStore.getState();
    expect(store.queue.length).toBe(0);
    expect(store.isPlaying).toBe(false);

    expect(() => store.nextTrack()).not.toThrow();
    expect(() => store.prevTrack()).not.toThrow();
  });

  it('B3-2: Single track queue prev/next stays at index 0 or loops depending on mode', () => {
    const track = createMockTrack('solo', 'Single Track');
    usePlayerStore.getState().setQueue([track]);

    expect(usePlayerStore.getState().queue.length).toBe(1);
    expect(usePlayerStore.getState().currentIndex).toBe(0);

    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);

    usePlayerStore.getState().prevTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it('B3-3: Restoring saved queue from storage preserves track list and initial position', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(1);
    usePlayerStore.getState().setInitialPosition(45000); // 45s

    expect(usePlayerStore.getState().queue.length).toBe(3);
    expect(usePlayerStore.getState().currentIndex).toBe(1);
    expect(usePlayerStore.getState().initialPosition).toBe(45000);
  });

  it('B3-4: Remote sync queue update seamlessly replaces queue without unhandled errors', () => {
    const initialTracks = createMockAlbumTracks(2);
    usePlayerStore.getState().setQueue(initialTracks);

    const newRemoteTracks = createMockAlbumTracks(5);
    usePlayerStore.getState().setQueue(newRemoteTracks);
    usePlayerStore.getState().setCurrentIndex(3);

    expect(usePlayerStore.getState().queue.length).toBe(5);
    expect(usePlayerStore.getState().currentIndex).toBe(3);
  });

  it('B3-5: Clearing queue empties list and resets currentIndex to -1', () => {
    usePlayerStore.getState().setQueue(createMockAlbumTracks(3));
    usePlayerStore.getState().setCurrentIndex(1);
    usePlayerStore.getState().clearQueue();

    expect(usePlayerStore.getState().queue.length).toBe(0);
    expect(usePlayerStore.getState().currentIndex).toBe(-1);
  });

  it('B3-6: Removing current track from queue safely shifts or preserves valid index', () => {
    usePlayerStore.getState().setQueue(createMockAlbumTracks(3));
    usePlayerStore.getState().setCurrentIndex(1); // at index 1

    usePlayerStore.getState().removeFromQueue(1);
    expect(usePlayerStore.getState().queue.length).toBe(2);
    expect(usePlayerStore.getState().currentIndex).toBeLessThanOrEqual(1);
  });
});
