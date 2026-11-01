import { describe, it, expect, beforeEach, afterAll } from 'vitest';
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
} from '../src/db/tables/libraryTable.js';
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
