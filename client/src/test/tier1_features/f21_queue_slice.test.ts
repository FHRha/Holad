import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { Track } from '../../types';

describe('queueSlice', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      isShuffle: false,
    });
  });

  const mockTrack1: Track = { id: 't1', title: 'Track 1', url: 'url1', duration: 100, artist: 'a1', artistId: 'a1', album: 'al1', albumId: 'al1', artwork: '' };
  const mockTrack2: Track = { id: 't2', title: 'Track 2', url: 'url2', duration: 200, artist: 'a2', artistId: 'a2', album: 'al2', albumId: 'al2', artwork: '' };
  const mockTrack3: Track = { id: 't3', title: 'Track 3', url: 'url3', duration: 300, artist: 'a3', artistId: 'a3', album: 'al3', albumId: 'al3', artwork: '' };

  it('sets queue correctly', () => {
    usePlayerStore.getState().setQueue([mockTrack1, mockTrack2]);
    const state = usePlayerStore.getState();
    expect(state.queue.length).toBe(2);
    expect(state.originalQueue.length).toBe(2);
    expect(state.currentIndex).toBe(0);
    expect(state.isShuffle).toBe(false);
  });

  it('addToQueue appends tracks', () => {
    usePlayerStore.getState().setQueue([mockTrack1]);
    usePlayerStore.getState().addToQueue([mockTrack2]);
    
    const state = usePlayerStore.getState();
    expect(state.queue.length).toBe(2);
    expect(state.queue[1].id).toBe('t2');
  });

  it('reorders queue', () => {
    usePlayerStore.getState().setQueue([mockTrack1, mockTrack2, mockTrack3]);
    usePlayerStore.getState().reorderQueue(0, 2);
    const state = usePlayerStore.getState();
    expect(state.queue[2].id).toBe('t1');
    expect(state.queue[0].id).toBe('t2');
  });

  describe('Fisher-Yates Shuffle Logic', () => {
    it('toggles shuffle on and applies Fisher-Yates shuffle keeping current track at index 0', () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      usePlayerStore.getState().setQueue([mockTrack1, mockTrack2, mockTrack3]);
      usePlayerStore.getState().setCurrentIndex(1); // Track 2 is currently playing

      usePlayerStore.getState().toggleShuffle();
      
      const state = usePlayerStore.getState();
      expect(state.isShuffle).toBe(true);
      expect(state.currentIndex).toBe(0); // Current track moves to 0
      expect(state.queue[0].id).toBe('t2'); // mockTrack2
      
      expect(state.originalQueue.length).toBe(3);
      
      randomSpy.mockRestore();
    });

    it('toggles shuffle off and restores original queue', () => {
      usePlayerStore.getState().setQueue([mockTrack1, mockTrack2, mockTrack3]);
      
      usePlayerStore.getState().toggleShuffle();
      usePlayerStore.getState().toggleShuffle();
      
      const state = usePlayerStore.getState();
      expect(state.isShuffle).toBe(false);
      expect(state.queue[0].id).toBe('t1');
    });
  });
});
