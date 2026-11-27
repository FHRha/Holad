import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import {
  upsertTracksBatch,
  upsertAlbumsBatch,
  upsertArtistsBatch,
  queryTracks,
  queryAlbums,
  queryArtists,
  searchTracksFts,
  getSyncState,
  setSyncState,
  getLibraryStats,
  clearLibrary,
  pruneDeletedTracks,
  pruneDeletedAlbums,
  pruneDeletedArtists,
} from '../src/db/tables/libraryTable.js';
import {
  saveNavidromeAccount,
  deleteNavidromeAccount,
} from '../src/db/tables/accountsTable.js';
import { librarySyncService } from '../src/library/LibrarySyncService.js';
import { app } from '../index.js';

describe('Holad Media Engine - SQLite Library Cache & CRUD', () => {
  beforeEach(() => {
    clearLibrary();
  });

  afterAll(() => {
    librarySyncService.stopBackgroundSync();
  });

  it('should batch upsert and query tracks with pagination and sorting', () => {
    const testTracks = [
      {
        id: 't-1',
        title: 'Karma Police',
        artist: 'Radiohead',
        artist_id: 'art-1',
        album: 'OK Computer',
        album_id: 'alb-1',
        duration: 261,
        track_number: 6,
        disc_number: 1,
        year: 1997,
        genre: 'Alternative',
        cover_art: 'cover-1',
      },
      {
        id: 't-2',
        title: 'Paranoid Android',
        artist: 'Radiohead',
        artist_id: 'art-1',
        album: 'OK Computer',
        album_id: 'alb-1',
        duration: 383,
        track_number: 2,
        disc_number: 1,
        year: 1997,
        genre: 'Alternative',
        cover_art: 'cover-1',
      },
      {
        id: 't-3',
        title: 'No Surprises',
        artist: 'Radiohead',
        artist_id: 'art-1',
        album: 'OK Computer',
        album_id: 'alb-1',
        duration: 228,
        track_number: 10,
        disc_number: 1,
        year: 1997,
        genre: 'Alternative',
        cover_art: 'cover-1',
      },
    ];

    upsertTracksBatch(testTracks);

    // Verify stats
    const stats = getLibraryStats();
    expect(stats.totalTracks).toBe(3);

    // Query sorted by title asc
    const resTitleAsc = queryTracks({ sort: 'title', order: 'asc' });
    expect(resTitleAsc.total).toBe(3);
    expect(resTitleAsc.tracks[0]?.title).toBe('Karma Police');
    expect(resTitleAsc.tracks[1]?.title).toBe('No Surprises');
    expect(resTitleAsc.tracks[2]?.title).toBe('Paranoid Android');

    // Query sorted by duration desc
    const resDurDesc = queryTracks({ sort: 'duration', order: 'desc' });
    expect(resDurDesc.tracks[0]?.title).toBe('Paranoid Android');
    expect(resDurDesc.tracks[0]?.duration).toBe(383);

    // Pagination
    const resPaging = queryTracks({ limit: 2, offset: 1, sort: 'title', order: 'asc' });
    expect(resPaging.tracks.length).toBe(2);
    expect(resPaging.tracks[0]?.title).toBe('No Surprises');
    expect(resPaging.total).toBe(3);

    // Update via upsert
    upsertTracksBatch([
      {
        id: 't-1',
        title: 'Karma Police (Remastered 2017)',
        artist: 'Radiohead',
        album: 'OK Computer OKNOTOK',
        duration: 263,
      },
    ]);
    const updated = queryTracks({ search: 'Karma Police' });
    expect(updated.tracks[0]?.title).toBe('Karma Police (Remastered 2017)');
    expect(updated.tracks[0]?.duration).toBe(263);
    expect(getLibraryStats().totalTracks).toBe(3);
  });

  it('should perform FTS5 full-text search with prefix matching and special characters', () => {
    upsertTracksBatch([
      {
        id: 'fts-1',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
      },
      {
        id: 'fts-2',
        title: 'Under Pressure',
        artist: 'Queen & David Bowie',
        album: 'Hot Space',
      },
      {
        id: 'fts-3',
        title: 'Space Oddity',
        artist: 'David Bowie',
        album: 'Space Oddity',
      },
    ]);

    // Search by title prefix
    const bohem = searchTracksFts('Bohem');
    expect(bohem.length).toBe(1);
    expect(bohem[0]?.title).toBe('Bohemian Rhapsody');

    // Search by artist
    const queenTracks = searchTracksFts('Queen');
    expect(queenTracks.length).toBe(2);

    // Search with special characters (parentheses, quotes, symbols) without breaking SQL/FTS syntax
    const specialSearch = searchTracksFts('David (Bowie) "Space" *');
    expect(specialSearch.length).toBeGreaterThanOrEqual(1);

    // Empty query returns empty array
    expect(searchTracksFts('')).toEqual([]);
  });

  it('should batch upsert and query albums and artists', () => {
    upsertAlbumsBatch([
      {
        id: 'alb-1',
        name: 'The Dark Side of the Moon',
        artist: 'Pink Floyd',
        year: 1973,
        song_count: 10,
        duration: 2580,
      },
      {
        id: 'alb-2',
        name: 'Wish You Were Here',
        artist: 'Pink Floyd',
        year: 1975,
        song_count: 5,
        duration: 2640,
      },
    ]);

    upsertArtistsBatch([
      {
        id: 'art-1',
        name: 'Pink Floyd',
        album_count: 15,
        starred: 1,
      },
      {
        id: 'art-2',
        name: 'Led Zeppelin',
        album_count: 9,
        starred: 0,
      },
    ]);

    const stats = getLibraryStats();
    expect(stats.totalAlbums).toBe(2);
    expect(stats.totalArtists).toBe(2);

    const albumsRes = queryAlbums({ sort: 'year', order: 'asc' });
    expect(albumsRes.albums[0]?.name).toBe('The Dark Side of the Moon');
    expect(albumsRes.albums[1]?.name).toBe('Wish You Were Here');

    const artistsRes = queryArtists({ search: 'Pink' });
    expect(artistsRes.artists.length).toBe(1);
    expect(artistsRes.artists[0]?.name).toBe('Pink Floyd');
    expect(artistsRes.artists[0]?.starred).toBe(1);
  });

  it('should store and retrieve library sync state', () => {
    setSyncState({
      id: 'default',
      user_id: 'test_user',
      status: 'completed',
      progress: 100,
      total_tracks: 500,
      total_albums: 40,
      total_artists: 20,
      last_sync_time: 1700000000000,
      error: null,
    });

    const state = getSyncState('test_user');
    expect(state).not.toBeNull();
    expect(state?.status).toBe('completed');
    expect(state?.progress).toBe(100);
    expect(state?.total_tracks).toBe(500);
  });

  it('should prune deleted tracks, albums, and artists scoped by user_id', () => {
    upsertTracksBatch([
      { id: 'p-t1', user_id: 'userA', title: 'Keep Track' },
      { id: 'p-t2', user_id: 'userA', title: 'Delete Track' },
      { id: 'p-t3', user_id: 'userB', title: 'Other User Track' },
    ]);
    upsertAlbumsBatch([
      { id: 'p-a1', user_id: 'userA', name: 'Keep Album' },
      { id: 'p-a2', user_id: 'userA', name: 'Delete Album' },
      { id: 'p-a3', user_id: 'userB', name: 'Other User Album' },
    ]);
    upsertArtistsBatch([
      { id: 'p-art1', user_id: 'userA', name: 'Keep Artist' },
      { id: 'p-art2', user_id: 'userA', name: 'Delete Artist' },
      { id: 'p-art3', user_id: 'userB', name: 'Other User Artist' },
    ]);

    const prunedTracks = pruneDeletedTracks('userA', ['p-t1']);
    const prunedAlbums = pruneDeletedAlbums('userA', ['p-a1']);
    const prunedArtists = pruneDeletedArtists('userA', ['p-art1']);

    expect(prunedTracks).toBe(1);
    expect(prunedAlbums).toBe(1);
    expect(prunedArtists).toBe(1);

    const userATracks = queryTracks({ userId: 'userA' });
    expect(userATracks.tracks.map((t) => t.id)).toEqual(['p-t1']);

    const userBTracks = queryTracks({ userId: 'userB' });
    expect(userBTracks.tracks.map((t) => t.id)).toEqual(['p-t3']);

    const userAAlbums = queryAlbums({ userId: 'userA' });
    expect(userAAlbums.albums.map((a) => a.id)).toEqual(['p-a1']);

    const userAArtists = queryArtists({ userId: 'userA' });
    expect(userAArtists.artists.map((a) => a.id)).toEqual(['p-art1']);
  });

  it('should sync all configured accounts, prune deleted items, and emit holad_libraryUpdated', async () => {
    const mockUrl1 = 'http://sync-test-1.local';
    const mockUrl2 = 'http://sync-test-2.local';
    saveNavidromeAccount({ url: mockUrl1, user: 'sync_u1', token: 't1', salt: 's1' });
    saveNavidromeAccount({ url: mockUrl2, user: 'sync_u2', token: 't2', salt: 's2' });

    const emitSpy = vi.fn();
    librarySyncService.setIo({ emit: emitSpy } as any);

    let pass = 1;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = String(input);
      const isAcc1 = urlStr.includes('sync-test-1.local');

      if (urlStr.includes('getArtists.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              artists: {
                index: [
                  {
                    artist: isAcc1
                      ? [{ id: 'art-1', name: 'Artist One', albumCount: 1 }]
                      : [{ id: 'art-2', name: 'Artist Two', albumCount: 1 }],
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('getAlbumList2.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              albumList2: {
                album: isAcc1
                  ? [{ id: 'alb-1', name: 'Album One', artist: 'Artist One', artistId: 'art-1', songCount: 2 }]
                  : [{ id: 'alb-2', name: 'Album Two', artist: 'Artist Two', artistId: 'art-2', songCount: 1 }],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('search3.view')) {
        const songsAcc1 =
          pass === 1
            ? [
                { id: 'song-1', title: 'Song One', artist: 'Artist One', artistId: 'art-1', album: 'Album One', albumId: 'alb-1', duration: 120 },
                { id: 'song-deleted', title: 'Removed Song', artist: 'Artist One', artistId: 'art-1', album: 'Album One', albumId: 'alb-1', duration: 90 },
              ]
            : [
                { id: 'song-1', title: 'Song One', artist: 'Artist One', artistId: 'art-1', album: 'Album One', albumId: 'alb-1', duration: 120 },
              ];
        const songsAcc2 = [
          { id: 'song-2', title: 'Song Two', artist: 'Artist Two', artistId: 'art-2', album: 'Album Two', albumId: 'alb-2', duration: 150 },
        ];
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              searchResult3: { song: isAcc1 ? songsAcc1 : songsAcc2 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (urlStr.includes('getScanStatus.view')) {
        return new Response(
          JSON.stringify({
            'subsonic-response': {
              status: 'ok',
              scanStatus: { scanning: false, count: pass === 1 ? 2 : 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      throw new Error(`Unexpected fetch URL in test: ${urlStr}`);
    });

    try {
      await librarySyncService.runSync({ isManual: false });
      expect(queryTracks({ userId: 'sync_u1' }).total).toBe(2);
      expect(queryTracks({ userId: 'sync_u2' }).total).toBe(1);
      expect(emitSpy).toHaveBeenCalledWith(
        'holad_libraryUpdated',
        expect.objectContaining({ totalTracks: 3, totalAlbums: 2 })
      );

      emitSpy.mockClear();
      pass = 2;
      await librarySyncService.runSync({ isManual: false });
      const remainingU1 = queryTracks({ userId: 'sync_u1' });
      expect(remainingU1.total).toBe(1);
      expect(remainingU1.tracks[0]?.id).toBe('song-1');
      expect(emitSpy).toHaveBeenCalledWith(
        'holad_libraryUpdated',
        expect.objectContaining({ totalTracks: 2, totalAlbums: 2 })
      );
    } finally {
      fetchSpy.mockRestore();
      deleteNavidromeAccount('sync_u1', mockUrl1);
      deleteNavidromeAccount('sync_u2', mockUrl2);
      clearLibrary();
    }
  });
});

describe('Holad Media Engine - REST API Endpoints', () => {
  beforeEach(() => {
    clearLibrary();
    upsertTracksBatch([
      {
        id: 'rest-t1',
        title: 'Around the World',
        artist: 'Daft Punk',
        album: 'Homework',
        duration: 429,
        year: 1997,
        genre: 'Electronic',
      },
      {
        id: 'rest-t2',
        title: 'One More Time',
        artist: 'Daft Punk',
        album: 'Discovery',
        duration: 320,
        year: 2001,
        genre: 'Electronic',
      },
    ]);

    upsertAlbumsBatch([
      {
        id: 'rest-a1',
        name: 'Discovery',
        artist: 'Daft Punk',
        year: 2001,
        song_count: 14,
      },
    ]);

    upsertArtistsBatch([
      {
        id: 'rest-art1',
        name: 'Daft Punk',
        album_count: 4,
      },
    ]);
  });

  afterAll(() => {
    librarySyncService.stopBackgroundSync();
  });

  it('should return tracks via GET /api/library/tracks and /Holad/api/library/tracks', async () => {
    const res1 = await request(app).get('/api/library/tracks?sort=title&order=asc');
    expect(res1.status).toBe(200);
    expect(res1.body).toHaveProperty('tracks');
    expect(res1.body.tracks.length).toBe(2);
    expect(res1.body.total).toBe(2);
    expect(res1.body.tracks[0].title).toBe('Around the World');

    const res2 = await request(app).get('/Holad/api/library/tracks?search=Discovery');
    expect(res2.status).toBe(200);
    expect(res2.body.tracks.length).toBe(1);
    expect(res2.body.tracks[0].title).toBe('One More Time');
  });

  it('should return albums via GET /api/library/albums', async () => {
    const res = await request(app).get('/api/library/albums');
    expect(res.status).toBe(200);
    expect(res.body.albums.length).toBe(1);
    expect(res.body.albums[0].name).toBe('Discovery');
  });

  it('should return artists via GET /api/library/artists', async () => {
    const res = await request(app).get('/api/library/artists');
    expect(res.status).toBe(200);
    expect(res.body.artists.length).toBe(1);
    expect(res.body.artists[0].name).toBe('Daft Punk');
  });

  it('should return library status via GET /api/library/status', async () => {
    const res = await request(app).get('/api/library/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('total_tracks');
    expect(res.body.total_tracks).toBe(2);
    expect(res.body.total_albums).toBe(1);
    expect(res.body.total_artists).toBe(1);
  });

  it('should trigger sync on POST /api/library/sync and enforce cooldown / rate-limiting', async () => {
    const res1 = await request(app).post('/api/library/sync');
    // Can be 202 (started) or 409 (if still running)
    expect([202, 409]).toContain(res1.status);

    // Rapid secondary request triggers 409 (if syncing) or 429 (if completed but within 30s cooldown)
    const res2 = await request(app).post('/api/library/sync');
    expect([202, 409, 429]).toContain(res2.status);
    if (res2.status === 429) {
      expect(res2.body).toHaveProperty('retryAfter');
    }
  });
});
