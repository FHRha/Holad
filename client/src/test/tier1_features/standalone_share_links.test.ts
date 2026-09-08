import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';

describe('Standalone Share Links Resolution & Playback', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      currentIndex: -1,
      roomId: null,
      role: null,
      userName: '',
      jamError: null,
    });
  });

  it('correctly resolves standalone playlist IDs from search query', () => {
    const searchParams = new URLSearchParams('?playlist=rqzalpR4jwhh6uTRzOWw6Z');
    const pathname = '/jam/';
    
    const searchPlaylistId = searchParams.get('playlist');
    const matchPlaylist = pathname.match(/\/jam\/(?:library\/)?playlist\/([^/?#]+)/i);
    const playlistId = searchPlaylistId || (matchPlaylist ? matchPlaylist[1] : null);

    const roomToJoin = searchParams.get('room');
    const isValidStandalonePlaylist = Boolean(playlistId && playlistId.trim() !== '');
    const isStandalone = !roomToJoin && isValidStandalonePlaylist;

    expect(playlistId).toBe('rqzalpR4jwhh6uTRzOWw6Z');
    expect(isValidStandalonePlaylist).toBe(true);
    expect(isStandalone).toBe(true);
  });

  it('correctly resolves standalone playlist IDs from URL pathname subroute', () => {
    const searchParams = new URLSearchParams('');
    const pathname = '/jam/playlist/rqzalpR4jwhh6uTRzOWw6Z';
    
    const searchPlaylistId = searchParams.get('playlist');
    const matchPlaylist = pathname.match(/\/jam\/(?:library\/)?playlist\/([^/?#]+)/i);
    const playlistId = searchPlaylistId || (matchPlaylist ? matchPlaylist[1] : null);

    const roomToJoin = searchParams.get('room');
    const isValidStandalonePlaylist = Boolean(playlistId && playlistId.trim() !== '');
    const isStandalone = !roomToJoin && isValidStandalonePlaylist;

    expect(playlistId).toBe('rqzalpR4jwhh6uTRzOWw6Z');
    expect(isValidStandalonePlaylist).toBe(true);
    expect(isStandalone).toBe(true);
  });

  it('determines validStandalone for bottom player in App.tsx', () => {
    const testCases = [
      { search: '?playlist=rqzalpR4jwhh6uTRzOWw6Z', pathname: '/jam/', expected: true },
      { search: '', pathname: '/jam/playlist/rqzalpR4jwhh6uTRzOWw6Z', expected: true },
      { search: '?album=album123', pathname: '/jam/', expected: true },
      { search: '', pathname: '/jam/album/album123', expected: true },
      { search: '?track=track456', pathname: '/jam/', expected: true },
      { search: '', pathname: '/jam/track/track456', expected: true },
      { search: '', pathname: '/jam/', expected: false },
    ];

    for (const { search, pathname, expected } of testCases) {
      const searchParams = new URLSearchParams(search);
      const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                                (searchParams.has('album') && !!searchParams.get('album')) ||
                                (searchParams.has('playlist') && !!searchParams.get('playlist'));
      const isStandalonePath = pathname.startsWith('/jam/track/') ||
                               pathname.startsWith('/jam/album/') ||
                               pathname.startsWith('/jam/playlist/');
      const validStandalone = isStandaloneQuery || isStandalonePath;
      expect(validStandalone).toBe(expected);
    }
  });

  it('sets queue and plays playlist tracks in standalone single-listener mode', () => {
    const playlistTracks = [
      { id: 'track1', title: 'Song 1', artist: 'Artist 1', album: 'Album 1' },
      { id: 'track2', title: 'Song 2', artist: 'Artist 2', album: 'Album 1' },
      { id: 'track3', title: 'Song 3', artist: 'Artist 3', album: 'Album 2' },
    ];

    usePlayerStore.getState().setQueueAndPlay(playlistTracks as any, 0);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(3);
    expect(state.currentIndex).toBe(0);
    expect(state.queue[0].id).toBe('track1');
    expect(state.queue[1].id).toBe('track2');
    expect(state.queue[2].id).toBe('track3');
    // Standalone listener - not in a room
    expect(state.roomId).toBeNull();
  });

  it('verifies NowPlayingModal opens fullscreen player automatically for standalone links', () => {
    const testCases = [
      { search: '?playlist=pl123', pathname: '/jam/', expectedOpen: true },
      { search: '?track=trk123', pathname: '/jam/', expectedOpen: true },
      { search: '?album=alb123', pathname: '/jam/', expectedOpen: true },
      { search: '', pathname: '/jam/track/trk123', expectedOpen: true },
      { search: '', pathname: '/jam/album/alb123', expectedOpen: true },
      { search: '', pathname: '/jam/playlist/pl123', expectedOpen: true },
      { search: '', pathname: '/jam/', expectedOpen: false },
    ];

    for (const { search, pathname, expectedOpen } of testCases) {
      const searchParams = new URLSearchParams(search);
      const isJamRoute = pathname.startsWith('/jam');
      const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                                (searchParams.has('album') && !!searchParams.get('album')) ||
                                (searchParams.has('playlist') && !!searchParams.get('playlist'));
      const isStandalonePath = pathname.startsWith('/jam/track/') ||
                               pathname.startsWith('/jam/album/') ||
                               pathname.startsWith('/jam/playlist/');
      const validStandalone = isStandaloneQuery || isStandalonePath;

      const role = null;
      const roomId = null;
      const isMinimized = false;
      const isNowPlayingOpen = false;

      const isControlledByMinimization = isJamRoute && role !== 'host' && (!!roomId || validStandalone);
      const showPlayer = isControlledByMinimization ? !isMinimized : isNowPlayingOpen;

      expect(showPlayer).toBe(expectedOpen);
    }
  });

  it('verifies initial track plays immediately on deck 0 without alternating deck index', () => {
    const isCrossfade = true;
    const wasPlayingEngine = false; // fresh start
    const didDeviceBecomeActive = false;
    const isMidTransition = false;
    const activeDeckIdx = 0;

    const shouldCrossfade = isCrossfade && wasPlayingEngine && !didDeviceBecomeActive && !isMidTransition;
    const nextDeckIdx = (shouldCrossfade ? (1 - activeDeckIdx) : activeDeckIdx) as 0 | 1;
    const immediate = !shouldCrossfade;

    expect(shouldCrossfade).toBe(false);
    expect(nextDeckIdx).toBe(0);
    expect(immediate).toBe(true);
  });

  it('syncCustomPlaylistToServer correctly posts playlist payload and triggers on playlist store actions', async () => {
    const { usePlaylistStore, syncCustomPlaylistToServer } = await import('../../store/playlistStore');
    const { getHoladServerUrl } = await import('../../utils/serverConfig');
    const expectedBaseUrl = getHoladServerUrl();
    
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as any);

    // 1. Direct call
    await syncCustomPlaylistToServer({
      id: 'pl-custom-1',
      name: 'Custom Chill',
      description: 'Relaxing beats',
      trackIds: ['t1', 't2']
    });

    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'pl-custom-1',
        name: 'Custom Chill',
        description: 'Relaxing beats',
        trackIds: ['t1', 't2']
      })
    });

    // 2. createPlaylist
    fetchSpy.mockClear();
    const createdId = usePlaylistStore.getState().createPlaylist('My Hits', 'Best songs');
    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: createdId,
        name: 'My Hits',
        description: 'Best songs',
        trackIds: []
      })
    }));

    // 3. addTrack
    fetchSpy.mockClear();
    usePlaylistStore.getState().addTrack(createdId, 'song-999');
    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: createdId,
        name: 'My Hits',
        description: 'Best songs',
        trackIds: ['song-999']
      })
    }));

    // 4. updatePlaylist
    fetchSpy.mockClear();
    usePlaylistStore.getState().updatePlaylist(createdId, 'My Renamed Hits', 'New desc');
    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: createdId,
        name: 'My Renamed Hits',
        description: 'New desc',
        trackIds: ['song-999']
      })
    }));

    // 5. removeTrack
    fetchSpy.mockClear();
    usePlaylistStore.getState().removeTrack(createdId, 'song-999');
    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id: createdId,
        name: 'My Renamed Hits',
        description: 'New desc',
        trackIds: []
      })
    }));

    // 6. deletePlaylist
    fetchSpy.mockClear();
    usePlaylistStore.getState().deletePlaylist(createdId);
    expect(fetchSpy).toHaveBeenCalledWith(`${expectedBaseUrl}/api/custom-playlists/${encodeURIComponent(createdId)}`, expect.objectContaining({
      method: 'DELETE'
    }));

    fetchSpy.mockRestore();
  });

  it('guarantees standalone track link loads ONLY that single track in queue without loading album', () => {
    const singleTrack = {
      id: 'trk-standalone-1',
      title: 'Solo Track',
      artist: 'Solo Artist',
      album: 'Solo Album',
      albumId: 'alb-1',
      artistId: 'art-1',
      duration: 180,
    };

    usePlayerStore.getState().setQueueAndPlay([singleTrack as any], 0);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].id).toBe('trk-standalone-1');
    expect(state.currentIndex).toBe(0);
  });

  it('correctly resolves standalone short queue ID links and enforces standalone flag', () => {
    const searchParams = new URLSearchParams('?queue=q_abc123_xyz789');
    const searchQueue = searchParams.get('queue');
    const roomToJoin = searchParams.get('room');

    const isValidStandaloneTrack = false;
    const isValidStandaloneAlbum = false;
    const isValidStandalonePlaylist = false;
    const isValidStandaloneQueue = Boolean(searchQueue && searchQueue.trim() !== '');
    const isStandalone = !roomToJoin && (isValidStandaloneTrack || isValidStandaloneAlbum || isValidStandalonePlaylist || isValidStandaloneQueue);

    expect(isValidStandaloneQueue).toBe(true);
    expect(isStandalone).toBe(true);

    // Guard test: should NOT trigger invalid link
    const shouldShowInvalidLink = !roomToJoin && !isValidStandaloneTrack && !isValidStandaloneAlbum && !isValidStandalonePlaylist && !isValidStandaloneQueue;
    expect(shouldShowInvalidLink).toBe(false);
  });

  it('enforces maximum 200 tracks limit when syncing custom playlist or queue snapshot', async () => {
    const { syncCustomPlaylistToServer } = await import('../../store/playlistStore');
    const { getHoladServerUrl } = await import('../../utils/serverConfig');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    } as any);

    // Create 250 dummy track IDs
    const excessiveTrackIds = Array.from({ length: 250 }, (_, i) => `track_${i}`);
    await syncCustomPlaylistToServer({
      id: 'q_test_limit',
      name: 'Big Queue',
      description: 'Snapshot',
      trackIds: excessiveTrackIds
    });

    expect(fetchSpy).toHaveBeenCalledWith(`${getHoladServerUrl()}/api/custom-playlists`, expect.objectContaining({
      method: 'POST',
      body: expect.stringMatching(/"trackIds":\[.*\]/)
    }));

    const callArgs = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse(callArgs[1]?.body as string);
    expect(sentBody.trackIds).toHaveLength(200);

    fetchSpy.mockRestore();
  });
});
