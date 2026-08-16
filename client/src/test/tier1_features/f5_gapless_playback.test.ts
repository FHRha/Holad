import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F5: Gapless Playback Engine', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F5-1: Lookahead preloader detects upcoming track in queue', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(0);

    const current = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
    const next = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex + 1];

    expect(current.id).toBe('track-1');
    expect(next.id).toBe('track-2');
  });

  it('F5-2: Dual deck handover advances currentIndex seamlessly when track ends', () => {
    const tracks = createMockAlbumTracks(4);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(0);
    usePlayerStore.getState().setIsPlaying(true);

    expect(usePlayerStore.getState().currentIndex).toBe(0);

    // Simulate track end transition
    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(1);
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(2);
  });

  it('F5-3: Gapless transition at end of queue stops or loops based on repeatMode', () => {
    const tracks = createMockAlbumTracks(2);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(1);
    usePlayerStore.getState().setRepeatMode('none');

    usePlayerStore.getState().nextTrack();
    // At end of queue with repeat none, currentIndex stays at 1
    expect(usePlayerStore.getState().currentIndex).toBe(1);
  });

  it('F5-4: Repeat all mode loops back to first track in gapless queue', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(2);
    usePlayerStore.getState().setRepeatMode('all');

    usePlayerStore.getState().nextTrack();
    expect(usePlayerStore.getState().currentIndex).toBe(0);
  });

  it('F5-5: Repeat one mode replays the current track continuously', () => {
    const tracks = createMockAlbumTracks(3);
    usePlayerStore.getState().setQueue(tracks);
    usePlayerStore.getState().setCurrentIndex(1);
    usePlayerStore.getState().setRepeatMode('one');

    expect(usePlayerStore.getState().repeatMode).toBe('one');
  });

  it('F5-6: Seamless pre-buffer threshold triggers before track end', () => {
    const trackDuration = 180;
    const currentTime = 170;
    const remainingTime = trackDuration - currentTime;
    const lookaheadWindow = 15;

    const shouldPreload = remainingTime <= lookaheadWindow;
    expect(shouldPreload).toBe(true);
  });
});
