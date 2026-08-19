import { describe, it, expect } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';

describe('playerStore', () => {
  it('initializes with default state combined from all slices', () => {
    const state = usePlayerStore.getState();
    // From playbackSlice
    expect(state.volume).toBeDefined();
    // From queueSlice
    expect(state.queue).toBeDefined();
    expect(state.originalQueue).toBeDefined();
    expect(state.currentIndex).toBe(-1);
    // From jamSlice
    expect(state.roomId).toBeNull();
    // From socialSlice
    expect(state.likedTrackIds).toBeDefined();
    expect(state.likedAlbumIds).toBeDefined();
    // From playlistSlice
    expect(state.localPlaylists).toBeDefined();
  });
});

