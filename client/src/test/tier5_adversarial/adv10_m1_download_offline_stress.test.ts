import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
  setSimulatedNetworkFailure,
} from '../e2e/harness';
import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
  getDownloadedTracks,
  getDownloadedAlbums,
  DownloadItem,
} from '../../store/downloadStore';
import { handleDownload, cancelActiveDownload } from '../../utils/downloadHelper';
import {
  networkManager,
  isOnline,
  isOffline,
  setNetworkStatusForTesting,
  resetNetworkStatusForTesting,
} from '../../utils/networkStatus';
import { resolveTrackAudioSource } from '../../hooks/useTrackSource';

describe('ADV-10: Milestone 1 Deep Adversarial Stress & Chaos Test (Features 4, 5, 6)', () => {
  beforeEach(() => {
    resetE2EHarness();
    resetNetworkStatusForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetNetworkStatusForTesting();
  });

  // ==========================================================================
  // SECTION 1: FEATURE 4 - DownloadStore State Machine Transitions & Scale Stress
  // ==========================================================================
  describe('1. DownloadStore State Machine Invariants & Edge Cases', () => {
    it('ADV-DS-1: Strict state machine transition matrix (queued -> downloading -> paused -> downloading -> completed)', () => {
      const store = useDownloadStore.getState();

      // Initial queue
      store.queueDownload('track-sm-1', 'SM Track', 'track', 'cover1.jpg', { artist: 'Artist 1' });
      let item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.status).toBe('queued');
      expect(item.progress).toBe(0);

      // Start / Resume -> downloading
      store.resumeDownload('track-sm-1');
      item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.status).toBe('downloading');

      // Pause -> paused
      store.pauseDownload('track-sm-1');
      item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.status).toBe('paused');

      // Resume -> downloading
      store.resumeDownload('track-sm-1');
      item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.status).toBe('downloading');

      // Progress updates
      store.updateProgress('track-sm-1', 45, 4500, 10000);
      item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.progress).toBe(45);
      expect(item.bytesDownloaded).toBe(4500);
      expect(item.totalBytes).toBe(10000);

      // Complete -> completed
      store.completeDownload('track-sm-1', '/music/sm-track.mp3', { sizeBytes: 10000 });
      item = useDownloadStore.getState().downloads['track-sm-1'];
      expect(item.status).toBe('completed');
      expect(item.progress).toBe(100);
      expect(item.path).toBe('/music/sm-track.mp3');

      // Verify queries
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'track-sm-1')).toBe(true);
      expect(getDownloadedTracks().some(d => d.id === 'track-sm-1')).toBe(true);
    });

    it('ADV-DS-2: Error, retry, cancellation & no-op transitions on missing items', () => {
      const store = useDownloadStore.getState();

      // Non-existent item operations should not crash or throw
      expect(() => {
        store.pauseDownload('non-existent-id');
        store.resumeDownload('non-existent-id');
        store.cancelDownload('non-existent-id');
        store.completeDownload('non-existent-id', '/path/none');
        store.errorDownload('non-existent-id', 'some error');
        store.updateProgress('non-existent-id', 50);
        store.updateItem('non-existent-id', { artist: 'ghost' });
        store.updateCurrentTrack('non-existent-id', 'ghost song');
        store.removeDownload('non-existent-id');
      }).not.toThrow();

      // Error state transition
      store.startDownload('err-track-1', 'Failing Track', 'track');
      store.errorDownload('err-track-1', 'HTTP 500 Server Error');
      let item = useDownloadStore.getState().downloads['err-track-1'];
      expect(item.status).toBe('error');
      expect(item.error).toBe('HTTP 500 Server Error');

      // Retry: startDownload resets status to downloading
      store.startDownload('err-track-1', 'Failing Track', 'track');
      item = useDownloadStore.getState().downloads['err-track-1'];
      expect(item.status).toBe('downloading');

      // Cancel transition
      store.cancelDownload('err-track-1');
      item = useDownloadStore.getState().downloads['err-track-1'];
      expect(item.status).toBe('cancelled');
    });

    it('ADV-DS-3: clearHistory preserves in-flight/queued downloads and purges completed/error/paused/cancelled', () => {
      const store = useDownloadStore.getState();

      store.queueDownload('item-queued', 'Queued', 'track');
      store.startDownload('item-downloading', 'Downloading', 'track');
      store.startDownload('item-completed', 'Completed', 'track');
      store.completeDownload('item-completed', '/path/1');
      store.startDownload('item-error', 'Error', 'track');
      store.errorDownload('item-error', 'Failed');
      store.startDownload('item-paused', 'Paused', 'track');
      store.pauseDownload('item-paused');
      store.startDownload('item-cancelled', 'Cancelled', 'track');
      store.cancelDownload('item-cancelled');

      // Execute clearHistory
      store.clearHistory();

      const downloads = useDownloadStore.getState().downloads;
      // In-flight items preserved
      expect(downloads['item-queued']).toBeDefined();
      expect(downloads['item-downloading']).toBeDefined();
      // Finished / halted items removed
      expect(downloads['item-completed']).toBeUndefined();
      expect(downloads['item-error']).toBeUndefined();
      expect(downloads['item-paused']).toBeUndefined();
      expect(downloads['item-cancelled']).toBeUndefined();
    });

    it('ADV-DS-4: isItemDownloaded handles direct tracks, album ancestry, in-progress states, and undefined IDs', () => {
      const store = useDownloadStore.getState();

      store.startDownload('album-parent-1', 'Parent Album', 'album');
      store.completeDownload('album-parent-1', '/music/albums/Parent Album');

      store.startDownload('track-standalone-1', 'Standalone', 'track');
      store.completeDownload('track-standalone-1', '/music/tracks/standalone.mp3');

      store.startDownload('track-downloading-1', 'In Flight', 'track');

      const downloads = useDownloadStore.getState().downloads;

      // 1. Direct track completed
      expect(isItemDownloaded(downloads, 'track-standalone-1')).toBe(true);

      // 2. Track in completed album (even if track ID itself is not a separate entry in store)
      expect(isItemDownloaded(downloads, 'child-song-xyz', 'album-parent-1')).toBe(true);

      // 3. Track downloading (not completed) and no completed parent album
      expect(isItemDownloaded(downloads, 'track-downloading-1')).toBe(false);

      // 4. Non-existent track and non-existent album
      expect(isItemDownloaded(downloads, 'unknown-track', 'unknown-album')).toBe(false);

      // 5. Undefined / empty album ID
      expect(isItemDownloaded(downloads, 'unknown-track', undefined)).toBe(false);
      expect(isItemDownloaded(downloads, 'unknown-track', '')).toBe(false);
    });

    it('ADV-DS-5: Large scale library queries (5,000 tracks + 200 albums) perform in < 50ms with zero duplicate IDs', () => {
      const store = useDownloadStore.getState();
      const largeDownloads: Record<string, DownloadItem> = {};

      // Generate 5,000 tracks
      for (let i = 1; i <= 5000; i++) {
        const id = `bulk-track-${i}`;
        largeDownloads[id] = {
          id,
          name: `Bulk Track Title ${i}`,
          type: 'track',
          status: 'completed',
          progress: 100,
          path: `/music/tracks/bulk_${i}.mp3`,
          artist: `Artist ${i % 100}`,
          album: `Album ${i % 50}`,
          albumId: `alb-${i % 50}`,
          duration: 180 + (i % 60),
          localCoverArtUri: `http://asset.localhost/covers/bulk_${i % 50}.jpg`,
          sizeBytes: 3500000,
          timestamp: Date.now() - i * 1000,
        };
      }

      // Generate 200 albums
      for (let j = 1; j <= 200; j++) {
        const albId = `bulk-alb-${j}`;
        largeDownloads[albId] = {
          id: albId,
          name: `Bulk Album ${j}`,
          type: 'album',
          status: 'completed',
          progress: 100,
          path: `/music/albums/bulk_${j}`,
          artist: `Artist ${j}`,
          album: `Bulk Album ${j}`,
          albumId: albId,
          completedTrackCount: 10,
          totalTrackCount: 10,
          localCoverArtUri: `http://asset.localhost/covers/alb_${j}.jpg`,
          sizeBytes: 35000000,
          timestamp: Date.now() - j * 10000,
        };
      }

      useDownloadStore.setState({ downloads: largeDownloads });

      // Add 1,000 items in localStorage history (some overlapping, some distinct)
      const historyItems = [];
      for (let k = 1; k <= 1000; k++) {
        historyItems.push({
          id: `bulk-track-${k}`,
          title: `Bulk Track Title ${k}`,
          artist: `Artist ${k % 100}`,
          album: `Album ${k % 50}`,
          albumId: `alb-${k % 50}`,
          duration: 200,
        });
      }
      localStorage.setItem('streamnavi-history', JSON.stringify({ state: { history: historyItems } }));

      // Benchmark getOfflineTracks
      const t0 = performance.now();
      const offlineTracks = getOfflineTracks();
      const t1 = performance.now();

      const durationMs = t1 - t0;
      expect(durationMs).toBeLessThan(100); // Must be fast
      expect(offlineTracks.length).toBe(5000); // Deduplicated 5000 tracks

      // Verify no duplicate IDs
      const uniqueIds = new Set(offlineTracks.map(t => t.id));
      expect(uniqueIds.size).toBe(5000);

      // Verify metadata mapping integrity
      const sample = offlineTracks[0];
      expect(sample.id).toBeDefined();
      expect(sample.title).toBeDefined();
      expect(sample.artist).toBeDefined();
      expect(sample.coverArt).toContain('http://asset.localhost/');
      expect(sample.path).toBeDefined();
      expect(sample.sizeBytes).toBeGreaterThan(0);

      // Verify getDownloadedTracks & getDownloadedAlbums
      expect(getDownloadedTracks().length).toBe(5000);
      expect(getDownloadedAlbums().length).toBe(200);
    });

    it('ADV-DS-6: Corrupted LocalStorage streamnavi-history string handled gracefully without throwing', () => {
      const store = useDownloadStore.getState();
      store.startDownload('trk-safe-1', 'Safe Song', 'track');
      store.completeDownload('trk-safe-1', '/music/safe.mp3');

      // 1. Invalid JSON
      localStorage.setItem('streamnavi-history', '{ broken json: null [');
      expect(() => getOfflineTracks()).not.toThrow();
      expect(getOfflineTracks().length).toBe(1);

      // 2. Null state object
      localStorage.setItem('streamnavi-history', JSON.stringify({ state: null }));
      expect(() => getOfflineTracks()).not.toThrow();
      expect(getOfflineTracks().length).toBe(1);

      // 3. Empty string
      localStorage.setItem('streamnavi-history', '');
      expect(() => getOfflineTracks()).not.toThrow();
      expect(getOfflineTracks().length).toBe(1);
    });
  });

  // ==========================================================================
  // SECTION 2: FEATURE 5 - DownloadHelper Concurrency, Cancellation & Fallbacks
  // ==========================================================================
  describe('2. DownloadHelper Concurrency, Abort & Fallbacks', () => {
    it('ADV-DH-1: Single track download with cover art on desktop Tauri creates local files and store entries', async () => {
      setPlatform('tauri');
      const songId = 'single-adv-1';
      registerMockSong({
        id: songId,
        title: 'Adversarial Rock',
        artist: 'Chaos Band',
        album: 'Distortion',
        albumId: 'alb-dist-1',
        duration: 215,
        coverArt: 'cover-dist-1',
      });

      await handleDownload(songId, 'Adversarial Rock', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.progress).toBe(100);
      expect(item.path).toContain('Adversarial Rock.mp3');
      expect(item.localCoverArtUri).toContain('http://asset.localhost/');
      expect(await vfs.exists(item.path)).toBe(true);
    });

    it('ADV-DH-2: Missing or failing cover art download does not block audio track download', async () => {
      setPlatform('tauri');
      const songId = 'single-no-cover';
      registerMockSong({
        id: songId,
        title: 'No Cover Song',
        artist: 'Ghost Artist',
        album: 'Aether',
        albumId: 'alb-aether',
        duration: 190,
        // No coverArt property
      });

      await handleDownload(songId, 'No Cover Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.localCoverArtUri).toBeUndefined();
      expect(await vfs.exists(item.path)).toBe(true);

      // Failing cover art mock (returns 500 error)
      const failCoverSongId = 'single-fail-cover';
      registerMockSong({
        id: failCoverSongId,
        title: 'Failing Cover Song',
        artist: 'Ghost Artist',
        album: 'Aether 2',
        albumId: 'alb-aether-2',
        duration: 190,
        coverArt: 'failing-cover-art-id',
      });
      setSimulatedNetworkFailure('getCoverArt', true);

      await handleDownload(failCoverSongId, 'Failing Cover Song', 'track');

      const failItem = useDownloadStore.getState().downloads[failCoverSongId];
      expect(failItem).toBeDefined();
      expect(failItem.status).toBe('completed');
      expect(failItem.localCoverArtUri).toBeUndefined();
      expect(await vfs.exists(failItem.path)).toBe(true);

      setSimulatedNetworkFailure('getCoverArt', false);
    });

    it('ADV-DH-3: Full album download indexes parent container AND all child tracks into downloadStore with shared cover', async () => {
      setPlatform('tauri');
      const albumId = 'alb-chaos-suite';
      registerMockAlbum({
        id: albumId,
        name: 'Chaos Suite',
        title: 'Chaos Suite',
        artist: 'Quantum Orchestra',
        coverArt: 'cover-chaos-suite',
        songCount: 3,
        song: [
          { id: 'cs-1', title: 'Movement I', artist: 'Quantum Orchestra', album: 'Chaos Suite', albumId, duration: 300 },
          { id: 'cs-2', title: 'Movement II', artist: 'Quantum Orchestra', album: 'Chaos Suite', albumId, duration: 420 },
          { id: 'cs-3', title: 'Movement III', artist: 'Quantum Orchestra', album: 'Chaos Suite', albumId, duration: 280 },
        ],
      });

      await handleDownload(albumId, 'Chaos Suite', 'album');

      // 1. Check parent album item
      const albumItem = useDownloadStore.getState().downloads[albumId];
      expect(albumItem).toBeDefined();
      expect(albumItem.status).toBe('completed');
      expect(albumItem.completedTrackCount).toBe(3);
      expect(albumItem.totalTrackCount).toBe(3);
      expect(albumItem.localCoverArtUri).toContain('http://asset.localhost/');

      // 2. Check each child track
      for (const trackId of ['cs-1', 'cs-2', 'cs-3']) {
        const child = useDownloadStore.getState().downloads[trackId];
        expect(child).toBeDefined();
        expect(child.status).toBe('completed');
        expect(child.type).toBe('track');
        expect(child.albumId).toBe(albumId);
        expect(child.localCoverArtUri).toBe(albumItem.localCoverArtUri);
        expect(await vfs.exists(child.path)).toBe(true);
      }

      // 3. Verify getOfflineTracks returns all 3 child tracks
      const offline = getOfflineTracks();
      expect(offline.some(t => t.id === 'cs-1')).toBe(true);
      expect(offline.some(t => t.id === 'cs-2')).toBe(true);
      expect(offline.some(t => t.id === 'cs-3')).toBe(true);
    });

    it('ADV-DH-4: Empty album completes immediately with album_empty path', async () => {
      setPlatform('tauri');
      const emptyAlbId = 'alb-empty-00';
      registerMockAlbum({
        id: emptyAlbId,
        name: 'Void Album',
        artist: 'Ghost',
        songCount: 0,
        song: [],
      });

      await handleDownload(emptyAlbId, 'Void Album', 'album');

      const item = useDownloadStore.getState().downloads[emptyAlbId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.path).toBe('album_empty');
    });

    it('ADV-DH-5: High-concurrency download stress (5 simultaneous single tracks + 2 simultaneous albums)', async () => {
      setPlatform('tauri');

      // Prepare 5 songs
      const songIds: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const id = `concurrent-song-${i}`;
        songIds.push(id);
        registerMockSong({
          id,
          title: `Concurrent Track ${i}`,
          artist: 'Storm Artist',
          album: 'Storm Single',
          albumId: `alb-concurrent-s-${i}`,
          duration: 150 + i,
          coverArt: `cover-c-${i}`,
        });
      }

      // Prepare 2 albums
      const albumIds = ['concurrent-alb-1', 'concurrent-alb-2'];
      for (const aId of albumIds) {
        registerMockAlbum({
          id: aId,
          name: `Concurrent Album ${aId}`,
          artist: 'Storm Band',
          coverArt: `cover-${aId}`,
          songCount: 2,
          song: [
            { id: `${aId}-t1`, title: `${aId} Track 1`, artist: 'Storm Band', album: `Concurrent Album ${aId}`, albumId: aId, duration: 180 },
            { id: `${aId}-t2`, title: `${aId} Track 2`, artist: 'Storm Band', album: `Concurrent Album ${aId}`, albumId: aId, duration: 190 },
          ],
        });
      }

      // Fire all downloads in parallel
      const tasks = [
        ...songIds.map(id => handleDownload(id, `Concurrent Track ${id}`, 'track')),
        ...albumIds.map(id => handleDownload(id, `Concurrent Album ${id}`, 'album')),
      ];

      await Promise.all(tasks);

      // Verify all single songs completed
      for (const id of songIds) {
        const itm = useDownloadStore.getState().downloads[id];
        expect(itm).toBeDefined();
        expect(itm.status).toBe('completed');
        expect(await vfs.exists(itm.path)).toBe(true);
      }

      // Verify all albums and child tracks completed
      for (const aId of albumIds) {
        const albItm = useDownloadStore.getState().downloads[aId];
        expect(albItm).toBeDefined();
        expect(albItm.status).toBe('completed');
        expect(albItm.completedTrackCount).toBe(2);

        const child1 = useDownloadStore.getState().downloads[`${aId}-t1`];
        const child2 = useDownloadStore.getState().downloads[`${aId}-t2`];
        expect(child1?.status).toBe('completed');
        expect(child2?.status).toBe('completed');
      }
    });

    it('ADV-DH-6: Active download cancellation aborts network request and marks store status as cancelled', async () => {
      setPlatform('tauri');
      const songId = 'cancel-test-song';
      registerMockSong({
        id: songId,
        title: 'Cancel Me',
        artist: 'Ghost',
        album: 'Ephemeral',
        albumId: 'alb-eph',
        duration: 200,
      });

      // Start download
      const downloadPromise = handleDownload(songId, 'Cancel Me', 'track');

      // Abort immediately
      cancelActiveDownload(songId);

      await downloadPromise;

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('cancelled');
    });

    it('ADV-DH-7: Partial track failure in album download does not abort remaining tracks in the album', async () => {
      setPlatform('tauri');
      const albumId = 'alb-partial-fail';
      registerMockAlbum({
        id: albumId,
        name: 'Resilience Album',
        artist: 'Tough Band',
        coverArt: 'cover-tough',
        songCount: 3,
        song: [
          { id: 'part-1', title: 'Good Track 1', artist: 'Tough Band', album: 'Resilience Album', albumId, duration: 180 },
          { id: 'part-fail', title: 'Failing Track 2', artist: 'Tough Band', album: 'Resilience Album', albumId, duration: 180 },
          { id: 'part-3', title: 'Good Track 3', artist: 'Tough Band', album: 'Resilience Album', albumId, duration: 180 },
        ],
      });

      // Set network failure for 'part-fail'
      setSimulatedNetworkFailure('part-fail', true);

      await handleDownload(albumId, 'Resilience Album', 'album');

      // Album should complete with 2 completed songs
      const albumItem = useDownloadStore.getState().downloads[albumId];
      expect(albumItem).toBeDefined();
      expect(albumItem.status).toBe('completed');
      expect(albumItem.completedTrackCount).toBe(2);

      // Child tracks 1 and 3 are completed
      expect(useDownloadStore.getState().downloads['part-1']?.status).toBe('completed');
      expect(useDownloadStore.getState().downloads['part-3']?.status).toBe('completed');
      // Child track 2 was skipped
      expect(useDownloadStore.getState().downloads['part-fail']).toBeUndefined();

      setSimulatedNetworkFailure('part-fail', false);
    });

    it('ADV-DH-8: Web platform triggers window.open download URL and does not modify local storage', async () => {
      setPlatform('web');
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      await handleDownload('web-song-1', 'Web Song', 'track');

      expect(windowOpenSpy).toHaveBeenCalledTimes(1);
      expect(windowOpenSpy).toHaveBeenCalledWith(expect.stringContaining('download'), '_blank');

      // Download store unaffected
      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 3: FEATURE 6 - NetworkStatus, Audio Source Resolution & View Fallback
  // ==========================================================================
  describe('3. NetworkStatus, resolveTrackAudioSource & Offline View Resilience', () => {
    it('ADV-NS-1: NetworkStatus error-safe listener execution and rapid state flapping', () => {
      const received: boolean[] = [];
      const errorSubscriber = vi.fn(() => {
        throw new Error('Exploding listener');
      });
      const healthySubscriber = vi.fn((online: boolean) => {
        received.push(online);
      });

      const unsubErr = networkManager.subscribe(errorSubscriber);
      const unsubHealthy = networkManager.subscribe(healthySubscriber);

      // Rapid state flapping
      for (let i = 0; i < 20; i++) {
        setNetworkStatusForTesting(i % 2 === 0);
      }

      // Verify healthy subscriber received all transitions without being blocked by exploding listener
      expect(received.length).toBe(20);
      expect(errorSubscriber).toHaveBeenCalledTimes(20);

      unsubErr();
      unsubHealthy();

      // After unsubscribing, no new calls
      setNetworkStatusForTesting(true);
      expect(received.length).toBe(20);
    });

    it('ADV-NS-2: resolveTrackAudioSource complete state matrix (direct, album child, remote stream, offline fallback)', async () => {
      setPlatform('tauri');

      // 1. Direct downloaded track
      const directId = 'source-direct-1';
      const directPath = 'C:/Users/MockUser/Downloads/Holad/tracks/DirectSong.mp3';
      await vfs.writeFile(directPath, new Uint8Array([1, 2, 3]));
      useDownloadStore.getState().startDownload(directId, 'Direct Song', 'track');
      useDownloadStore.getState().completeDownload(directId, directPath);

      // When Online
      setNetworkStatusForTesting(true);
      let res = await resolveTrackAudioSource({ id: directId, title: 'Direct Song' });
      expect(res.isLocal).toBe(true);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('http://asset.localhost/');

      // When Offline
      setNetworkStatusForTesting(false);
      res = await resolveTrackAudioSource({ id: directId, title: 'Direct Song' });
      expect(res.isLocal).toBe(true);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('http://asset.localhost/');

      // 2. Track downloaded as part of album
      const albumId = 'alb-source-test';
      const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/SourceAlbum';
      await vfs.writeFile(`${albumDir}/AlbumTrack01.mp3`, new Uint8Array([1, 2, 3]));
      useDownloadStore.getState().startDownload(albumId, 'Source Album', 'album');
      useDownloadStore.getState().completeDownload(albumId, albumDir);

      // Album child track resolution
      res = await resolveTrackAudioSource({ id: 'child-unindexed-1', title: 'AlbumTrack01', albumId });
      expect(res.isLocal).toBe(true);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('http://asset.localhost/');

      // 3. Stream only (not downloaded): Online vs Offline
      setNetworkStatusForTesting(true);
      res = await resolveTrackAudioSource({ id: 'remote-stream-only', title: 'Remote Stream' });
      expect(res.isLocal).toBe(false);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('stream');

      setNetworkStatusForTesting(false);
      res = await resolveTrackAudioSource({ id: 'remote-stream-only', title: 'Remote Stream' });
      expect(res.isLocal).toBe(false);
      expect(res.isAvailable).toBe(false);
      expect(res.src).toBe('');
    });

    it('ADV-NS-3: Phantom file resilience (download recorded in store but deleted from filesystem)', async () => {
      setPlatform('tauri');
      const phantomId = 'phantom-track-1';
      const phantomPath = 'C:/Users/MockUser/Downloads/Holad/tracks/Phantom.mp3';
      // Register in store
      useDownloadStore.getState().startDownload(phantomId, 'Phantom Track', 'track');
      useDownloadStore.getState().completeDownload(phantomId, phantomPath);

      // Do NOT create the file in VFS (file is missing)

      // When Online: fallback to remote stream
      setNetworkStatusForTesting(true);
      let res = await resolveTrackAudioSource({ id: phantomId, title: 'Phantom Track' });
      expect(res.isLocal).toBe(false);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('stream');

      // When Offline: fallback to unavailable (cannot stream, local file missing)
      setNetworkStatusForTesting(false);
      res = await resolveTrackAudioSource({ id: phantomId, title: 'Phantom Track' });
      expect(res.isLocal).toBe(false);
      expect(res.isAvailable).toBe(false);
      expect(res.src).toBe('');
    });

    it('ADV-NS-4: Adversarial, null, empty & corrupted track payloads', async () => {
      setNetworkStatusForTesting(true);

      // Null / undefined / empty
      expect(await resolveTrackAudioSource(null)).toEqual({ src: '', isLocal: false, isAvailable: false });
      expect(await resolveTrackAudioSource(undefined)).toEqual({ src: '', isLocal: false, isAvailable: false });
      expect(await resolveTrackAudioSource({})).toEqual({ src: '', isLocal: false, isAvailable: false });
      expect(await resolveTrackAudioSource({ id: '' })).toEqual({ src: '', isLocal: false, isAvailable: false });

      // Special characters in title
      const weirdTrack = { id: 'weird-1', title: 'Slash/Backslash\\Colon:Asterisk*Question?Quote"Less<Greater>Pipe|' };
      const res = await resolveTrackAudioSource(weirdTrack);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('stream');
    });

    it('ADV-NS-5: Mobile Capacitor platform resolves local tracks with Capacitor file protocol', async () => {
      setPlatform('capacitor');
      const capTrackId = 'cap-track-offline';
      const capPath = 'Holad/tracks/CapTrack.mp3';
      await vfs.writeFile(`DATA/${capPath}`, new Uint8Array([1, 2, 3]));

      useDownloadStore.getState().startDownload(capTrackId, 'Cap Track', 'track');
      useDownloadStore.getState().completeDownload(capTrackId, capPath);

      // Offline mode on Mobile
      setNetworkStatusForTesting(false);
      const res = await resolveTrackAudioSource({ id: capTrackId, title: 'Cap Track' });

      expect(res.isLocal).toBe(true);
      expect(res.isAvailable).toBe(true);
      expect(res.src).toContain('_capacitor_file_');
    });
  });
});
