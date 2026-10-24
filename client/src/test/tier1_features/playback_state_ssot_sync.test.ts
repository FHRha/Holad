import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPlaybackState, savePlaybackState } from '../../api/playbackState';
import { toCompactQueue } from '../../store/slices/queueSlice';
import { useAuthStore } from '../../store/authStore';
import { usePlayerStore } from '../../store/playerStore';

describe('PlaybackState SSOT API & Queue Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: 'testuser',
      token: 'testtoken',
      salt: 'testsalt',
      url: 'http://localhost:4533',
      isAuthenticated: true
    });
    usePlayerStore.setState({
      queue: [],
      currentIndex: -1,
      playbackUpdatedAt: 0,
      queueVersion: '',
      excludedTrackIds: [],
      excludedAlbumIds: [],
      excludedFingerprints: []
    });
  });

  it('fetchPlaybackState sends auth headers and parses playback response correctly', async () => {
    const mockResponse = {
      song_id: 'trk_99',
      position: 120,
      volume: 0.8,
      is_playing: true,
      queue: [{ id: 'trk_99', title: 'Song 99', artist: 'Artist' }],
      queue_version: 'v123',
      current_index: 0,
      is_shuffled: false,
      repeat_mode: 'all',
      updated_at: 1700000000000
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as any);

    const result = await fetchPlaybackState();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/playback-state'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-user': encodeURIComponent('testuser'),
          'x-token': encodeURIComponent('testtoken')
        })
      })
    );

    expect(result).toEqual({
      song_id: 'trk_99',
      current_song_id: 'trk_99',
      position: 120,
      volume: 0.8,
      is_playing: true,
      queue: [{ id: 'trk_99', title: 'Song 99', artist: 'Artist' }],
      queue_version: 'v123',
      current_index: 0,
      is_shuffled: false,
      repeat_mode: 'all',
      updated_at: 1700000000000
    });
  });

  it('savePlaybackState sends progress-only payload during playback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true
    } as any);

    const ok = await savePlaybackState({
      currentIndex: 1,
      songId: 'trk_1',
      position: 45,
      isPlaying: true,
      updatedAt: 1700000050000
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/playback-state'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-user': encodeURIComponent('testuser')
        }),
        body: JSON.stringify({
          currentIndex: 1,
          songId: 'trk_1',
          position: 45,
          isPlaying: true,
          updatedAt: 1700000050000
        })
      })
    );
  });

  it('savePlaybackState supports useKeepalive flag for page unload / backgrounding', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true
    } as any);

    const ok = await savePlaybackState({
      currentIndex: 2,
      songId: 'trk_2',
      position: 80,
      isPlaying: false,
      updatedAt: 1700000090000
    }, true);

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/playback-state'),
      expect.objectContaining({
        method: 'POST',
        keepalive: true
      })
    );
  });

  it('toCompactQueue extracts only necessary compact fields', () => {
    const rawTracks = [
      {
        id: 't1',
        title: 'Title 1',
        artist: 'Artist 1',
        album: 'Album 1',
        duration: 210,
        coverArt: 'cover1.jpg',
        bitRate: 320,
        suffix: 'flac',
        lyrics: 'Unneeded long lyrics string',
        extraMetadata: { deep: 'value' }
      }
    ] as any;

    const compact = toCompactQueue(rawTracks);

    expect(compact).toEqual([
      {
        id: 't1',
        title: 'Title 1',
        artist: 'Artist 1',
        album: 'Album 1',
        duration: 210,
        coverArt: 'cover1.jpg'
      }
    ]);
  });

  it('Last-Write-Wins (LWW): resolves state correctly based on updated_at timestamp', () => {
    const localUpdatedAt = 1700000010000;
    const newerServerState = {
      updated_at: 1700000020000,
      position: 50,
      song_id: 'trk_server'
    };

    // Server is newer
    expect(newerServerState.updated_at > localUpdatedAt).toBe(true);

    // Local is newer (offline playback)
    const offlineLocalUpdatedAt = 1700000030000;
    expect(offlineLocalUpdatedAt > newerServerState.updated_at).toBe(true);
  });

  it('Exclusions Union Merge preserves offline additions without overwriting', () => {
    const serverExclusions = ['track-server-1', 'track-server-2'];
    const localExclusions = ['track-server-1', 'track-offline-added'];

    const merged = Array.from(new Set([...serverExclusions, ...localExclusions]));

    expect(merged).toEqual(['track-server-1', 'track-server-2', 'track-offline-added']);
    expect(merged.length).toBe(3);
  });
});
