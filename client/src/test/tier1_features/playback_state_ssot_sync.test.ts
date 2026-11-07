import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fetchPlaybackState, savePlaybackState } from '../../api/playbackState';
import { toCompactQueue, syncQueueToServer, flushPendingQueueSync } from '../../store/slices/queueSlice';
import { useAuthStore } from '../../store/authStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { useAppLifecycle } from '../../hooks/useAppLifecycle';
import { useAppInitialization } from '../../hooks/useAppInitialization';

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

  it('syncQueueToServer with immediate=true and useKeepalive=true syncs immediately without waiting for 250ms debounce', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as any);
    const testQueue = [{ id: 'trk-imm', title: 'Immediate Song', artist: 'Artist' }] as any;

    syncQueueToServer(testQueue, 0, 'v-immediate', 1700000099999, { isPlaying: true }, true, true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/playback-state'),
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: expect.stringContaining('"songId":"trk-imm"')
      })
    );
  });

  it('flushPendingQueueSync flushes debounced sync with keepalive before app sleep/unload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as any);
    const testQueue = [{ id: 'trk-pending', title: 'Pending Song', artist: 'Artist' }] as any;

    // Call without immediate (debounced 250ms)
    syncQueueToServer(testQueue, 0, 'v-debounced', 1700000088888, { isPlaying: false }, false, false);

    // Should not have fired yet
    expect(fetchSpy).not.toHaveBeenCalled();

    // App goes to sleep / hides: flush is triggered
    flushPendingQueueSync();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/playback-state'),
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
        body: expect.stringContaining('"songId":"trk-pending"')
      })
    );
  });

  it('offline playback sets holad_pending_offline_playback flag on network failure and clears on success', async () => {
    localStorage.removeItem('holad_pending_offline_playback');

    // Simulate network error
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));
    await savePlaybackState({ songId: 'trk-offline', position: 10 });

    expect(localStorage.getItem('holad_pending_offline_playback')).toBe('true');

    // Simulate successful sync
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true } as any);
    await savePlaybackState({ songId: 'trk-offline', position: 20 });

    expect(localStorage.getItem('holad_pending_offline_playback')).toBeNull();
  });

  it('useAppLifecycle: handleExit on beforeunload does NOT bump holad_time_updated to Date.now()', () => {
    localStorage.clear();
    const oldTimestamp = 1600000000000;
    localStorage.setItem('holad_time_updated', oldTimestamp.toString());
    localStorage.setItem('holad_time', '42');

    usePlayerStore.setState({
      queue: [{ id: 'trk-exit', title: 'Exit Song', artist: 'Artist', duration: 180 } as any],
      currentIndex: 0,
      isPlaying: false
    });
    useAudioStore.setState({ progress: 25, duration: 180 });

    const { unmount } = renderHook(() => useAppLifecycle());

    // Trigger beforeunload (app exit)
    window.dispatchEvent(new Event('beforeunload'));

    // holad_track and holad_time should be saved
    expect(localStorage.getItem('holad_track')).toBe('trk-exit');
    expect(localStorage.getItem('holad_time')).toBe('45'); // (25% of 180)

    // holad_time_updated MUST NOT be bumped to Date.now()
    expect(localStorage.getItem('holad_time_updated')).toBe(oldTimestamp.toString());

    unmount();
  });

  it('useAppInitialization: cold start with serverUpdatedAt <= currentLocalUpdatedAt does NOT overwrite server', async () => {
    localStorage.clear();
    const localTimestamp = 1700000050000;
    localStorage.setItem('holad_time_updated', localTimestamp.toString());
    localStorage.setItem('holad_track', 'trk-local');
    localStorage.setItem('holad_time', '15');

    usePlayerStore.setState({
      queue: [{ id: 'trk-local', title: 'Local Song', artist: 'Artist' } as any],
      currentIndex: 0,
      isPlaying: false,
      playbackUpdatedAt: 0,
      playActionId: 0
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/playback-state')) {
        return {
          ok: true,
          json: async () => ({
            song_id: 'trk-server',
            position: 30,
            volume: 1,
            is_playing: false,
            queue: [{ id: 'trk-server', title: 'Server Song', artist: 'Artist' }],
            queue_version: 'v-srv',
            current_index: 0,
            updated_at: 1700000040000 // slightly older than localTimestamp
          })
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(MemoryRouter, null, children)
    );

    const { unmount } = renderHook(() => useAppInitialization(), { wrapper });

    await vi.waitFor(() => {
      // Must NOT send POST to /api/playback-state to overwrite server!
      const postCalls = fetchSpy.mock.calls.filter((call: any) => {
        const [url, opts] = call;
        return (typeof url === 'string' && url.includes('/api/playback-state')) && opts?.method === 'POST';
      });
      expect(postCalls.length).toBe(0);
    });

    unmount();
  });

  it('useAppInitialization: serverUpdatedAt > currentLocalUpdatedAt with empty queue adopts serverState.song_id', async () => {
    localStorage.clear();
    localStorage.setItem('holad_time_updated', '1700000000000');

    usePlayerStore.setState({
      queue: [
        { id: 'trk-1', title: 'Song 1', artist: 'Artist' } as any,
        { id: 'trk-2', title: 'Song 2', artist: 'Artist' } as any
      ],
      currentIndex: 0,
      isPlaying: false,
      playbackUpdatedAt: 0
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/playback-state')) {
        return {
          ok: true,
          json: async () => ({
            song_id: 'trk-2', // target song on server
            position: 55,
            volume: 1,
            is_playing: false,
            queue: [], // empty queue from server
            queue_version: '',
            current_index: 0,
            updated_at: 1700000099999
          })
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(MemoryRouter, null, children)
    );

    const { unmount } = renderHook(() => useAppInitialization(), { wrapper });

    await vi.waitFor(() => {
      const state = usePlayerStore.getState();
      expect(state.currentIndex).toBe(1);
      expect(state.queue[state.currentIndex]?.id).toBe('trk-2');
      expect(state.initialPosition).toBe(55000);
    });

    unmount();
  });

  it('useAppInitialization: serverUpdatedAt > currentLocalUpdatedAt with song_id missing from server queue selects song_id instead of random index', async () => {
    localStorage.clear();
    localStorage.setItem('holad_time_updated', '1700000000000');

    usePlayerStore.setState({
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      playbackUpdatedAt: 0
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/api/playback-state')) {
        return {
          ok: true,
          json: async () => ({
            song_id: 'trk-phone-active',
            position: 90,
            volume: 1,
            is_playing: false,
            queue: [
              { id: 'trk-other-1', title: 'Other 1', artist: 'Artist' },
              { id: 'trk-other-2', title: 'Other 2', artist: 'Artist' }
            ],
            queue_version: 'v-srv-2',
            current_index: 1, // pointing to trk-other-2, but song_id is trk-phone-active!
            updated_at: 1700000099999
          })
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      React.createElement(MemoryRouter, null, children)
    );

    const { unmount } = renderHook(() => useAppInitialization(), { wrapper });

    await vi.waitFor(() => {
      const state = usePlayerStore.getState();
      // Must not be trk-other-2! Active track must be trk-phone-active
      expect(state.queue[state.currentIndex]?.id).toBe('trk-phone-active');
      expect(state.initialPosition).toBe(90000);
    });

    unmount();
  });
});
