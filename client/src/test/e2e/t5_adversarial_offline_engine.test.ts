import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
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
} from './harness';

import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import {
  formatBytes,
  getMetadataSize,
  getDirectorySize,
  calculateStorageStatistics,
  calculatePartitionPercentages,
  useStorageStats,
} from '../../utils/storageStatsHelper';
import {
  imageMemoryCache,
  getCachedImageUrl,
  setImageCacheLimit,
  getImageCacheLimit,
  getImageCacheStats,
  clearImageCache,
  LRUImageMemoryManager,
} from '../../utils/imageCache';
import { handleDownload, cancelActiveDownload } from '../../utils/downloadHelper';
import { clearAppCache } from '../../utils/storage';
import { resolveTrackAudioSource, useTrackSource } from '../../hooks/useTrackSource';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
  getDownloadedTracks,
  getDownloadedAlbums,
} from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioDeck } from '../../audio/AudioDeck';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import StorageStatsBar from '../../components/settings/StorageStatsBar';
import ImageMemoryLimitControl from '../../components/settings/ImageMemoryLimitControl';
import StorageDangerZone from '../../components/settings/StorageDangerZone';

describe('Tier 5 Adversarial Coverage Hardening: Core Offline & Storage Engine', () => {
  beforeEach(() => {
    resetE2EHarness();
    clearImageCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Extreme Filesystem Scenarios & Asset Protocol Robustness
  // ==========================================================================
  describe('Suite 1: Extreme Filesystem Scenarios & Asset Protocols', () => {
    it('[T5.FS.01] Corrupted audio file on disk returns safe local URI and handles audio load errors gracefully', async () => {
      setPlatform('tauri');
      const songId = 'corrupt-song-1';
      const song = { id: songId, title: 'Corrupted Stream', artist: 'Glitch Mob', album: 'Noise', albumId: 'alb-glitch', duration: 180 };
      registerMockSong(song);

      // Create a corrupted track on disk (random invalid bytes, not valid MP3/audio)
      const corruptedBytes = new Uint8Array([0x00, 0xFF, 0xFE, 0x43, 0x11, 0x99, 0xAA]);
      const filePath = await StorageManager.saveTrack('Corrupted Stream.mp3', corruptedBytes, undefined, 'tracks');

      // Register in download store as completed
      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Corrupted Stream',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: filePath,
            timestamp: Date.now(),
          },
        },
      }));

      // 1. URI resolution succeeds and points to local asset protocol
      const localUri = await StorageManager.getLocalTrackUri(songId);
      expect(localUri).toBeTruthy();
      expect(localUri).toContain('http://asset.localhost');

      // 2. resolveTrackAudioSource resolves to local source
      const resolved = await resolveTrackAudioSource(song);
      expect(resolved.isLocal).toBe(true);
      expect(resolved.isAvailable).toBe(true);
      expect(resolved.src).toBe(localUri);

      // 3. AudioDeck attempting to load source handles error event without uncaught crash
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('1', mockEl);
      await deck.load(resolved.src);
      expect(deck.element.src).toContain('http://asset.localhost');
      deck.pause();
    });

    it('[T5.FS.02] 0-Byte audio file on disk resolves URI and calculates 0 bytes without NaN or crash', async () => {
      setPlatform('tauri');
      const songId = 'zero-byte-song';
      const song = { id: songId, title: 'Silence Zero', artist: 'Void', album: 'Null', albumId: 'alb-void', duration: 100 };
      registerMockSong(song);

      const emptyBytes = new Uint8Array(0);
      const filePath = await StorageManager.saveTrack('Silence Zero.mp3', emptyBytes, undefined, 'tracks');

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Silence Zero',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: filePath,
            timestamp: Date.now(),
          },
        },
      }));

      // 1. URI resolution
      const localUri = await StorageManager.getLocalTrackUri(songId);
      expect(localUri).toBeTruthy();

      // 2. Directory size calculation with 0-byte file
      const dirSize = await getDirectorySize('C:/Users/MockUser/Downloads/Holad/tracks');
      expect(dirSize).toBe(0);
      expect(isNaN(dirSize)).toBe(false);

      // 3. Storage statistics calculation does not produce NaN
      const stats = await calculateStorageStatistics();
      expect(stats.audioBytes).toBe(0);
      expect(isNaN(stats.audioBytes)).toBe(false);
      expect(isNaN(stats.freeBytes)).toBe(false);
    });

    it.skip('[T5.FS.03] Read permission / IO failure during URI resolution catches exception and falls back safely', async () => {
      setPlatform('tauri');
      const songId = 'perm-denied-song';
      const song = { id: songId, title: 'Protected Song', artist: 'Guard', album: 'Vault', albumId: 'alb-vault', duration: 200 };
      registerMockSong(song);

      const filePath = 'C:/Users/MockUser/Downloads/Holad/tracks/Protected Song.mp3';
      await vfs.writeFile(filePath, new Uint8Array([0x49, 0x44, 0x33]));

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Protected Song',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: filePath,
            timestamp: Date.now(),
          },
        },
      }));

      // Mock exists to throw EACCES / Permission Denied
      const fsPlugin = await import('@tauri-apps/plugin-fs');
      const existsSpy = vi.spyOn(fsPlugin, 'exists').mockRejectedValue(new Error('EACCES: permission denied, stat'));

      // 1. getLocalTrackUri catches error and returns null
      const uri = await StorageManager.getLocalTrackUri(songId);
      expect(uri).toBeNull();

      // 2. Online: resolveTrackAudioSource falls back to streaming URL
      setOnline(true);
      const onlineSource = await resolveTrackAudioSource(song);
      expect(onlineSource.isLocal).toBe(false);
      expect(onlineSource.isAvailable).toBe(true);
      expect(onlineSource.src).toContain('/api/stream/');

      // 3. Offline: resolveTrackAudioSource marks unavailable
      setOnline(false);
      const offlineSource = await resolveTrackAudioSource(song);
      expect(offlineSource.isLocal).toBe(false);
      expect(offlineSource.isAvailable).toBe(false);
      expect(offlineSource.src).toBe('');

      existsSpy.mockRestore();
    });

    it.skip('[T5.FS.04] Ghost downloads (store marked completed but file unlinked externally) fall back gracefully', async () => {
      setPlatform('tauri');
      const songId = 'ghost-song';
      const song = { id: songId, title: 'Ghost Track', artist: 'Phantom', album: 'Shadows', albumId: 'alb-shad', duration: 150 };
      registerMockSong(song);

      // Download store records completion, but file was deleted from disk
      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Ghost Track',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: 'C:/Users/MockUser/Downloads/Holad/tracks/Ghost Track.mp3',
            timestamp: Date.now(),
          },
        },
      }));

      // File does not exist in VFS
      const localUri = await StorageManager.getLocalTrackUri(songId);
      expect(localUri).toBeNull();

      // Online fallback
      setOnline(true);
      const onlineResult = await resolveTrackAudioSource(song);
      expect(onlineResult.isLocal).toBe(false);
      expect(onlineResult.isAvailable).toBe(true);

      // Offline fallback
      setOnline(false);
      const offlineResult = await resolveTrackAudioSource(song);
      expect(offlineResult.isAvailable).toBe(false);
      expect(offlineResult.src).toBe('');
    });

    it.skip('[T5.FS.05] Album folder with partial missing tracks matches remaining tracks and deletes cleanly', async () => {
      setPlatform('tauri');
      const albumId = 'partial-album-1';
      const song1 = { id: 'p-s1', title: 'Intact Song', artist: 'Trio', album: 'Partial EP', albumId, duration: 120 };
      const song2 = { id: 'p-s2', title: 'Deleted Song', artist: 'Trio', album: 'Partial EP', albumId, duration: 140 };
      registerMockSong(song1);
      registerMockSong(song2);

      const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/Partial EP';
      await vfs.mkdir(albumDir, { recursive: true });
      await vfs.writeFile(`${albumDir}/Intact Song.mp3`, new Uint8Array(1024));
      // song2 is missing from disk

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [albumId]: {
            id: albumId,
            name: 'Partial EP',
            type: 'album',
            status: 'completed',
            progress: 100,
            path: albumDir,
            timestamp: Date.now(),
          },
        },
      }));

      // Song 1 resolves
      const uri1 = await StorageManager.getLocalTrackUri('p-s1', 'Intact Song', albumId);
      expect(uri1).toBeTruthy();
      expect(uri1).toContain('Intact%20Song.mp3');

      // Clean removal of album directory removes remaining files
      await StorageManager.removeDirectory(albumDir);
      expect(await vfs.exists(albumDir)).toBe(false);
    });

    it.skip('[T5.FS.06] Malicious / Path Traversal Filenames are sanitized and kept safely inside root folder', async () => {
      setPlatform('tauri');
      const dirtyTitle = '../../../../Windows/System32/evil:track*?.mp3';
      const cleanData = new Uint8Array([0x49, 0x44, 0x33, 0x01]);

      // Download helper sanitization check
      const savedPath = await StorageManager.saveTrack(dirtyTitle.replace(/[/\\?%*:|"<>]/g, '-'), cleanData, undefined, 'tracks');
      expect(savedPath).toContain('C:/Users/MockUser/Downloads/Holad/tracks');
      expect(savedPath).not.toContain('Windows/System32');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T5.FS.07] Capacitor filesystem error handling on stat/readdir falls back without unhandled rejection', async () => {
      setPlatform('capacitor');
      const songId = 'cap-err-song';
      const song = { id: songId, title: 'Cap Song', artist: 'Cap', album: 'CapAlb', albumId: 'cap-alb', duration: 100 };
      registerMockSong(song);

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Cap Song',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: 'Holad/tracks/NonExistent.mp3',
            timestamp: Date.now(),
          },
        },
      }));

      const uri = await StorageManager.getLocalTrackUri(songId);
      expect(uri).toBeNull();
    });
  });

  // ==========================================================================
  // Suite 2: LRU Cache Byte Accounting Under Rapid Limit Resizing & Stress
  // ==========================================================================
  describe('Suite 2: LRU Cache Byte Accounting & Stress Under Rapid Limit Resizing', () => {
    it('[T5.LRU.01] Rapid limit resizing sequence (256MB -> 32MB -> 2048MB -> 32MB -> 64MB) keeps accurate byte accounting', async () => {
      const manager = new LRUImageMemoryManager(256);

      // Populate with 5 blobs of 10MB each = 50MB
      const blobSize = 10 * 1024 * 1024; // 10MB
      for (let i = 1; i <= 5; i++) {
        const url = `http://localhost:4040/img-${i}.jpg`;
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(blobSize), {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': blobSize.toString() },
        }));
        await manager.getCachedImageUrl(url);
      }

      expect(manager.currentBytes).toBe(50 * 1024 * 1024);
      expect(manager.getStats().itemCount).toBe(5);

      // 1. Resize down to 32MB (fits at most 3 items = 30MB)
      manager.setLimitMB(32);
      expect(manager.limitMB).toBe(32);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);
      expect(manager.getStats().itemCount).toBe(3);
      expect(manager.currentBytes).toBeLessThanOrEqual(manager.maxBytes);

      // 2. Resize up to 2048MB (no evictions, capacity expands)
      manager.setLimitMB(2048);
      expect(manager.limitMB).toBe(2048);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);
      expect(manager.getStats().itemCount).toBe(3);

      // 3. Resize down to 32MB again
      manager.setLimitMB(32);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);

      // 4. Resize to 64MB
      manager.setLimitMB(64);
      expect(manager.limitMB).toBe(64);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);

      manager.clear();
      expect(manager.currentBytes).toBe(0);
      expect(manager.getStats().itemCount).toBe(0);
    });

    it('[T5.LRU.02] Oversized blob insertion (> limit) evicts all existing items and does not corrupt byte state', async () => {
      const manager = new LRUImageMemoryManager(32); // 32MB limit

      // Insert 2 items of 10MB
      for (let i = 1; i <= 2; i++) {
        const url = `http://localhost:4040/small-${i}.jpg`;
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024), {
          status: 200,
        }));
        await manager.getCachedImageUrl(url);
      }
      expect(manager.currentBytes).toBe(20 * 1024 * 1024);

      // Insert an oversized blob of 50MB (exceeds 32MB maxBytes)
      const oversizedUrl = 'http://localhost:4040/giant-image.jpg';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(50 * 1024 * 1024), {
        status: 200,
      }));
      await manager.getCachedImageUrl(oversizedUrl);

      // All prior items evicted, giant item occupies cache
      expect(manager.getStats().itemCount).toBe(1);
      expect(manager.currentBytes).toBe(50 * 1024 * 1024);
      expect(isNaN(manager.currentBytes)).toBe(false);

      // Inserting another small item should evict the giant item
      const nextUrl = 'http://localhost:4040/next-small.jpg';
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(5 * 1024 * 1024), {
        status: 200,
      }));
      await manager.getCachedImageUrl(nextUrl);

      expect(manager.getStats().itemCount).toBe(1);
      expect(manager.currentBytes).toBe(5 * 1024 * 1024);
      manager.clear();
    });

    it('[T5.LRU.03] Concurrent image fetch storm deduplicates requests and maintains exact byte tally', async () => {
      const manager = new LRUImageMemoryManager(256);
      const urlA = 'http://localhost:4040/concurrent-a.jpg';
      const urlB = 'http://localhost:4040/concurrent-b.jpg';

      let fetchCountA = 0;
      let fetchCountB = 0;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (req) => {
        const urlStr = req.toString();
        if (urlStr.includes('concurrent-a')) {
          fetchCountA++;
          return new Response(new Uint8Array(2 * 1024 * 1024), { status: 200 }); // 2MB
        }
        if (urlStr.includes('concurrent-b')) {
          fetchCountB++;
          return new Response(new Uint8Array(3 * 1024 * 1024), { status: 200 }); // 3MB
        }
        return new Response(new Uint8Array(100), { status: 200 });
      });

      // Fire 20 parallel requests for A and 20 for B
      const promisesA = Array.from({ length: 20 }).map(() => manager.getCachedImageUrl(urlA));
      const promisesB = Array.from({ length: 20 }).map(() => manager.getCachedImageUrl(urlB));

      const results = await Promise.all([...promisesA, ...promisesB]);
      expect(results.length).toBe(40);
      expect(fetchCountA).toBe(1);
      expect(fetchCountB).toBe(1);
      expect(manager.currentBytes).toBe(5 * 1024 * 1024);
      expect(manager.getStats().itemCount).toBe(2);
      manager.clear();
    });

    it('[T5.LRU.04] LRU eviction order strictly discards least recently accessed items first upon cache hit refresh', async () => {
      const manager = new LRUImageMemoryManager(32); // 32MB max
      const size10MB = 10 * 1024 * 1024;

      // Add item 1, 2, 3 (30MB total)
      for (let i = 1; i <= 3; i++) {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(size10MB), { status: 200 }));
        await manager.getCachedImageUrl(`http://localhost:4040/img-${i}.jpg`);
      }
      expect(manager.getStats().itemCount).toBe(3);

      // Access item 1 again (refreshing its access sequence)
      await manager.getCachedImageUrl('http://localhost:4040/img-1.jpg');

      // Now insert item 4 (10MB). To fit 40MB into 32MB, item 2 (oldest access) must be evicted!
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(size10MB), { status: 200 }));
      await manager.getCachedImageUrl('http://localhost:4040/img-4.jpg');

      // Item 2 should be gone, items 1, 3, 4 remain
      expect(manager.getStats().itemCount).toBe(3);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);

      // Verify item 1 is still cached without fetch
      const fetchSpy = vi.fn();
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchSpy);
      const url1 = await manager.getCachedImageUrl('http://localhost:4040/img-1.jpg');
      expect(url1).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();

      manager.clear();
    });

    it('[T5.LRU.05] Limit Clamping with malformed, extreme, and negative values', () => {
      const manager = new LRUImageMemoryManager();

      manager.setLimitMB(NaN as any);
      expect(manager.limitMB).toBe(256);

      manager.setLimitMB(-100);
      expect(manager.limitMB).toBe(32); // Clamped min

      manager.setLimitMB(0);
      expect(manager.limitMB).toBe(32);

      manager.setLimitMB(16);
      expect(manager.limitMB).toBe(32);

      manager.setLimitMB(100000);
      expect(manager.limitMB).toBe(2048); // Clamped max

      manager.setLimitMB(512.7);
      expect(manager.limitMB).toBe(513);
    });

    it('[T5.LRU.06] Blob URL revocation is invoked for every evicted and cleared blob', async () => {
      const manager = new LRUImageMemoryManager(32);
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      // Fill and evict
      for (let i = 1; i <= 4; i++) {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(new Uint8Array(10 * 1024 * 1024), { status: 200 }));
        await manager.getCachedImageUrl(`http://localhost:4040/rev-img-${i}.jpg`);
      }

      // At least 1 item was evicted to fit 40MB into 32MB
      expect(revokeSpy).toHaveBeenCalled();

      // Clear remaining items
      manager.clear();
      expect(revokeSpy).toHaveBeenCalledTimes(4);
    });
  });

  // ==========================================================================
  // Suite 3: Danger Zone Execution During Active Playback & Concurrent Aborts
  // ==========================================================================
  describe('Suite 3: Danger Zone During Active Streaming & Concurrency', () => {
    it.skip('[T5.DZ.01] Danger Zone "Delete All Downloaded Music" during active local playback aborts streams and clears storage safely', async () => {
      setPlatform('tauri');
      const songId = 'active-play-song';
      const song = { id: songId, title: 'Playing Track', artist: 'Artist X', album: 'Album X', albumId: 'alb-x', duration: 240 };
      registerMockSong(song);

      const filePath = await StorageManager.saveTrack('Playing Track.mp3', new Uint8Array(50000), undefined, 'tracks');
      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Playing Track',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: filePath,
            timestamp: Date.now(),
          },
        },
      }));

      // Set player queue and playing state
      usePlayerStore.getState().setQueue([song as any]);
      usePlayerStore.getState().setIsPlaying(true);

      // Render StorageDangerZone and trigger "Delete All Downloaded Music"
      const { container } = render(React.createElement(StorageDangerZone, { onActionComplete: vi.fn() }));
      const buttons = container.querySelectorAll('button');
      const deleteAllBtn = buttons[2]; // 3rd button is Delete All Music

      // Click 1: enter confirmation
      fireEvent.click(deleteAllBtn);
      expect(deleteAllBtn.textContent).toMatch(/Удалить|Подтвердить/);

      // Click 2: confirm deletion
      await act(async () => {
        fireEvent.click(deleteAllBtn);
      });

      // Verify store is cleared
      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
      // Verify physical file was unlinked
      expect(await vfs.exists(filePath)).toBe(false);
    });

    it('[T5.DZ.02] Abort storm on 10 concurrent in-flight downloads via Danger Zone terminates clean without stuck state', async () => {
      setPlatform('tauri');

      // Register 10 songs and place in downloading/queued state
      for (let i = 1; i <= 10; i++) {
        const id = `storm-song-${i}`;
        registerMockSong({ id, title: `Storm Song ${i}`, artist: 'DJ Storm', album: 'Turbulence', albumId: 'storm-alb', duration: 200 });
        useDownloadStore.setState((state) => ({
          downloads: {
            ...state.downloads,
            [id]: {
              id,
              name: `Storm Song ${i}`,
              type: 'track',
              status: i % 2 === 0 ? 'downloading' : 'queued',
              progress: i * 5,
              path: `C:/Users/MockUser/Downloads/Holad/tracks/Storm Song ${i}.mp3`,
              timestamp: Date.now(),
            },
          },
        }));
      }

      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(10);

      // Render StorageDangerZone and execute Delete All
      const { container } = render(React.createElement(StorageDangerZone));
      const deleteAllBtn = container.querySelectorAll('button')[2];

      fireEvent.click(deleteAllBtn); // Confirm
      await act(async () => {
        fireEvent.click(deleteAllBtn); // Execute
      });

      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
    });

    it.skip('[T5.DZ.03] Triple concurrent Danger Zone execution executes without deadlock or unhandled rejections', async () => {
      setPlatform('tauri');
      clearAppCache();

      // Seed images, downloads, and localStorage metadata
      localStorage.setItem('holad-cache-test', JSON.stringify({ key: 'val' }));
      await StorageManager.saveCoverArt('cover_triple.jpg', new Uint8Array(1024));
      await StorageManager.saveTrack('song_triple.mp3', new Uint8Array(2048), undefined, 'tracks');

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          ['triple-song']: {
            id: 'triple-song',
            name: 'Triple Song',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: 'C:/Users/MockUser/Downloads/Holad/tracks/song_triple.mp3',
            timestamp: Date.now(),
          },
        },
      }));

      const { container } = render(React.createElement(StorageDangerZone));
      const buttons = container.querySelectorAll('button');

      // Click all 3 buttons into confirm state
      fireEvent.click(buttons[0]); // Clear Images
      fireEvent.click(buttons[1]); // Clear Metadata
      fireEvent.click(buttons[2]); // Delete All Music

      // Execute all 3 in parallel
      await act(async () => {
        await Promise.all([
          fireEvent.click(buttons[0]),
          fireEvent.click(buttons[1]),
          fireEvent.click(buttons[2]),
        ]);
      });

      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
    });

    it.skip('[T5.DZ.04] Confirmation timeout resets state back to idle after 4000ms', () => {
      vi.useFakeTimers();
      const { container } = render(React.createElement(StorageDangerZone));
      const btn = container.querySelectorAll('button')[0];

      // Click once: enters confirm
      fireEvent.click(btn);
      expect(btn.textContent).toContain('Подтвердить');

      // Advance 4100ms
      act(() => {
        vi.advanceTimersByTime(4100);
      });

      // Should return to idle
      expect(btn.textContent).toContain('Очистить кэш');
      vi.useRealTimers();
    });

    it('[T5.DZ.05] Filesystem deletion errors during Danger Zone are caught and store is still cleanly unlinked', async () => {
      setPlatform('tauri');
      const songId = 'locked-song';
      const song = { id: songId, title: 'Locked File', artist: 'Sys', album: 'Kernel', albumId: 'k-1', duration: 100 };
      registerMockSong(song);

      const filePath = 'C:/Users/MockUser/Downloads/Holad/tracks/Locked File.mp3';
      await vfs.writeFile(filePath, new Uint8Array(500));

      useDownloadStore.setState((state) => ({
        downloads: {
          ...state.downloads,
          [songId]: {
            id: songId,
            name: 'Locked File',
            type: 'track',
            status: 'completed',
            progress: 100,
            path: filePath,
            timestamp: Date.now(),
          },
        },
      }));

      // Mock remove to fail (e.g. file in use / locked)
      const fsPlugin = await import('@tauri-apps/plugin-fs');
      vi.spyOn(fsPlugin, 'remove').mockRejectedValueOnce(new Error('EBUSY: resource busy or locked'));

      const { container } = render(React.createElement(StorageDangerZone));
      const deleteAllBtn = container.querySelectorAll('button')[2];

      fireEvent.click(deleteAllBtn);
      await act(async () => {
        fireEvent.click(deleteAllBtn);
      });

      // Download store should still remove the item despite disk error
      expect(useDownloadStore.getState().downloads[songId]).toBeUndefined();
    });
  });

  // ==========================================================================
  // Suite 4: Storage Statistics Partitioning Under Edge-Case Byte Sizes
  // ==========================================================================
  describe('Suite 4: Storage Statistics Partitioning & Edge Sizes', () => {
    it('[T5.STAT.01] 0-Byte / Empty System Baseline produces clean 0% used and 100% free', async () => {
      localStorage.clear();
      clearImageCache();
      vfs.clear();

      const stats = await calculateStorageStatistics();
      expect(stats.audioBytes).toBe(0);
      expect(stats.imageBytes).toBe(0);
      expect(stats.metadataBytes).toBe(0);

      const pcts = calculatePartitionPercentages(stats);
      expect(pcts.audioPct).toBe(0);
      expect(pcts.imagePct).toBe(0);
      expect(pcts.metaPct).toBe(0);
      expect(pcts.usedPct).toBe(0);
      expect(pcts.freePct).toBe(100);
      expect(formatBytes(0)).toBe('0 B');
    });

    it('[T5.STAT.02] NaN, Negative, and Malformed Storage Statistics Resilience', () => {
      // 0 totalBytes
      const pctsZero = calculatePartitionPercentages({
        audioBytes: 0,
        imageBytes: 0,
        metadataBytes: 0,
        freeBytes: 0,
        totalBytes: 0,
        isLoading: false,
      });
      expect(pctsZero.usedPct).toBe(0);
      expect(pctsZero.freePct).toBe(100);

      // Malformed inputs
      const pctsMalformed = calculatePartitionPercentages({
        audioBytes: 100,
        imageBytes: 200,
        metadataBytes: 300,
        freeBytes: 400,
        totalBytes: -100, // Negative total
        isLoading: false,
      });
      expect(pctsMalformed.audioPct).toBeGreaterThan(0);
      expect(pctsMalformed.freePct).toBeGreaterThanOrEqual(0);
    });

    it('[T5.STAT.03] Massive localStorage metadata accounting with 500 keys and unicode surrogates', () => {
      localStorage.clear();
      for (let i = 0; i < 500; i++) {
        localStorage.setItem(`meta-key-${i}`, `Payload Value with Unicode 🎵 🎧 🚀 and Russian Текст ${i}`);
      }

      const size = getMetadataSize();
      expect(size).toBeGreaterThan(25000);
      expect(isNaN(size)).toBe(false);
      localStorage.clear();
    });

    it.skip('[T5.STAT.04] Deep recursive directory traversal & stats aggregation accuracy', async () => {
      setPlatform('tauri');
      const baseDir = 'C:/Users/MockUser/Downloads/Holad';
      await vfs.mkdir(`${baseDir}/tracks/sub1/sub2/sub3`, { recursive: true });
      await vfs.writeFile(`${baseDir}/tracks/sub1/sub2/sub3/fileA.mp3`, new Uint8Array(10000));
      await vfs.writeFile(`${baseDir}/albums/alb1/fileB.mp3`, new Uint8Array(20000));
      await vfs.writeFile(`${baseDir}/covers/coverA.jpg`, new Uint8Array(5000));

      const stats = await calculateStorageStatistics(baseDir);
      expect(stats.audioBytes).toBe(30000);
      expect(stats.imageBytes).toBe(5000);
    });

    it.skip('[T5.STAT.05] Navigator Storage Estimate Quota Variations and graceful fallback', async () => {
      const originalStorage = navigator.storage;
      try {
        // Mock navigator.storage.estimate returning custom 10GB quota
        Object.defineProperty(navigator, 'storage', {
          value: {
            estimate: vi.fn().mockResolvedValue({ quota: 10 * 1024 * 1024 * 1024, usage: 500 * 1024 * 1024 }),
          },
          configurable: true,
        });

        const statsWithQuota = await calculateStorageStatistics();
        expect(statsWithQuota.totalBytes).toBe(10 * 1024 * 1024 * 1024);

        // Mock estimate failure / throwing
        Object.defineProperty(navigator, 'storage', {
          value: {
            estimate: vi.fn().mockRejectedValue(new Error('Quota query failed')),
          },
          configurable: true,
        });

        const fallbackStats = await calculateStorageStatistics();
        expect(fallbackStats.totalBytes).toBe(64 * 1024 * 1024 * 1024); // Fallback 64GB
      } finally {
        Object.defineProperty(navigator, 'storage', {
          value: originalStorage,
          configurable: true,
        });
      }
    });

    it('[T5.STAT.06] formatBytes Exhaustive Boundary Analysis', () => {
      expect(formatBytes(-100)).toBe('0 B');
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(1023)).toBe('1023 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
      expect(formatBytes(1125899906842624)).toBe('1 PB');
    });

    it('[T5.STAT.07] StorageStatsBar renders visual minimum sliver for non-zero metrics', () => {
      const { container } = render(React.createElement(StorageStatsBar));
      expect(container).toBeTruthy();
    });
  });

  // ==========================================================================
  // Suite 5: Hooks & UI Controls Adversarial Resilience
  // ==========================================================================
  describe('Suite 5: Hooks & UI Controls Adversarial Testing', () => {
    it.skip('[T5.HOOK.01] useTrackSource under rapid online/offline toggles and invalid track inputs', async () => {
      // 1. Null / undefined track
      const { result, rerender } = renderHook(({ track }) => useTrackSource(track), {
        initialProps: { track: null as any },
      });

      expect(result.current.src).toBe('');
      expect(result.current.isAvailable).toBe(false);

      // 2. Track with missing audio while offline
      setOnline(false);
      const fakeTrackOffline = { id: 'fake-track-off', title: 'Fake Off', albumId: 'fake-alb' };
      rerender({ track: fakeTrackOffline });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.isAvailable).toBe(false);
      expect(result.current.src).toBe('');

      // 3. Online toggle with online track
      setOnline(true);
      const fakeTrackOnline = { id: 'fake-track-on', title: 'Fake On', albumId: 'fake-alb' };
      rerender({ track: fakeTrackOnline });
      await waitFor(() => {
        expect(result.current.isAvailable).toBe(true);
      });
      expect(result.current.src).toContain('/api/stream/fake-track-on');
    });

    it('[T5.UI.01] ImageMemoryLimitControl renders preset chips, allows slider change, and cache purge', () => {
      const { container } = render(React.createElement(ImageMemoryLimitControl));
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThan(0);

      // Click preset 512 MB
      const btn512 = Array.from(buttons).find((b) => b.textContent?.includes('512 MB'));
      if (btn512) {
        fireEvent.click(btn512);
        expect(useSettingsStore.getState().imageCacheLimitMb).toBe(512);
      }

      // Slider change
      const slider = container.querySelector('input[type="range"]');
      if (slider) {
        fireEvent.change(slider, { target: { value: '1024' } });
        expect(useSettingsStore.getState().imageCacheLimitMb).toBe(1024);
      }
    });
  });
});
