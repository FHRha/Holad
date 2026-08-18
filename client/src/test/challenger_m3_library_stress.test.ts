import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
  registerStarredItems,
  setSimulatedNetworkFailure,
} from './e2e/harness';
import {
  useDownloadStore,
  getDownloadQueueStats,
  isItemDownloaded,
  getOfflineTracks,
} from '../store/downloadStore';
import type { DownloadItem } from '../store/downloadStore';
import { useUIStore } from '../store/uiStore';
import * as subsonicApi from '../api/subsonic';
import {
  downloadEntireLibrary,
  fetchStarredLibrary,
  filterItemsForLibraryDownload,
  handleDownload,
  cancelActiveDownload,
} from '../utils/downloadHelper';
import type { BatchDownloadProgress } from '../utils/downloadHelper';
import DownloadedMusicGrid from '../components/settings/DownloadedMusicGrid';
import Sidebar from '../components/layout/Sidebar';

describe('Milestone 3 Challenger: Batch Library Download & Concurrency Adversarial Stress Suite', () => {
  beforeEach(() => {
    resetE2EHarness();
    setPlatform('tauri');
    setOnline(true);
    useUIStore.setState({ leftSidebarWidth: 160 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Dimension 1: Complex Deduplication Matrices (Completed, Downloading, Queued, Error, Paused, Cancelled)
  // ==========================================================================
  describe('Dimension 1: Multi-State Store Deduplication', () => {
    it('[CHALLENGE-01] Deduplicates items across completed, downloading, queued states, but allows re-queueing of error and cancelled items', () => {
      const downloads: Record<string, DownloadItem> = {
        's-completed': { id: 's-completed', name: 'Song Completed', type: 'track', status: 'completed', progress: 100, path: '/p/1.mp3', timestamp: 1 },
        's-downloading': { id: 's-downloading', name: 'Song Downloading', type: 'track', status: 'downloading', progress: 45, path: '', timestamp: 2 },
        's-queued': { id: 's-queued', name: 'Song Queued', type: 'track', status: 'queued', progress: 0, path: '', timestamp: 3 },
        's-error': { id: 's-error', name: 'Song Error', type: 'track', status: 'error', progress: 0, path: '', error: 'Network timeout', timestamp: 4 },
        's-cancelled': { id: 's-cancelled', name: 'Song Cancelled', type: 'track', status: 'cancelled', progress: 10, path: '', timestamp: 5 },
        's-paused': { id: 's-paused', name: 'Song Paused', type: 'track', status: 'paused', progress: 50, path: '', timestamp: 6 },
        'a-completed': { id: 'a-completed', name: 'Album Completed', type: 'album', status: 'completed', progress: 100, path: '/p/a1', timestamp: 7 },
        'a-downloading': { id: 'a-downloading', name: 'Album Downloading', type: 'album', status: 'downloading', progress: 20, path: '', timestamp: 8 },
        'a-queued': { id: 'a-queued', name: 'Album Queued', type: 'album', status: 'queued', progress: 0, path: '', timestamp: 9 },
        'a-error': { id: 'a-error', name: 'Album Error', type: 'album', status: 'error', progress: 0, path: '', error: 'Disk full', timestamp: 10 },
      };

      const starredSongs = [
        { id: 's-completed', title: 'Song Completed' },
        { id: 's-downloading', title: 'Song Downloading' },
        { id: 's-queued', title: 'Song Queued' },
        { id: 's-error', title: 'Song Error' }, // should be re-queued
        { id: 's-cancelled', title: 'Song Cancelled' }, // should be re-queued
        { id: 's-paused', title: 'Song Paused' }, // should be re-queued
        { id: 's-fresh', title: 'Song Brand New' }, // should be queued
      ];

      const starredAlbums = [
        { id: 'a-completed', title: 'Album Completed' },
        { id: 'a-downloading', title: 'Album Downloading' },
        { id: 'a-queued', title: 'Album Queued' },
        { id: 'a-error', title: 'Album Error' }, // should be re-queued
        { id: 'a-fresh', title: 'Album Brand New' }, // should be queued
      ];

      const result = filterItemsForLibraryDownload(starredSongs, starredAlbums, downloads);

      // Verify Albums: a-error and a-fresh should be queued; completed, downloading, queued skipped
      const queuedAlbumIds = result.albumsToQueue.map(a => a.id);
      expect(queuedAlbumIds).toContain('a-error');
      expect(queuedAlbumIds).toContain('a-fresh');
      expect(queuedAlbumIds).not.toContain('a-completed');
      expect(queuedAlbumIds).not.toContain('a-downloading');
      expect(queuedAlbumIds).not.toContain('a-queued');
      expect(result.albumsToQueue.length).toBe(2);

      // Verify Songs: s-error, s-cancelled, s-paused, s-fresh should be queued
      const queuedSongIds = result.tracksToQueue.map(t => t.id);
      expect(queuedSongIds).toContain('s-error');
      expect(queuedSongIds).toContain('s-cancelled');
      expect(queuedSongIds).toContain('s-paused');
      expect(queuedSongIds).toContain('s-fresh');
      expect(queuedSongIds).not.toContain('s-completed');
      expect(queuedSongIds).not.toContain('s-downloading');
      expect(queuedSongIds).not.toContain('s-queued');
      expect(result.tracksToQueue.length).toBe(4);

      // Total count = 7 songs + 5 albums = 12
      // Queued count = 4 songs + 2 albums = 6
      // Skipped count = 6
      expect(result.totalCount).toBe(12);
      expect(result.skippedCount).toBe(6);
    });

    it('[CHALLENGE-02] Handles malformed and corrupted starred items without crashing or corrupting queue', () => {
      const malformedSongs = [
        null as any,
        undefined as any,
        {}, // missing id
        { id: '', title: 'Empty ID' },
        { id: 'valid-s1', title: undefined, name: 'Fallback Name' },
        { id: 'valid-s2' }, // completely missing title/name
      ];

      const malformedAlbums = [
        null as any,
        undefined as any,
        { id: '' },
        { id: 'valid-a1', title: null, name: null, album: 'Safe Album Title' },
        { id: 'valid-a2' }, // completely missing title/name/album
      ];

      const result = filterItemsForLibraryDownload(malformedSongs, malformedAlbums, {});

      expect(result.albumsToQueue.length).toBe(2);
      expect(result.albumsToQueue[0]).toEqual({ id: 'valid-a1', name: 'Safe Album Title', coverArt: undefined });
      expect(result.albumsToQueue[1]).toEqual({ id: 'valid-a2', name: 'Album', coverArt: undefined });

      expect(result.tracksToQueue.length).toBe(2);
      expect(result.tracksToQueue[0].id).toBe('valid-s1');
      expect(result.tracksToQueue[0].name).toBe('Fallback Name');
      expect(result.tracksToQueue[1].id).toBe('valid-s2');
      expect(result.tracksToQueue[1].name).toBe('Track');
    });

    it('[CHALLENGE-03] Normalizes diverse Subsonic starred response formats (starred2, legacy starred, single object vs array)', async () => {
      // 1. Array-based standard starred2 response
      const fetchStarredSpy = vi.spyOn(subsonicApi, 'fetchStarred');
      
      fetchStarredSpy.mockResolvedValueOnce({
        song: [{ id: 's1', title: 'Song 1' }],
        album: [{ id: 'a1', title: 'Album 1' }],
      } as any);
      const res1 = await fetchStarredLibrary();
      expect(res1.songs.length).toBe(1);
      expect(res1.albums.length).toBe(1);

      // 2. Single-object (non-array) starred response nested under starred2
      fetchStarredSpy.mockResolvedValueOnce({
        starred2: {
          song: { id: 's-single', title: 'Single Song' },
          album: { id: 'a-single', name: 'Single Album' },
        },
      } as any);
      const res2 = await fetchStarredLibrary();
      expect(res2.songs.length).toBe(1);
      expect(res2.songs[0].id).toBe('s-single');
      expect(res2.albums.length).toBe(1);
      expect(res2.albums[0].id).toBe('a-single');

      // 3. Fallback to getStarred when fetchStarred returns empty
      fetchStarredSpy.mockResolvedValueOnce({} as any);
      const getStarredSpy = vi.spyOn(subsonicApi, 'getStarred').mockResolvedValueOnce([
        { id: 's-legacy-1', title: 'Legacy Track' },
      ] as any);
      const res3 = await fetchStarredLibrary();
      expect(res3.songs.length).toBe(1);
      expect(res3.songs[0].id).toBe('s-legacy-1');
      expect(res3.albums.length).toBe(0);

      // 4. Completely empty starred response
      fetchStarredSpy.mockResolvedValueOnce({} as any);
      getStarredSpy.mockResolvedValueOnce([] as any);
      const res4 = await fetchStarredLibrary();
      expect(res4.songs.length).toBe(0);
      expect(res4.albums.length).toBe(0);
    });
  });

  // ==========================================================================
  // Dimension 2: Starred Tracks & Parent Albums Relationship Integrity
  // ==========================================================================
  describe('Dimension 2: Parent Album & Child Track Deduplication Relationship', () => {
    it('[CHALLENGE-04] Prevents duplicate track downloads when starred track parent album is queued in the same batch', () => {
      const starredAlbums = [
        { id: 'album-rock', title: 'Rock Anthology', coverArt: 'rock-cover' },
      ];

      const starredSongs = [
        { id: 'rock-trk-1', title: 'Rock Anthem', albumId: 'album-rock' },
        { id: 'rock-trk-2', title: 'Guitar Solo', albumId: 'album-rock' },
        { id: 'indie-trk-1', title: 'Indie Vibe', albumId: 'album-indie' }, // parent not starred
      ];

      const result = filterItemsForLibraryDownload(starredSongs, starredAlbums, {});

      // Only album-rock and indie-trk-1 should be queued
      expect(result.albumsToQueue.length).toBe(1);
      expect(result.albumsToQueue[0].id).toBe('album-rock');

      expect(result.tracksToQueue.length).toBe(1);
      expect(result.tracksToQueue[0].id).toBe('indie-trk-1');
      expect(result.skippedCount).toBe(2); // rock-trk-1 and rock-trk-2 skipped
    });

    it('[CHALLENGE-05] Prevents track download when parent album is already completed in store', () => {
      const downloads: Record<string, DownloadItem> = {
        'album-jazz': {
          id: 'album-jazz',
          name: 'Midnight Jazz',
          type: 'album',
          status: 'completed',
          progress: 100,
          path: '/Holad/albums/Midnight Jazz',
          timestamp: 100,
        },
      };

      const starredAlbums: any[] = []; // jazz album is not starred in this batch
      const starredSongs = [
        { id: 'jazz-trk-1', title: 'Sax Solitude', albumId: 'album-jazz' },
        { id: 'jazz-trk-2', title: 'Blue Note', albumId: 'album-jazz' },
        { id: 'pop-trk-1', title: 'Summer Hit', albumId: 'album-pop' },
      ];

      const result = filterItemsForLibraryDownload(starredSongs, starredAlbums, downloads);

      // jazz-trk-1 and jazz-trk-2 should be skipped because album-jazz is completed
      expect(result.tracksToQueue.length).toBe(1);
      expect(result.tracksToQueue[0].id).toBe('pop-trk-1');
      expect(result.skippedCount).toBe(2);
    });

    it('[CHALLENGE-06] Prevents track download when parent album is currently downloading in store', () => {
      const downloads: Record<string, DownloadItem> = {
        'album-ambient': {
          id: 'album-ambient',
          name: 'Deep Space',
          type: 'album',
          status: 'downloading',
          progress: 50,
          path: '',
          timestamp: 200,
        },
      };

      const starredAlbums = [
        { id: 'album-ambient', title: 'Deep Space' },
      ];
      const starredSongs = [
        { id: 'ambient-trk-1', title: 'Cosmic Drift', albumId: 'album-ambient' },
      ];

      const result = filterItemsForLibraryDownload(starredSongs, starredAlbums, downloads);

      expect(result.albumsToQueue.length).toBe(0); // already downloading
      expect(result.tracksToQueue.length).toBe(0); // skipped because parent album is downloading
      expect(result.skippedCount).toBe(2);
    });

    it('[CHALLENGE-07] Album batch download registers and indexes all child tracks into downloadStore with correct metadata', async () => {
      const albumId = 'alb-full-1';
      const songs = [
        { id: 's101', title: 'Track 1', artist: 'Band X', album: 'Album Full', albumId, duration: 180, coverArt: 'c1' },
        { id: 's102', title: 'Track 2', artist: 'Band X', album: 'Album Full', albumId, duration: 200, coverArt: 'c1' },
        { id: 's103', title: 'Track 3', artist: 'Band X', album: 'Album Full', albumId, duration: 220, coverArt: 'c1' },
      ];

      registerMockAlbum({
        id: albumId,
        name: 'Album Full',
        artist: 'Band X',
        coverArt: 'c1',
        songCount: 3,
        song: songs,
      });

      registerStarredItems([], [{ id: albumId, name: 'Album Full', artist: 'Band X', songCount: 3, song: songs }]);

      const progressLogs: BatchDownloadProgress[] = [];
      const result = await downloadEntireLibrary((p) => progressLogs.push({ ...p }), 2);

      expect(result.queuedCount).toBe(1);
      expect(result.totalFound).toBe(1);
      expect(result.skippedCount).toBe(0);

      const store = useDownloadStore.getState();
      // Album is completed
      expect(store.downloads[albumId]?.status).toBe('completed');

      // All 3 child tracks must be indexed as completed in downloadStore
      for (const s of songs) {
        const child = store.downloads[s.id];
        expect(child).toBeDefined();
        expect(child.status).toBe('completed');
        expect(child.type).toBe('track');
        expect(child.albumId).toBe(albumId);
        expect(child.artist).toBe('Band X');
        expect(child.duration).toBe(s.duration);
        expect(await vfs.exists(child.path)).toBe(true);
      }

      // Offline tracks getter should include all 3 tracks
      const offlineTracks = getOfflineTracks();
      expect(offlineTracks.some(t => t.id === 's101')).toBe(true);
      expect(offlineTracks.some(t => t.id === 's102')).toBe(true);
      expect(offlineTracks.some(t => t.id === 's103')).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 3: Scale & Boundary Extremes (Empty vs Massive 120+ Items)
  // ==========================================================================
  describe('Dimension 3: Scale & Extreme Library Sizing', () => {
    it('[CHALLENGE-08] Empty starred library resolves immediately without triggering workers or mutating store', async () => {
      registerStarredItems([], []);

      const progressLogs: BatchDownloadProgress[] = [];
      const result = await downloadEntireLibrary((p) => progressLogs.push({ ...p }));

      expect(result.totalFound).toBe(0);
      expect(result.queuedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.error).toBeUndefined();

      const lastProgress = progressLogs[progressLogs.length - 1];
      expect(lastProgress.status).toBe('completed');
      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
    });

    it('[CHALLENGE-09] Massive starred library (120 individual tracks) executes with bounded concurrency and preserves state consistency', async () => {
      const totalTracks = 120;
      const songs: any[] = [];

      for (let i = 1; i <= totalTracks; i++) {
        const s = {
          id: `stress-trk-${i}`,
          title: `Stress Track ${i}`,
          artist: `Artist ${i % 10}`,
          album: `Album ${i % 20}`,
          albumId: `alb-${i % 20}`,
          duration: 150 + (i % 60),
        };
        songs.push(s);
        registerMockSong(s);
      }

      registerStarredItems(songs, []);

      let maxSimultaneousActive = 0;
      const progressSnapshots: BatchDownloadProgress[] = [];

      // We test bounded concurrency = 4
      const result = await downloadEntireLibrary((progress) => {
        progressSnapshots.push({ ...progress });
        const curDownloads = useDownloadStore.getState().downloads;
        const activeCount = Object.values(curDownloads).filter(d => d.status === 'downloading').length;
        if (activeCount > maxSimultaneousActive) {
          maxSimultaneousActive = activeCount;
        }
      }, 4);

      expect(result.totalFound).toBe(120);
      expect(result.queuedCount).toBe(120);
      expect(result.skippedCount).toBe(0);

      // Concurrency must never exceed 4
      expect(maxSimultaneousActive).toBeLessThanOrEqual(4);

      // Verify all 120 tracks are completed in downloadStore
      const store = useDownloadStore.getState();
      const completedCount = Object.values(store.downloads).filter(d => d.status === 'completed').length;
      expect(completedCount).toBe(120);

      // Verify VFS has all 120 track files
      for (let i = 1; i <= totalTracks; i++) {
        const item = store.downloads[`stress-trk-${i}`];
        expect(item).toBeDefined();
        expect(item.status).toBe('completed');
        expect(await vfs.exists(item.path)).toBe(true);
      }

      // Final progress must report completed 120
      const finalProg = progressSnapshots[progressSnapshots.length - 1];
      expect(finalProg.completed).toBe(120);
      expect(finalProg.status).toBe('completed');
    });

    it('[CHALLENGE-10] Massive starred library with 80% pre-downloaded items only queues remainder and computes correct skipped metrics', async () => {
      const store = useDownloadStore.getState();
      const songs: any[] = [];
      const totalItems = 50;

      for (let i = 1; i <= totalItems; i++) {
        const id = `partial-trk-${i}`;
        const s = {
          id,
          title: `Partial Track ${i}`,
          artist: 'Partial Artist',
          album: 'Partial Album',
          albumId: 'p-alb',
          duration: 180,
        };
        songs.push(s);
        registerMockSong(s);

        // Pre-download first 40 tracks (80%)
        if (i <= 40) {
          store.startDownload(id, s.title, 'track');
          store.completeDownload(id, `/Holad/tracks/${id}.mp3`, { sizeBytes: 1024 * 50 });
        }
      }

      registerStarredItems(songs, []);

      const result = await downloadEntireLibrary(undefined, 3);

      expect(result.totalFound).toBe(50);
      expect(result.skippedCount).toBe(40);
      expect(result.queuedCount).toBe(10);

      // Store should now have 50 completed tracks
      const updatedStore = useDownloadStore.getState();
      const completed = Object.values(updatedStore.downloads).filter(d => d.status === 'completed');
      expect(completed.length).toBe(50);
    });
  });

  // ==========================================================================
  // Dimension 4: Network Offline, Mid-Batch Disruptions & Intermittent Server Errors
  // ==========================================================================
  describe('Dimension 4: Network Disruptions & Error Isolation', () => {
    it('[CHALLENGE-11] Offline pre-condition halts batch download immediately with structured error and without exceptions', async () => {
      setOnline(false);

      let capturedProgress: BatchDownloadProgress | null = null;
      const result = await downloadEntireLibrary((p) => {
        capturedProgress = p;
      });

      expect(result.error).toBe('Cannot download library while offline');
      expect(result.totalFound).toBe(0);
      expect(result.queuedCount).toBe(0);
      expect(result.skippedCount).toBe(0);

      expect(capturedProgress).not.toBeNull();
      expect(capturedProgress!.status).toBe('error');
      expect(capturedProgress!.error).toBe('Cannot download library while offline');
    });

    it('[CHALLENGE-12] Network disconnection mid-batch terminates worker loop gracefully without unhandled rejections', async () => {
      const songs: any[] = [];
      for (let i = 1; i <= 8; i++) {
        const s = { id: `offline-mid-${i}`, title: `Mid Offline ${i}`, duration: 100 };
        songs.push(s);
        registerMockSong(s);
      }
      registerStarredItems(songs, []);

      let downloadedCount = 0;
      // Hook into fetch to disconnect network after 2 tracks
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input, init) => {
        const urlStr = String(input);
        if (urlStr.includes('download')) {
          downloadedCount++;
          if (downloadedCount >= 3) {
            setOnline(false);
          }
        }
        return origFetch(input, init);
      });

      // Must resolve cleanly without throwing unhandled error
      await expect(downloadEntireLibrary(undefined, 1)).resolves.toBeDefined();

      // At least some tracks should be completed, and remaining should not be in infinite loop
      const store = useDownloadStore.getState();
      const completedTracks = Object.values(store.downloads).filter(d => d.status === 'completed');
      expect(completedTracks.length).toBeGreaterThanOrEqual(2);
    });

    it('[CHALLENGE-13] Intermittent HTTP 500 server errors on download streams mark those tracks as error in store and continue batch queue', async () => {
      const songs = [
        { id: 'ok-1', title: 'Good Track 1' },
        { id: 'fail-1', title: 'Bad Track 1' }, // download stream will fail
        { id: 'ok-2', title: 'Good Track 2' },
        { id: 'fail-2', title: 'Bad Track 2' }, // download stream will fail
        { id: 'ok-3', title: 'Good Track 3' },
      ];

      for (const s of songs) registerMockSong(s as any);
      registerStarredItems(songs as any, []);

      // Simulate network failure specifically on download endpoint for fail-1 and fail-2
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input, init) => {
        const urlStr = String(input);
        if (urlStr.includes('download') && (urlStr.includes('id=fail-1') || urlStr.includes('id=fail-2'))) {
          return new Response('Simulated Download Failure', { status: 500, statusText: 'Internal Server Error' });
        }
        return origFetch(input, init);
      });

      const progressLogs: BatchDownloadProgress[] = [];
      const result = await downloadEntireLibrary((p) => progressLogs.push({ ...p }), 2);

      expect(result.totalFound).toBe(5);
      expect(result.queuedCount).toBe(5);

      const store = useDownloadStore.getState();
      expect(store.downloads['ok-1']?.status).toBe('completed');
      expect(store.downloads['ok-2']?.status).toBe('completed');
      expect(store.downloads['ok-3']?.status).toBe('completed');
      expect(store.downloads['fail-1']?.status).toBe('error');
      expect(store.downloads['fail-1']?.error).toBeDefined();
      expect(store.downloads['fail-2']?.status).toBe('error');
      expect(store.downloads['fail-2']?.error).toBeDefined();

      const finalProg = progressLogs[progressLogs.length - 1];
      expect(finalProg.status).toBe('completed');
    });

    it('[CHALLENGE-14] User cancellation of queued items mid-batch gracefully skips them without interrupting worker loop', async () => {
      const songs = [
        { id: 'cancel-1', title: 'Cancel Track 1' },
        { id: 'cancel-2', title: 'Cancel Track 2' },
        { id: 'cancel-3', title: 'Cancel Track 3' },
        { id: 'cancel-4', title: 'Cancel Track 4' },
      ];

      for (const s of songs) registerMockSong(s as any);
      registerStarredItems(songs as any, []);

      // Concurrency 1: while track 1 is downloading, cancel track 2 and track 3 before worker reaches them
      let cancelled = false;
      const downloadPromise = downloadEntireLibrary((p) => {
        if (p.currentName === 'Cancel Track 1' && !cancelled) {
          cancelled = true;
          // Mark cancel-2 and cancel-3 as cancelled in store
          useDownloadStore.getState().cancelDownload('cancel-2');
          useDownloadStore.getState().cancelDownload('cancel-3');
        }
      }, 1);

      await expect(downloadPromise).resolves.toBeDefined();

      const store = useDownloadStore.getState();
      expect(store.downloads['cancel-1']?.status).toBe('completed');
      expect(store.downloads['cancel-2']?.status).toBe('cancelled');
      expect(store.downloads['cancel-3']?.status).toBe('cancelled');
      expect(store.downloads['cancel-4']?.status).toBe('completed');
    });
  });

  // ==========================================================================
  // Dimension 5: Rapid Multiple Clicks & Concurrency Re-entrancy Immunity
  // ==========================================================================
  describe('Dimension 5: Race Condition & UI Re-entrancy Immunity', () => {
    it('[CHALLENGE-15] Rapid consecutive clicks on "Download Entire Library" button triggers only ONE download operation while downloading', async () => {
      const songs = [
        { id: 'btn-trk-1', title: 'Button Track 1' },
        { id: 'btn-trk-2', title: 'Button Track 2' },
      ];
      for (const s of songs) registerMockSong(s as any);
      registerStarredItems(songs as any, []);

      let starredFetchCount = 0;
      let resolveFirstStream: (() => void) | null = null;
      const streamHoldPromise = new Promise<void>((resolve) => {
        resolveFirstStream = resolve;
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(async (input, init) => {
        const urlStr = String(input);
        if (urlStr.includes('getStarred')) {
          starredFetchCount++;
        }
        if (urlStr.includes('download') && urlStr.includes('btn-trk-1')) {
          await streamHoldPromise; // hold first download in-flight
        }
        return origFetch(input, init);
      });

      render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(DownloadedMusicGrid, null)
        )
      );

      const buttons = screen.getAllByText('Скачать всю библиотеку');
      expect(buttons.length).toBeGreaterThan(0);
      const targetBtn = buttons[0];

      // Initial click initiates download
      act(() => {
        fireEvent.click(targetBtn);
      });

      // While the download is held in-flight, rapid clicks must be ignored
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          fireEvent.click(targetBtn);
        }
      });

      // Release in-flight download stream
      resolveFirstStream?.();

      // Wait for completion
      await waitFor(() => {
        const store = useDownloadStore.getState();
        return expect(store.downloads['btn-trk-1']?.status).toBe('completed');
      }, { timeout: 3000 });

      // getStarred was only triggered once
      expect(starredFetchCount).toBe(1);

      // Verify no duplicate entries in downloadStore
      const store = useDownloadStore.getState();
      expect(Object.keys(store.downloads).length).toBe(2);
    });

    it('[CHALLENGE-16] Simultaneous direct calls to downloadEntireLibrary resolve cleanly without corrupted store state', async () => {
      const songs = [
        { id: 'par-trk-1', title: 'Parallel Track 1' },
        { id: 'par-trk-2', title: 'Parallel Track 2' },
      ];
      for (const s of songs) registerMockSong(s as any);
      registerStarredItems(songs as any, []);

      // Invoke 3 concurrent calls
      const [res1, res2, res3] = await Promise.all([
        downloadEntireLibrary(undefined, 2),
        downloadEntireLibrary(undefined, 2),
        downloadEntireLibrary(undefined, 2),
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
      expect(res3).toBeDefined();

      const store = useDownloadStore.getState();
      expect(store.downloads['par-trk-1']?.status).toBe('completed');
      expect(store.downloads['par-trk-2']?.status).toBe('completed');
      expect(Object.keys(store.downloads).length).toBe(2);
    });

    it('[CHALLENGE-17] Sidebar UI and getDownloadQueueStats maintain mathematical invariants (0 <= progress <= 100, no NaN) under rapid churn', () => {
      const store = useDownloadStore.getState();

      // Invariant checks with various chaotic states
      const chaoticStates: Record<string, DownloadItem>[] = [
        // 1. All zero progress
        {
          d1: { id: 'd1', name: 'S1', type: 'track', status: 'downloading', progress: 0, path: '', timestamp: 1 },
          d2: { id: 'd2', name: 'S2', type: 'track', status: 'downloading', progress: 0, path: '', timestamp: 2 },
        },
        // 2. Fractional and 100% progress
        {
          d1: { id: 'd1', name: 'S1', type: 'track', status: 'downloading', progress: 33.333, path: '', timestamp: 1 },
          d2: { id: 'd2', name: 'S2', type: 'track', status: 'downloading', progress: 66.666, path: '', timestamp: 2 },
          d3: { id: 'd3', name: 'S3', type: 'track', status: 'queued', progress: 0, path: '', timestamp: 3 },
          d4: { id: 'd4', name: 'S4', type: 'track', status: 'completed', progress: 100, path: '/p', timestamp: 4 },
        },
        // 3. 100+ queued items (badge limit test)
        Array.from({ length: 150 }).reduce<Record<string, DownloadItem>>((acc, _, idx) => {
          acc[`q-${idx}`] = {
            id: `q-${idx}`,
            name: `Queue ${idx}`,
            type: 'track',
            status: 'queued',
            progress: 0,
            path: '',
            timestamp: idx,
          };
          return acc;
        }, {}),
      ];

      for (const s of chaoticStates) {
        const stats = getDownloadQueueStats(s);
        expect(stats.overallProgress).toBeGreaterThanOrEqual(0);
        expect(stats.overallProgress).toBeLessThanOrEqual(100);
        expect(Number.isNaN(stats.overallProgress)).toBe(false);
        expect(stats.totalActiveCount).toBe(stats.activeDownloadsCount + stats.queuedCount);
      }
    });

    it('[CHALLENGE-18] Compact Sidebar renders 99+ badge and circular progress ring correctly with > 99 active items', () => {
      useUIStore.setState({ leftSidebarWidth: 80 }); // Compact mode (< 120)

      const store = useDownloadStore.getState();
      // Add 105 queued items
      for (let i = 1; i <= 105; i++) {
        store.queueDownload(`badge-${i}`, `Badge Track ${i}`, 'track');
      }

      render(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/Holad'] },
          React.createElement(Sidebar, null)
        )
      );

      // Badge must show "99+"
      expect(screen.getByText('99+')).toBeDefined();
    });
  });
});
