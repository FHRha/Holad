import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
} from '../e2e/harness';

import {
  LRUImageMemoryManager,
  getCachedImageUrl,
  setImageCacheLimit,
  getImageCacheLimit,
  getImageCacheStats,
  clearImageCache,
  imageMemoryCache,
} from '../../utils/imageCache';
import { useSettingsStore } from '../../store/settingsStore';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import StorageDangerZone from '../../components/settings/StorageDangerZone';

describe('Milestone 2 Challenger: Image Cache & Storage Stress Harness', () => {
  let revokeSpy: any;

  beforeEach(() => {
    clearImageCache();
    resetE2EHarness();
    clearImageCache();
    vi.clearAllMocks();
    revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Dimension 1: Rapid Image Additions & Strict LRU Eviction Under Pressure
  // ==========================================================================
  describe('Dimension 1: Rapid Image Additions & LRU Eviction Ordering', () => {
    it('[CHALLENGE-01] Adding 100 images sequentially to a 32MB cache evicts oldest in exact sequential order', () => {
      const manager = new LRUImageMemoryManager(32); // 32MB limit = 33,554,432 bytes
      const itemSize = 1 * 1024 * 1024; // 1MB per item -> max 32 items capacity
      const totalItems = 100;
      const createdBlobUrls: string[] = [];

      for (let i = 1; i <= totalItems; i++) {
        const url = `https://music.server.local/art/album-${i}.jpg`;
        const blobUrl = `blob:http://localhost/blob-album-${i}`;
        createdBlobUrls.push(blobUrl);

        manager.evictToFit(itemSize);
        (manager as any).cache.set(url, {
          blobUrl,
          sizeBytes: itemSize,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += itemSize;
      }

      // At 32MB capacity with 1MB items, exactly 32 items should remain (items 69 to 100)
      expect((manager as any).cache.size).toBe(32);
      expect(manager.currentBytes).toBe(32 * 1024 * 1024);

      // Verify items 1 to 68 were evicted in order
      for (let i = 1; i <= 68; i++) {
        const url = `https://music.server.local/art/album-${i}.jpg`;
        expect((manager as any).cache.has(url)).toBe(false);
      }

      // Verify items 69 to 100 remain in cache
      for (let i = 69; i <= 100; i++) {
        const url = `https://music.server.local/art/album-${i}.jpg`;
        expect((manager as any).cache.has(url)).toBe(true);
      }

      // Verify URL.revokeObjectURL was called exactly 68 times with the first 68 blobs
      expect(revokeSpy).toHaveBeenCalledTimes(68);
      for (let i = 1; i <= 68; i++) {
        expect(revokeSpy).toHaveBeenCalledWith(`blob:http://localhost/blob-album-${i}`);
      }
    });

    it('[CHALLENGE-02] Repeatedly accessing older items promotes their LRU ranking, evicting newer untouched items', () => {
      const manager = new LRUImageMemoryManager(32);
      const itemSize = 10 * 1024 * 1024; // 10MB each -> holds 3 items (30MB <= 32MB)

      const put = (key: string, blob: string, size: number) => {
        manager.evictToFit(size);
        (manager as any).cache.set(key, {
          blobUrl: blob,
          sizeBytes: size,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += size;
      };

      put('img-1', 'blob:img-1', itemSize);
      put('img-2', 'blob:img-2', itemSize);
      put('img-3', 'blob:img-3', itemSize);

      expect(manager.currentBytes).toBe(30 * 1024 * 1024);

      // Access img-1 (making it the most recently used!)
      const hit = (manager as any).cache.get('img-1')!;
      hit.accessSeq = ++(manager as any).accessCounter;
      hit.lastAccessed = Date.now();

      // Now add img-4 (10MB) -> cache total would be 40MB > 32MB -> must evict 1 item.
      // img-2 is the oldest (seq 2), img-3 is seq 3, img-1 is seq 4.
      // Therefore, img-2 MUST be evicted!
      put('img-4', 'blob:img-4', itemSize);

      expect((manager as any).cache.has('img-1')).toBe(true); // Retained because accessed!
      expect((manager as any).cache.has('img-2')).toBe(false); // Evicted!
      expect((manager as any).cache.has('img-3')).toBe(true); // Retained
      expect((manager as any).cache.has('img-4')).toBe(true); // Newly added

      expect(revokeSpy).toHaveBeenCalledWith('blob:img-2');
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:img-1');
    });

    it('[CHALLENGE-03] Stats calculation accurately updates metrics under rapid insertions and evictions', () => {
      const manager = new LRUImageMemoryManager(64); // 64MB
      const size15MB = 15 * 1024 * 1024;

      for (let i = 1; i <= 6; i++) {
        manager.evictToFit(size15MB);
        (manager as any).cache.set(`item-${i}`, {
          blobUrl: `blob-${i}`,
          sizeBytes: size15MB,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += size15MB;
      }

      // 6 * 15MB = 90MB > 64MB. Max 4 items fit (60MB). 2 items evicted.
      const stats = manager.getStats();
      expect(stats.limitMB).toBe(64);
      expect(stats.limitBytes).toBe(64 * 1024 * 1024);
      expect(stats.itemCount).toBe(4);
      expect(stats.currentBytes).toBe(60 * 1024 * 1024);
      expect(stats.usagePercent).toBeCloseTo((60 / 64) * 100, 2);
    });
  });

  // ==========================================================================
  // Dimension 2: Dynamic Limit Resizing (Downward & Upward)
  // ==========================================================================
  describe('Dimension 2: Dynamic Limit Resizing Stress', () => {
    it('[CHALLENGE-04] Dynamically dropping limit from 512MB to 64MB while full forces immediate eviction and blob revocation', () => {
      const manager = new LRUImageMemoryManager(512);
      const chunkSize = 20 * 1024 * 1024; // 20MB per chunk

      // Fill with 20 items (400MB total)
      for (let i = 1; i <= 20; i++) {
        manager.evictToFit(chunkSize);
        (manager as any).cache.set(`large-${i}`, {
          blobUrl: `blob:large-${i}`,
          sizeBytes: chunkSize,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += chunkSize;
      }

      expect(manager.currentBytes).toBe(400 * 1024 * 1024);
      expect((manager as any).cache.size).toBe(20);
      expect(revokeSpy).not.toHaveBeenCalled();

      // Dynamic resize downward to 64MB
      manager.setLimitMB(64);

      // 64MB can only fit 3 items of 20MB (60MB)
      expect(manager.limitMB).toBe(64);
      expect(manager.currentBytes).toBe(60 * 1024 * 1024);
      expect((manager as any).cache.size).toBe(3);

      // Items 1 through 17 should be evicted and revoked
      expect(revokeSpy).toHaveBeenCalledTimes(17);
      for (let i = 1; i <= 17; i++) {
        expect((manager as any).cache.has(`large-${i}`)).toBe(false);
        expect(revokeSpy).toHaveBeenCalledWith(`blob:large-${i}`);
      }

      // Items 18, 19, 20 must remain
      expect((manager as any).cache.has('large-18')).toBe(true);
      expect((manager as any).cache.has('large-19')).toBe(true);
      expect((manager as any).cache.has('large-20')).toBe(true);
    });

    it('[CHALLENGE-05] Settings store synchronization dynamically resizes imageMemoryCache singleton', () => {
      clearImageCache();
      useSettingsStore.getState().setImageCacheLimitMb(512);
      expect(getImageCacheLimit()).toBe(512);

      // Change store setting to 128MB
      useSettingsStore.getState().setImageCacheLimitMb(128);
      expect(getImageCacheLimit()).toBe(128);
      expect(getImageCacheStats().limitMB).toBe(128);

      // Try setting out-of-bound values via store
      useSettingsStore.getState().setImageCacheLimitMb(10); // Below 32
      expect(getImageCacheLimit()).toBe(32);

      useSettingsStore.getState().setImageCacheLimitMb(8192); // Above 2048
      expect(getImageCacheLimit()).toBe(2048);
    });

    it('[CHALLENGE-06] Increasing limit allows subsequent caching without evictions up to new boundary', () => {
      const manager = new LRUImageMemoryManager(32); // 32MB
      const tenMB = 10 * 1024 * 1024;

      // Add 3 items (30MB)
      for (let i = 1; i <= 3; i++) {
        manager.evictToFit(tenMB);
        (manager as any).cache.set(`item-${i}`, {
          blobUrl: `blob-${i}`,
          sizeBytes: tenMB,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += tenMB;
      }

      expect((manager as any).cache.size).toBe(3);

      // Expand limit to 128MB
      manager.setLimitMB(128);
      expect((manager as any).cache.size).toBe(3); // Existing retained

      // Add 7 more items (70MB) -> Total 100MB <= 128MB -> ZERO evictions
      for (let i = 4; i <= 10; i++) {
        manager.evictToFit(tenMB);
        (manager as any).cache.set(`item-${i}`, {
          blobUrl: `blob-${i}`,
          sizeBytes: tenMB,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += tenMB;
      }

      expect((manager as any).cache.size).toBe(10);
      expect(manager.currentBytes).toBe(100 * 1024 * 1024);
      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Dimension 3: Oversized Image Handling
  // ==========================================================================
  describe('Dimension 3: Oversized Image Handling', () => {
    it('[CHALLENGE-07] Inserting image larger than entire cache limit evicts all items without hanging or negative bytes', () => {
      const manager = new LRUImageMemoryManager(32); // 32MB limit = 33,554,432 bytes
      const fiveMB = 5 * 1024 * 1024;
      const fiftyMB = 50 * 1024 * 1024; // 50MB > 32MB

      // Populate with 4 small items (20MB)
      for (let i = 1; i <= 4; i++) {
        manager.evictToFit(fiveMB);
        (manager as any).cache.set(`small-${i}`, {
          blobUrl: `blob:small-${i}`,
          sizeBytes: fiveMB,
          accessSeq: ++(manager as any).accessCounter,
          lastAccessed: Date.now(),
        });
        manager.currentBytes += fiveMB;
      }

      expect(manager.currentBytes).toBe(20 * 1024 * 1024);
      expect((manager as any).cache.size).toBe(4);

      // Evict for 50MB incoming image
      manager.evictToFit(fiftyMB);

      // All 4 small items should be evicted
      expect((manager as any).cache.size).toBe(0);
      expect(manager.currentBytes).toBe(0);
      expect(revokeSpy).toHaveBeenCalledTimes(4);

      // Add the oversized item
      (manager as any).cache.set('oversized-img', {
        blobUrl: 'blob:oversized-50mb',
        sizeBytes: fiftyMB,
        accessSeq: ++(manager as any).accessCounter,
        lastAccessed: Date.now(),
      });
      manager.currentBytes += fiftyMB;

      expect(manager.currentBytes).toBe(fiftyMB);
      expect((manager as any).cache.size).toBe(1);

      // Subsequent 2MB image addition must immediately evict the 50MB monster!
      const twoMB = 2 * 1024 * 1024;
      manager.evictToFit(twoMB);

      expect((manager as any).cache.size).toBe(0);
      expect(manager.currentBytes).toBe(0);
      expect(revokeSpy).toHaveBeenCalledWith('blob:oversized-50mb');

      // Add the 2MB image
      (manager as any).cache.set('two-mb-img', {
        blobUrl: 'blob:2mb',
        sizeBytes: twoMB,
        accessSeq: ++(manager as any).accessCounter,
        lastAccessed: Date.now(),
      });
      manager.currentBytes += twoMB;

      expect(manager.currentBytes).toBe(twoMB);
      expect((manager as any).cache.size).toBe(1);
    });

    it('[CHALLENGE-08] getCachedImageUrl gracefully handles oversized responses without breaking metrics', async () => {
      clearImageCache();
      setImageCacheLimit(32);

      // In Node/Vitest, Response with ArrayBuffer / Uint8Array yields a real Blob with accurate .size
      const hugeBytes = new Uint8Array(40 * 1024 * 1024);
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
        return new Response(hugeBytes, {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': hugeBytes.length.toString() },
        });
      });

      const targetUrl = 'http://localhost:4040/rest/getCoverArt?id=huge-cover-art';
      const resultBlob = await getCachedImageUrl(targetUrl);

      expect(resultBlob).toContain('blob:');
      const stats = getImageCacheStats();
      expect(stats.itemCount).toBe(1);
      expect(stats.currentBytes).toBe(40 * 1024 * 1024);
    });
  });

  // ==========================================================================
  // Dimension 4: High Concurrency, Deduplication & Network Edge Handling
  // ==========================================================================
  describe('Dimension 4: High Concurrency & Deduplication Stress', () => {
    it('[CHALLENGE-09] 100 concurrent requests for the identical image URL execute exactly 1 network fetch', async () => {
      clearImageCache();
      const targetUrl = 'http://localhost:4040/rest/getCoverArt?id=heavy-concurrency-single';
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const initialFetchCalls = fetchSpy.mock.calls.length;

      const promises = Array.from({ length: 100 }, () => getCachedImageUrl(targetUrl));
      const results = await Promise.all(promises);

      expect(results.length).toBe(100);
      const firstResult = results[0];
      expect(firstResult).toContain('blob:');
      expect(results.every((r) => r === firstResult)).toBe(true);

      const networkCalls = fetchSpy.mock.calls.slice(initialFetchCalls).filter((c) => String(c[0]).includes('heavy-concurrency-single'));
      expect(networkCalls.length).toBe(1);
    });

    it('[CHALLENGE-10] 100 concurrent requests across 20 distinct URLs (5 duplicates each) execute exactly 20 network fetches', async () => {
      clearImageCache();
      const distinctUrls = Array.from({ length: 20 }, (_, i) => `http://localhost:4040/rest/getCoverArt?id=concurrent-dist-target-${i}`);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const initialFetchCalls = fetchSpy.mock.calls.length;

      // Create 100 requests: 5 for each of the 20 distinct URLs interleaved
      const allRequests: Promise<string>[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        for (const url of distinctUrls) {
          allRequests.push(getCachedImageUrl(url));
        }
      }

      const results = await Promise.all(allRequests);
      expect(results.length).toBe(100);

      // Verify exactly 20 unique blob URLs returned
      const uniqueBlobs = new Set(results);
      expect(uniqueBlobs.size).toBe(20);

      // Verify exactly 20 network fetches occurred (1 per unique URL)
      for (let i = 0; i < 20; i++) {
        const targetUrl = distinctUrls[i];
        const calls = fetchSpy.mock.calls.slice(initialFetchCalls).filter((c) => String(c[0]) === targetUrl);
        expect(calls.length).toBe(1);
      }
    });

    it('[CHALLENGE-11] 50 concurrent requests during network failure resolve gracefully to originalUrl and allow retry', async () => {
      clearImageCache();
      vi.useFakeTimers();

      const errorUrl = 'http://localhost:4040/rest/getCoverArt?id=failing-art-stream-challenge';
      let shouldFail = true;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        if (urlStr.includes('failing-art-stream-challenge')) {
          if (shouldFail) {
            return new Response('500 Server Crash', { status: 500 });
          }
          return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
        }
        return new Response(new Uint8Array([10, 20]), { status: 200 });
      });

      // 50 concurrent requests to the failing endpoint
      const promises = Array.from({ length: 50 }, () => getCachedImageUrl(errorUrl));
      await vi.runAllTimersAsync();
      const results = await Promise.all(promises);

      expect(results.length).toBe(50);
      expect(results.every((r) => r === errorUrl)).toBe(true);

      // fetchingCache must be cleaned up so subsequent calls can retry!
      shouldFail = false;
      const retryPromise = getCachedImageUrl(errorUrl);
      await vi.runAllTimersAsync();
      const retryResult = await retryPromise;
      expect(retryResult).toContain('blob:');

      vi.useRealTimers();
    });

    it('[CHALLENGE-12] Interleaved concurrent cache hits and misses do not block or cause deadlock', async () => {
      clearImageCache();

      // Seed 5 cached items
      const preCachedUrls = Array.from({ length: 5 }, (_, i) => `http://localhost:4040/rest/getCoverArt?id=pre-seeded-${i}`);
      for (const url of preCachedUrls) {
        await getCachedImageUrl(url);
      }

      const freshUrls = Array.from({ length: 15 }, (_, i) => `http://localhost:4040/rest/getCoverArt?id=fresh-incoming-${i}`);

      // Fire 50 requests mixing pre-cached hits and fresh misses
      const mixedRequests: Promise<string>[] = [];
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          const hitUrl = preCachedUrls[i % preCachedUrls.length];
          mixedRequests.push(getCachedImageUrl(hitUrl));
        } else {
          const missUrl = freshUrls[i % freshUrls.length];
          mixedRequests.push(getCachedImageUrl(missUrl));
        }
      }

      const results = await Promise.all(mixedRequests);
      expect(results.length).toBe(50);
      expect(results.every((r) => r.startsWith('blob:'))).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 5: Concurrent Danger Zone Actions & Image Cache Isolation
  // ==========================================================================
  describe('Dimension 5: Danger Zone Purge & Storage Isolation', () => {
    it('[CHALLENGE-13] "Delete All Downloaded Music" purges audio files and downloadStore while image cache remains completely unaffected', async () => {
      setPlatform('tauri');
      clearImageCache();

      // 1. Setup active image cache with 5 items
      for (let i = 1; i <= 5; i++) {
        await getCachedImageUrl(`http://localhost:4040/rest/getCoverArt?id=safe-cover-${i}`);
      }
      expect(getImageCacheStats().itemCount).toBe(5);

      // 2. Setup download store with tracks and albums on disk
      const base = 'C:/Users/MockUser/Downloads/Holad';
      await vfs.writeFile(`${base}/tracks/song1.mp3`, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${base}/tracks/song2.mp3`, new Uint8Array([4, 5, 6]));
      await vfs.writeFile(`${base}/albums/Alb1/s1.mp3`, new Uint8Array([7, 8, 9]));

      const store = useDownloadStore.getState();
      store.startDownload('t-1', 'Track 1', 'track');
      store.completeDownload('t-1', `${base}/tracks/song1.mp3`);
      store.startDownload('t-2', 'Track 2', 'track');
      store.completeDownload('t-2', `${base}/tracks/song2.mp3`);
      store.startDownload('a-1', 'Album 1', 'album');
      store.completeDownload('a-1', `${base}/albums/Alb1`);

      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(3);

      // 3. Trigger "Delete All Downloaded Music" via StorageDangerZone UI
      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const deleteMusicBtn = buttons[2]; // 3rd button is Delete All Music

      // Confirmation click 1
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      // Execution click 2
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      // 4. Verify music is completely deleted
      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
      expect(await vfs.exists(`${base}/tracks/song1.mp3`)).toBe(false);
      expect(await vfs.exists(`${base}/tracks/song2.mp3`)).toBe(false);
      expect(await vfs.exists(`${base}/albums/Alb1`)).toBe(false);

      // 5. Verify image cache is STILL 100% INTACT!
      expect(getImageCacheStats().itemCount).toBe(5);
      expect(getImageCacheStats().currentBytes).toBeGreaterThan(0);
    });

    it('[CHALLENGE-14] "Clear Image Cache" in Danger Zone purges LRU memory, disk covers folder, and revokes all blobs', async () => {
      setPlatform('tauri');
      clearImageCache();
      revokeSpy.mockClear();

      // Seed image cache and disk covers
      const base = 'C:/Users/MockUser/Downloads/Holad';
      await vfs.writeFile(`${base}/covers/cover1.jpg`, new Uint8Array([10, 20, 30]));
      await vfs.writeFile(`${base}/tracks/important_song.mp3`, new Uint8Array([99, 88, 77]));

      for (let i = 1; i <= 4; i++) {
        await getCachedImageUrl(`http://localhost:4040/rest/getCoverArt?id=purge-test-${i}`);
      }

      expect(getImageCacheStats().itemCount).toBe(4);
      expect(await vfs.exists(`${base}/covers/cover1.jpg`)).toBe(true);

      // Render StorageDangerZone and trigger "Clear Image Cache"
      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const clearImagesBtn = buttons[0]; // 1st button is Clear Image Cache

      revokeSpy.mockClear();

      // Confirmation click 1
      await act(async () => {
        fireEvent.click(clearImagesBtn);
      });

      // Execution click 2
      await act(async () => {
        fireEvent.click(clearImagesBtn);
      });

      // Image cache memory must be 0
      expect(getImageCacheStats().itemCount).toBe(0);
      expect(getImageCacheStats().currentBytes).toBe(0);

      // Blobs must be revoked
      expect(revokeSpy).toHaveBeenCalledTimes(4);

      // Disk covers must be deleted
      expect(await vfs.exists(`${base}/covers`)).toBe(false);

      // Audio file must NOT be deleted!
      expect(await vfs.exists(`${base}/tracks/important_song.mp3`)).toBe(true);
    });
  });

  // ==========================================================================
  // Dimension 6: Edge Protocols, Bypass Rules & Parameter Hardening
  // ==========================================================================
  describe('Dimension 6: Bypass Protocols & Parameter Robustness', () => {
    it('[CHALLENGE-15] Non-HTTP URLs bypass image cache immediately without network requests or cache insertion', async () => {
      clearImageCache();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const initialFetchCalls = fetchSpy.mock.calls.length;

      const nonHttpUrls = [
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'blob:http://localhost/existing-blob-url',
        'http://asset.localhost/C%3A%2FHolad%2Fcovers%2Flocal.jpg',
        'asset://covers/album.png',
        '_capacitor_file_://DATA/Holad/covers/art.jpg',
        'capacitor://localhost/covers/art.jpg',
        'file:///storage/emulated/0/Holad/covers/art.jpg',
      ];

      for (const url of nonHttpUrls) {
        const result = await getCachedImageUrl(url);
        expect(result).toBe(url); // Exact same string returned
      }

      // No network fetches and no cache items
      expect(fetchSpy.mock.calls.length).toBe(initialFetchCalls);
      expect(getImageCacheStats().itemCount).toBe(0);
      expect(getImageCacheStats().currentBytes).toBe(0);
    });

    it('[CHALLENGE-16] Null, undefined, or empty string URLs return immediately without crashing', async () => {
      expect(await getCachedImageUrl('')).toBe('');
      expect(await getCachedImageUrl(null as any)).toBe(null);
      expect(await getCachedImageUrl(undefined as any)).toBe(undefined);
    });

    it('[CHALLENGE-17] Extreme clamp inputs (NaN, Infinity, negative, object) default safely to valid bounds', () => {
      const manager = new LRUImageMemoryManager(NaN as any);
      expect(manager.limitMB).toBe(256);

      manager.setLimitMB(Infinity as any);
      expect(manager.limitMB).toBe(2048);

      manager.setLimitMB(-Infinity as any);
      expect(manager.limitMB).toBe(32);

      manager.setLimitMB('invalid' as any);
      expect(manager.limitMB).toBe(256);

      manager.setLimitMB({} as any);
      expect(manager.limitMB).toBe(256);
    });
  });
});
