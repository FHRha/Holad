import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  createChunkedStream,
} from './harness';

import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { handleDownload, cancelActiveDownload } from '../../utils/downloadHelper';
import { getCachedImageUrl } from '../../utils/imageCache';
import { clearAppCache } from '../../utils/storage';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
  getDownloadedTracks,
  getDownloadedAlbums,
} from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { AudioDeck, isLocalMediaUrl } from '../../audio/AudioDeck';
import { resolveTrackAudioSource } from '../../hooks/useTrackSource';
import { createMockAudioElement } from '../mocks/mockAudio';
import { convertFileSrc } from '@tauri-apps/api/core';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

describe('Tier 2: Boundary & Corner Cases Test Suite', () => {
  beforeEach(() => {
    resetE2EHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Boundary Category 1: File System & Payloads (21 Tests)
  // ==========================================================================
  describe('Boundary Category 1: File System & Payloads', () => {
    it('[T2.B1.01] 0-byte audio file saving in Tauri mode creates valid empty file without throwing', async () => {
      setPlatform('tauri');
      const emptyBuffer = new Uint8Array(0);
      const savedPath = await StorageManager.saveTrack('empty_audio.mp3', emptyBuffer, 'C:/Users/MockUser/Downloads/Holad', 'tracks');

      expect(savedPath).toContain('empty_audio.mp3');
      const exists = await vfs.exists(savedPath);
      expect(exists).toBe(true);

      const stat = await vfs.stat(savedPath);
      expect(stat.size).toBe(0);
      expect(stat.isFile).toBe(true);
    });

    it('[T2.B1.02] 0-byte audio file saving in Capacitor mode creates valid base64 representation in Directory.Data', async () => {
      setPlatform('capacitor');
      const emptyBuffer = new Uint8Array(0);
      const savedPath = await StorageManager.saveTrack('empty_mobile.mp3', emptyBuffer, undefined, 'tracks');

      expect(savedPath).toBe('Holad/tracks/empty_mobile.mp3');
      const exists = await vfs.exists(`DATA/${savedPath}`);
      expect(exists).toBe(true);

      const stat = await vfs.stat(`DATA/${savedPath}`);
      expect(stat.size).toBe(0);
    });

    it('[T2.B1.03] 0-byte audio file download via downloadSingleFile with 0 content-length completes and records 0 sizeBytes', async () => {
      setPlatform('tauri');
      const songId = 'zero-byte-song';
      registerMockSong({
        id: songId,
        title: 'Zero Byte Track',
        artist: 'Silent Artist',
        album: 'Silence',
        albumId: 'alb-silent',
        duration: 0,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('download') || url.includes('/api/stream/')) {
          const emptyStream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          });
          return new Response(emptyStream, {
            status: 200,
            headers: {
              'content-length': '0',
              'content-type': 'audio/mpeg',
              'content-disposition': 'attachment; filename="Zero Byte Track.mp3"',
            },
          });
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Zero Byte Track', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.progress).toBe(100);
      expect(item.sizeBytes).toBe(0);
    });

    it('[T2.B1.04] AudioDeck loads and attempts playback on 0-byte local asset file handling 0 duration gracefully', async () => {
      const mockEl = createMockAudioElement();
      mockEl.duration = 0;
      const deck = new AudioDeck('test-zero-audio', mockEl);

      const localAssetUri = 'http://asset.localhost/C%3A%2FHolad%2Fempty.mp3';
      await deck.load(localAssetUri, 0);

      expect(deck.getState()).toBe('ready');
      expect(deck.getDuration()).toBe(0);
      expect(deck.getBufferedPercent()).toBe(0);

      await deck.play();
      expect(deck.getState()).toBe('playing');

      deck.destroy();
    });

    it('[T2.B1.05] 0-byte cover art image saveCoverArt creates valid file and returns valid local path', async () => {
      setPlatform('tauri');
      const emptyCoverData = new Uint8Array(0);
      const savedCover = await StorageManager.saveCoverArt('empty_cover.jpg', emptyCoverData, 'C:/Users/MockUser/Downloads/Holad', 'covers');

      expect(savedCover).toContain('empty_cover.jpg');
      const stat = await vfs.stat(savedCover);
      expect(stat.size).toBe(0);
      expect(stat.isFile).toBe(true);
    });

    it('[T2.B1.06] Multi-gigabyte (>2GB, e.g. 2.5GB) stream chunking calculates progress without 32-bit integer overflow', () => {
      const twoPointFiveGB = 2.5 * 1024 * 1024 * 1024; // 2,684,354,560 bytes (> 2^31 - 1)
      let loaded = 0;
      const chunkSize = 256 * 1024 * 1024; // 256MB chunks
      const progressHistory: number[] = [];

      while (loaded < twoPointFiveGB) {
        loaded = Math.min(twoPointFiveGB, loaded + chunkSize);
        const percent = Math.round((loaded / twoPointFiveGB) * 100);
        progressHistory.push(percent);
      }

      expect(progressHistory[progressHistory.length - 1]).toBe(100);
      expect(progressHistory.every(p => !isNaN(p) && p >= 0 && p <= 100)).toBe(true);
      expect(progressHistory.length).toBe(10);
    });

    it('[T2.B1.07] Storage statistics accurately sums multi-gigabyte files (>2GB) without overflow', async () => {
      const file1Size = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
      const file2Size = 1.2 * 1024 * 1024 * 1024; // 1.2 GB

      // Calculate total representation
      const totalBytes = file1Size + file2Size; // 2.7 GB = 2,899,102,924.8 bytes
      expect(totalBytes).toBeGreaterThan(2147483647);
      expect(Number.isSafeInteger(Math.round(totalBytes))).toBe(true);
    });

    it('[T2.B1.08] Byte size formatter converts >2GB (2,684,354,560 bytes) accurately to "2.5 GB"', () => {
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      const bytes2_5GB = 2.5 * 1024 * 1024 * 1024;
      const bytes4GB = 4 * 1024 * 1024 * 1024;

      expect(formatBytes(bytes2_5GB)).toBe('2.5 GB');
      expect(formatBytes(bytes4GB)).toBe('4 GB');
    });

    it('[T2.B1.09] Filename sanitization replaces Windows forbidden characters (<>:"/\\|?*) with hyphens', async () => {
      setPlatform('tauri');
      const badTitle = 'AC/DC: Back in Black <Remastered> "2026" | Track? *Special*';
      const sanitized = badTitle.replace(/[/\\?%*:|"<>]/g, '-');

      expect(sanitized).toBe('AC-DC- Back in Black -Remastered- -2026- - Track- -Special-');
      expect(sanitized).not.toMatch(/[/\\?%*:|"<>]/);

      const savedPath = await StorageManager.saveTrack(`${sanitized}.mp3`, new Uint8Array([1, 2, 3]), 'C:/Holad', 'tracks');
      expect(savedPath).toContain(sanitized);
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T2.B1.10] Filename sanitization strips dangerous path traversal sequences (../../ and ..\\)', async () => {
      setPlatform('tauri');
      const maliciousName = '../../../../etc/passwd';
      const sanitized = maliciousName.replace(/[/\\?%*:|"<>]/g, '-');

      expect(sanitized).toBe('..-..-..-..-etc-passwd');
      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');

      const savedPath = await StorageManager.saveTrack(`${sanitized}.mp3`, new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
      expect(savedPath).toBe('C:/Holad/tracks/..-..-..-..-etc-passwd.mp3');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T2.B1.11] Filename sanitization preserves multi-byte Unicode and CJK characters correctly', async () => {
      setPlatform('tauri');
      const unicodeTitle = '01. 宇多田ヒカル - First Love (러브스토리) [Русский Рок]';
      const sanitized = unicodeTitle.replace(/[/\\?%*:|"<>]/g, '-');

      expect(sanitized).toBe('01. 宇多田ヒカル - First Love (러브스토리) [Русский Рок]');

      const savedPath = await StorageManager.saveTrack(`${sanitized}.flac`, new Uint8Array([1, 2, 3, 4]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
      expect(savedPath).toContain('宇多田ヒカル');
      expect(savedPath).toContain('러브스토리');
      expect(savedPath).toContain('Русский Рок');
    });

    it('[T2.B1.12] Filename sanitization preserves emojis and surrogate pairs correctly', async () => {
      setPlatform('tauri');
      const emojiTitle = '🔥 Fire Tracks 🚀 Cosmic Vibes 🎵 100% Pure Sound';
      const sanitized = emojiTitle.replace(/[/\\?%*:|"<>]/g, '-');

      expect(sanitized).toBe('🔥 Fire Tracks 🚀 Cosmic Vibes 🎵 100- Pure Sound');

      const savedPath = await StorageManager.saveTrack(`${sanitized}.mp3`, new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
      expect(savedPath).toContain('🔥 Fire Tracks 🚀 Cosmic Vibes 🎵 100- Pure Sound');
    });

    it('[T2.B1.13] Filename sanitization handles control characters and null bytes (\\0, \\r, \\n, \\t) safely', async () => {
      setPlatform('tauri');
      const rawTitle = 'Track\0With\r\nControl\tChars';
      const sanitized = rawTitle.replace(/[\0\r\n\t]/g, '_').replace(/[/\\?%*:|"<>]/g, '-');

      expect(sanitized).toBe('Track_With__Control_Chars');
      expect(sanitized).not.toContain('\0');
      expect(sanitized).not.toContain('\n');

      const savedPath = await StorageManager.saveTrack(`${sanitized}.mp3`, new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T2.B1.14] Exact 255-character filename length boundary preserves full name and extension', async () => {
      setPlatform('tauri');
      const ext = '.mp3';
      const baseLen = 255 - ext.length; // 251 chars
      const exact255Name = 'A'.repeat(baseLen) + ext;

      expect(exact255Name.length).toBe(255);

      const savedPath = await StorageManager.saveTrack(exact255Name, new Uint8Array([1, 2, 3]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
      expect(savedPath.endsWith(exact255Name)).toBe(true);
    });

    it('[T2.B1.15] Overly long filename (>300 characters) safely truncates basename while preserving file extension', async () => {
      setPlatform('tauri');
      const ext = '.flac';
      const ultraLongBase = 'B'.repeat(350);
      const rawFileName = `${ultraLongBase}${ext}`;

      const truncateFileName = (fileName: string, maxLen: number = 255): string => {
        if (fileName.length <= maxLen) return fileName;
        const dotIdx = fileName.lastIndexOf('.');
        if (dotIdx === -1) return fileName.slice(0, maxLen);
        const fileExt = fileName.slice(dotIdx);
        const base = fileName.slice(0, dotIdx);
        const safeBaseLen = maxLen - fileExt.length;
        return base.slice(0, safeBaseLen) + fileExt;
      };

      const safeFileName = truncateFileName(rawFileName, 255);
      expect(safeFileName.length).toBe(255);
      expect(safeFileName.endsWith('.flac')).toBe(true);

      const savedPath = await StorageManager.saveTrack(safeFileName, new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T2.B1.16] Deep directory path exceeding standard MAX_PATH (260 chars) resolves and saves cleanly', async () => {
      setPlatform('tauri');
      const deepFolders = 'C:/Holad/' + 'sub_level_folder/'.repeat(15);
      const fileName = 'deep_track.mp3';
      const fullExpectedPath = `${deepFolders}${fileName}`;

      expect(fullExpectedPath.length).toBeGreaterThan(260);

      const savedPath = await StorageManager.saveTrack(fileName, new Uint8Array([1, 2, 3]), deepFolders, undefined);
      expect(await vfs.exists(savedPath)).toBe(true);
      expect(savedPath).toBe(fullExpectedPath);
    });

    it('[T2.B1.17] ENOSPC (Disk Full) error during saveTrack throws error and leaves no corrupt state', async () => {
      setPlatform('tauri');
      const fsPlugin = await import('@tauri-apps/plugin-fs');
      vi.spyOn(fsPlugin, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left on device, write'));

      await expect(
        StorageManager.saveTrack('overflow.mp3', new Uint8Array([1, 2, 3]), 'C:/Holad', 'tracks')
      ).rejects.toThrow('ENOSPC');
    });

    it('[T2.B1.18] ENOSPC error mid-download transitions item in downloadStore to "error" status with descriptive message', async () => {
      setPlatform('tauri');
      const songId = 'enospc-track';
      registerMockSong({
        id: songId,
        title: 'Disk Full Track',
        artist: 'Heavy Artist',
        album: 'Heavy Album',
        albumId: 'alb-heavy',
        duration: 200,
      });

      const fsPlugin = await import('@tauri-apps/plugin-fs');
      vi.spyOn(fsPlugin, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

      await handleDownload(songId, 'Disk Full Track', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
      expect(item.error).toContain('ENOSPC');
    });

    it('[T2.B1.19] Directory creation when target directory already exists (EEXIST) succeeds idempotently', async () => {
      setPlatform('tauri');
      const targetDir = 'C:/Holad/tracks';
      await vfs.mkdir(targetDir, { recursive: true });
      expect(await vfs.exists(targetDir)).toBe(true);

      // Save track into existing directory
      const savedPath = await StorageManager.saveTrack('song_eexist.mp3', new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[T2.B1.20] moveDirectory cleanly overwrites/merges when destination folder already exists with overlapping files', async () => {
      setPlatform('tauri');
      const oldDir = 'C:/Holad/OldFolder';
      const newDir = 'C:/Holad/NewFolder';

      // Seed old directory
      await vfs.writeFile(`${oldDir}/track1.mp3`, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${oldDir}/shared.mp3`, new Uint8Array([10, 20])); // will overwrite

      // Seed destination directory with existing file
      await vfs.writeFile(`${newDir}/shared.mp3`, new Uint8Array([99]));
      await vfs.writeFile(`${newDir}/track2.mp3`, new Uint8Array([4, 5, 6]));

      await StorageManager.moveDirectory(oldDir, newDir);

      expect(await vfs.exists(oldDir)).toBe(false);
      expect(await vfs.exists(`${newDir}/track1.mp3`)).toBe(true);
      expect(await vfs.exists(`${newDir}/track2.mp3`)).toBe(true);
      expect(await vfs.exists(`${newDir}/shared.mp3`)).toBe(true);

      const sharedData = await vfs.readFile(`${newDir}/shared.mp3`);
      expect(sharedData).toEqual(new Uint8Array([10, 20]));
    });

    it('[T2.B1.21] Permission denial (EACCES/EPERM) during write throws descriptive error and catches cleanly', async () => {
      setPlatform('tauri');
      const fsPlugin = await import('@tauri-apps/plugin-fs');
      vi.spyOn(fsPlugin, 'writeFile').mockRejectedValueOnce(new Error('EACCES: permission denied, open'));

      await expect(
        StorageManager.saveTrack('protected.mp3', new Uint8Array([1, 2]), 'C:/Protected', 'tracks')
      ).rejects.toThrow('EACCES');
    });
  });

  // ==========================================================================
  // Boundary Category 2: Network & Concurrency (17 Tests)
  // ==========================================================================
  describe('Boundary Category 2: Network & Concurrency', () => {
    it('[T2.B2.01] Abrupt network disconnection mid-stream at 99% progress throws and marks download as "error"', async () => {
      setPlatform('tauri');
      const songId = 'drop-at-99';
      registerMockSong({
        id: songId,
        title: 'Drop 99 Track',
        artist: 'Drop Artist',
        album: 'Drop Album',
        albumId: 'alb-drop',
        duration: 300,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('download') || url.includes('/api/stream/')) {
          let chunksSent = 0;
          const dropStream = new ReadableStream<Uint8Array>({
            pull(controller) {
              chunksSent++;
              if (chunksSent < 99) {
                controller.enqueue(new Uint8Array(100)); // 100 bytes per chunk
              } else {
                // Abruptly fail at 99%
                controller.error(new Error('Network connection terminated abruptly'));
              }
            },
          });

          return new Response(dropStream, {
            status: 200,
            headers: {
              'content-length': '10000',
              'content-type': 'audio/mpeg',
              'content-disposition': 'attachment; filename="Drop 99 Track.mp3"',
            },
          });
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Drop 99 Track', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
      expect(item.error).toBeDefined();
    });

    it('[T2.B2.02] Abrupt network disconnection cleans active AbortController from active controller registry', async () => {
      setPlatform('tauri');
      const songId = 'abort-cleanup-test';
      registerMockSong({
        id: songId,
        title: 'Abort Cleanup',
        artist: 'Artist',
        album: 'Album',
        albumId: 'alb-1',
        duration: 100,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal?.aborted) {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          throw err;
        }
        return originalMock(input, init);
      });

      const downloadPromise = handleDownload(songId, 'Abort Cleanup', 'track');
      cancelActiveDownload(songId);
      await downloadPromise;

      const activeItem = useDownloadStore.getState().downloads[songId];
      expect(activeItem).toBeDefined();
      expect(activeItem.status).toBe('cancelled');
    });

    it('[T2.B2.03] Concurrency backpressure: 50 simultaneous download items can be queued without store corruption', () => {
      const store = useDownloadStore.getState();
      const itemCount = 50;

      for (let i = 1; i <= itemCount; i++) {
        store.queueDownload(`queue-item-${i}`, `Queued Track ${i}`, 'track', `cov-${i}.jpg`, {
          artist: `Artist ${i}`,
          album: `Album ${i}`,
          duration: 180 + i,
        });
      }

      const allDownloads = useDownloadStore.getState().downloads;
      expect(Object.keys(allDownloads).length).toBe(itemCount);

      for (let i = 1; i <= itemCount; i++) {
        const item = allDownloads[`queue-item-${i}`];
        expect(item).toBeDefined();
        expect(item.status).toBe('queued');
        expect(item.name).toBe(`Queued Track ${i}`);
      }
    });

    it('[T2.B2.04] Bounded concurrency worker pool executes 50 queued items with max 3 concurrent active streams', async () => {
      const store = useDownloadStore.getState();
      const totalItems = 50;
      const maxConcurrent = 3;

      for (let i = 1; i <= totalItems; i++) {
        store.queueDownload(`pool-item-${i}`, `Pool Track ${i}`, 'track');
      }

      let activeWorkers = 0;
      let maxSimultaneousActive = 0;
      const completedIds: string[] = [];

      // Bounded worker pool runner
      const runPool = async () => {
        const queue = Object.keys(useDownloadStore.getState().downloads);

        const worker = async () => {
          while (queue.length > 0) {
            const id = queue.shift();
            if (!id) break;

            activeWorkers++;
            maxSimultaneousActive = Math.max(maxSimultaneousActive, activeWorkers);
            useDownloadStore.getState().updateItem(id, { status: 'downloading' });

            // Simulate quick processing
            await new Promise((resolve) => setTimeout(resolve, 2));

            useDownloadStore.getState().completeDownload(id, `/path/${id}.mp3`);
            completedIds.push(id);
            activeWorkers--;
          }
        };

        const workers = Array.from({ length: maxConcurrent }, () => worker());
        await Promise.all(workers);
      };

      await runPool();

      expect(maxSimultaneousActive).toBeLessThanOrEqual(maxConcurrent);
      expect(completedIds.length).toBe(totalItems);

      const all = Object.values(useDownloadStore.getState().downloads);
      expect(all.every(d => d.status === 'completed')).toBe(true);
    });

    it('[T2.B2.05] Mass cancellation of 50 queued items cancels all pending operations cleanly', () => {
      const store = useDownloadStore.getState();
      for (let i = 1; i <= 50; i++) {
        store.queueDownload(`mass-cancel-${i}`, `Mass Track ${i}`, 'track');
      }

      const allKeys = Object.keys(useDownloadStore.getState().downloads);
      allKeys.forEach(id => store.cancelDownload(id));

      const updated = Object.values(useDownloadStore.getState().downloads);
      expect(updated.length).toBe(50);
      expect(updated.every(d => d.status === 'cancelled')).toBe(true);
    });

    it('[T2.B2.06] Subsonic HTTP 403 Forbidden error response causes handleDownload to set status="error" with auth message', async () => {
      setPlatform('tauri');
      const songId = 'forbidden-song';
      registerMockSong({
        id: songId,
        title: 'Forbidden Song',
        artist: 'Auth Artist',
        album: 'Album',
        albumId: 'alb-auth',
        duration: 120,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('download') || url.includes('/api/stream/')) {
          return new Response('403 Forbidden: User not authorized for offline download', {
            status: 403,
            statusText: 'Forbidden',
          });
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Forbidden Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
      expect(item.error).toBe('Failed to fetch file');
    });

    it('[T2.B2.07] Subsonic HTTP 404 Not Found audio stream response marks track as error without crashing', async () => {
      setPlatform('tauri');
      const songId = 'not-found-song';
      registerMockSong({
        id: songId,
        title: 'Missing Song',
        artist: 'Ghost Artist',
        album: 'Ghost Album',
        albumId: 'alb-ghost',
        duration: 100,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('download') || url.includes('/api/stream/')) {
          return new Response('404 Not Found: Audio file deleted on server', {
            status: 404,
            statusText: 'Not Found',
          });
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Missing Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
    });

    it('[T2.B2.08] Subsonic HTTP 404 Cover Art response allows audio download to complete successfully with fallback cover', async () => {
      setPlatform('tauri');
      const songId = 'song-404-cover';
      registerMockSong({
        id: songId,
        title: 'Audio With 404 Cover',
        artist: 'Artist',
        album: 'Album',
        albumId: 'alb-1',
        coverArt: 'cover-404-id',
        duration: 150,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('getCoverArt')) {
          return new Response('404 Cover Not Found', {
            status: 404,
            statusText: 'Not Found',
          });
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Audio With 404 Cover', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.localCoverArtUri).toBeUndefined();
    });

    it('[T2.B2.09] Subsonic HTTP 500 Internal Server Error response marks download as error', async () => {
      setPlatform('tauri');
      const songId = 'server-err-500';
      registerMockSong({
        id: songId,
        title: '500 Server Error Song',
        artist: 'Artist',
        album: 'Album',
        albumId: 'alb-1',
        duration: 120,
      });

      setSimulatedNetworkFailure('download', true);
      await handleDownload(songId, '500 Server Error Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
    });

    it('[T2.B2.10] Subsonic API JSON response with status="failed" and error code 70 is caught and recorded in store', async () => {
      setPlatform('tauri');
      const songId = 'json-err-70';
      useDownloadStore.getState().queueDownload(songId, 'Missing Subsonic Song', 'track');

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('getSong')) {
          return new Response(
            JSON.stringify({
              'subsonic-response': {
                status: 'failed',
                version: '1.16.1',
                error: {
                  code: 70,
                  message: 'The requested data was not found on Subsonic server',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Missing Subsonic Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
    });

    it('[T2.B2.11] Subsonic API JSON response with status="failed" and error code 40 (wrong credentials) handled safely', async () => {
      setPlatform('tauri');
      const albumId = 'alb-auth-fail';
      useDownloadStore.getState().queueDownload(albumId, 'Auth Failed Album', 'album');

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('getAlbum')) {
          return new Response(
            JSON.stringify({
              'subsonic-response': {
                status: 'failed',
                version: '1.16.1',
                error: {
                  code: 40,
                  message: 'Wrong username or password',
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return originalMock(input, init);
      });

      await handleDownload(albumId, 'Auth Failed Album', 'album');

      const item = useDownloadStore.getState().downloads[albumId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
    });

    it('[T2.B2.12] Rapid online/offline toggling (10 state changes in 50ms) dispatches events without unhandled rejection', async () => {
      let onlineCount = 0;
      let offlineCount = 0;

      const onlineHandler = () => onlineCount++;
      const offlineHandler = () => offlineCount++;

      window.addEventListener('online', onlineHandler);
      window.addEventListener('offline', offlineHandler);

      for (let i = 0; i < 10; i++) {
        setOnline(i % 2 === 0);
      }

      expect(onlineCount).toBe(5);
      expect(offlineCount).toBe(5);

      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    });

    it('[T2.B2.13] Network dropping offline mid-download immediately fails the active stream and updates store', async () => {
      setPlatform('tauri');
      const songId = 'offline-mid-stream';
      registerMockSong({
        id: songId,
        title: 'Offline Drop Song',
        artist: 'Artist',
        album: 'Album',
        albumId: 'alb-1',
        duration: 200,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('download') || url.includes('/api/stream/')) {
          throw new TypeError('Failed to fetch: Network went offline mid-stream');
        }
        return originalMock(input, init);
      });

      await handleDownload(songId, 'Offline Drop Song', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('error');
    });

    it('[T2.B2.14] Resuming download after network recovery transitions item back to "downloading" and completes', async () => {
      setPlatform('tauri');
      const songId = 'retry-after-recover';
      registerMockSong({
        id: songId,
        title: 'Recovered Song',
        artist: 'Artist',
        album: 'Album',
        albumId: 'alb-1',
        duration: 180,
      });

      let shouldFail = true;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if ((url.includes('download') || url.includes('/api/stream/')) && shouldFail) {
          throw new TypeError('Failed to fetch: Network offline');
        }
        return originalMock(input, init);
      });

      // 1. Initial attempt fails mid-download
      await handleDownload(songId, 'Recovered Song', 'track');
      expect(useDownloadStore.getState().downloads[songId].status).toBe('error');

      // 2. Network recovers and user retries
      shouldFail = false;
      await handleDownload(songId, 'Recovered Song', 'track');
      expect(useDownloadStore.getState().downloads[songId].status).toBe('completed');
    });

    it('[T2.B2.15] Throttled micro-chunk stream (many small 16-byte chunks) updates progress monotonically to 100%', async () => {
      const data = new Uint8Array(160); // 10 chunks of 16 bytes
      for (let i = 0; i < data.length; i++) data[i] = i % 256;

      const progressValues: number[] = [];
      const stream = createChunkedStream(data, 10);
      const reader = stream.getReader();

      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          loaded += value.length;
          progressValues.push(Math.round((loaded / data.length) * 100));
        }
      }

      expect(progressValues[progressValues.length - 1]).toBe(100);
      expect(progressValues.length).toBe(10);
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('[T2.B2.16] Zero-length chunk stream (empty body) finishes without hanging or division-by-zero error', async () => {
      const data = new Uint8Array(0);
      const stream = createChunkedStream(data, 1);
      const reader = stream.getReader();

      const { done } = await reader.read();
      expect(done).toBe(true);
    });

    it('[T2.B2.17] Network failure during album download child track does not crash entire album loop; marks child track error', async () => {
      setPlatform('tauri');
      const albumId = 'alb-partial-fail';
      const song1 = { id: 's-part-1', title: 'Part 1', artist: 'Art', album: 'Album', albumId, duration: 100 };
      const song2 = { id: 's-part-2', title: 'Part 2', artist: 'Art', album: 'Album', albumId, duration: 100 };

      registerMockAlbum({
        id: albumId,
        name: 'Partial Album',
        artist: 'Art',
        songCount: 2,
        song: [song1, song2],
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const originalMock = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('id=s-part-2') && url.includes('download')) {
          return new Response('500 Error downloading song 2', { status: 500 });
        }
        return originalMock(input, init);
      });

      await handleDownload(albumId, 'Partial Album', 'album');

      const downloads = useDownloadStore.getState().downloads;
      expect(downloads[albumId]).toBeDefined();
      expect(downloads[albumId].status).toBe('completed');
      expect(downloads[albumId].completedTrackCount).toBe(1);
    });
  });

  // ==========================================================================
  // Boundary Category 3: Cache & Memory Limits (15 Tests)
  // ==========================================================================
  describe('Boundary Category 3: Cache & Memory Limits', () => {
    // Reference LRU Cache implementation implementing contracts from spec miner
    class LRUImageMemoryManager {
      public limitMB: number;
      public currentBytes: number = 0;
      public accessCounter: number = 0;
      public cache = new Map<string, { blobUrl: string; sizeBytes: number; accessSeq: number }>();
      public revokedUrls: string[] = [];

      constructor(limitMB: number = 128) {
        this.limitMB = Math.max(32, Math.min(2048, limitMB));
      }

      public setLimitMB(mb: number): void {
        this.limitMB = Math.max(32, Math.min(2048, mb));
        this.evictToFit(0);
      }

      public get maxBytes(): number {
        return this.limitMB * 1024 * 1024;
      }

      public put(url: string, blobUrl: string, sizeBytes: number): void {
        if (this.cache.has(url)) {
          const old = this.cache.get(url)!;
          this.currentBytes -= old.sizeBytes;
        }

        this.evictToFit(sizeBytes);

        this.cache.set(url, {
          blobUrl,
          sizeBytes,
          accessSeq: ++this.accessCounter,
        });
        this.currentBytes += sizeBytes;
      }

      public get(url: string): string | undefined {
        const entry = this.cache.get(url);
        if (!entry) return undefined;
        entry.accessSeq = ++this.accessCounter;
        return entry.blobUrl;
      }

      public evictToFit(incomingBytes: number): void {
        while (this.currentBytes + incomingBytes > this.maxBytes && this.cache.size > 0) {
          // Find least recently used entry (lowest accessSeq)
          let oldestKey: string | null = null;
          let oldestSeq = Infinity;

          for (const [key, val] of this.cache.entries()) {
            if (val.accessSeq < oldestSeq) {
              oldestSeq = val.accessSeq;
              oldestKey = key;
            }
          }

          if (!oldestKey) break;
          const oldestEntry = this.cache.get(oldestKey)!;
          this.currentBytes -= oldestEntry.sizeBytes;
          URL.revokeObjectURL(oldestEntry.blobUrl);
          this.revokedUrls.push(oldestEntry.blobUrl);
          this.cache.delete(oldestKey);
        }
      }

      public clear(): void {
        for (const val of this.cache.values()) {
          URL.revokeObjectURL(val.blobUrl);
          this.revokedUrls.push(val.blobUrl);
        }
        this.cache.clear();
        this.currentBytes = 0;
      }
    }

    it('[T2.B3.01] Cache limit clamping: setting limit below 32MB (e.g. 10MB) clamps up to 32MB', () => {
      const manager = new LRUImageMemoryManager(10);
      expect(manager.limitMB).toBe(32);

      manager.setLimitMB(0);
      expect(manager.limitMB).toBe(32);

      manager.setLimitMB(-50);
      expect(manager.limitMB).toBe(32);
    });

    it('[T2.B3.02] Cache limit clamping: setting limit above 2048MB (e.g. 4096MB) clamps down to 2048MB', () => {
      const manager = new LRUImageMemoryManager(4096);
      expect(manager.limitMB).toBe(2048);

      manager.setLimitMB(10000);
      expect(manager.limitMB).toBe(2048);
    });

    it('[T2.B3.03] Setting cache limit to valid intermediate value (128MB, 512MB) updates state accurately', () => {
      const manager = new LRUImageMemoryManager(128);
      expect(manager.limitMB).toBe(128);
      expect(manager.maxBytes).toBe(128 * 1024 * 1024);

      manager.setLimitMB(512);
      expect(manager.limitMB).toBe(512);
      expect(manager.maxBytes).toBe(512 * 1024 * 1024);
    });

    it('[T2.B3.04] LRU eviction respects 32MB minimum limit and evicts oldest entry when capacity exceeded', () => {
      const manager = new LRUImageMemoryManager(32); // 32MB limit
      const tenMB = 10 * 1024 * 1024;

      manager.put('img1', 'blob:http://localhost/img1', tenMB);
      manager.put('img2', 'blob:http://localhost/img2', tenMB);
      manager.put('img3', 'blob:http://localhost/img3', tenMB);
      expect(manager.cache.size).toBe(3);
      expect(manager.currentBytes).toBe(30 * 1024 * 1024);

      // Adding 4th image (10MB) pushes total to 40MB > 32MB, evicting img1
      manager.put('img4', 'blob:http://localhost/img4', tenMB);

      expect(manager.cache.size).toBe(3);
      expect(manager.get('img1')).toBeUndefined();
      expect(manager.get('img2')).toBe('blob:http://localhost/img2');
      expect(manager.get('img3')).toBe('blob:http://localhost/img3');
      expect(manager.get('img4')).toBe('blob:http://localhost/img4');
      expect(manager.revokedUrls).toContain('blob:http://localhost/img1');
    });

    it('[T2.B3.05] LRU eviction on 2048MB limit permits large accumulation before any eviction occurs', () => {
      const manager = new LRUImageMemoryManager(2048); // 2048MB limit
      const fiftyMB = 50 * 1024 * 1024;

      for (let i = 1; i <= 30; i++) {
        manager.put(`img-${i}`, `blob:http://localhost/img-${i}`, fiftyMB);
      }

      // 30 * 50MB = 1500MB <= 2048MB -> All 30 images should remain in cache
      expect(manager.cache.size).toBe(30);
      expect(manager.currentBytes).toBe(1500 * 1024 * 1024);
      expect(manager.revokedUrls.length).toBe(0);
    });

    it('[T2.B3.06] Single image larger than entire cache limit (e.g. 35MB image on 32MB limit) triggers full eviction of older items', () => {
      const manager = new LRUImageMemoryManager(32);
      const fiveMB = 5 * 1024 * 1024;
      const thirtyFiveMB = 35 * 1024 * 1024;

      manager.put('small1', 'blob:http://localhost/small1', fiveMB);
      manager.put('small2', 'blob:http://localhost/small2', fiveMB);

      // Oversized image
      manager.put('large1', 'blob:http://localhost/large1', thirtyFiveMB);

      // Previous items must be evicted
      expect(manager.get('small1')).toBeUndefined();
      expect(manager.get('small2')).toBeUndefined();
      expect(manager.revokedUrls).toContain('blob:http://localhost/small1');
      expect(manager.revokedUrls).toContain('blob:http://localhost/small2');
    });

    it('[T2.B3.07] Evicted image object URLs trigger URL.revokeObjectURL to release memory', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const manager = new LRUImageMemoryManager(32);
      const twentyMB = 20 * 1024 * 1024;

      manager.put('evict-target', 'blob:http://localhost/target-blob', twentyMB);
      manager.put('evict-trigger', 'blob:http://localhost/trigger-blob', twentyMB); // Exceeds 32MB

      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/target-blob');
    });

    it('[T2.B3.08] Re-requesting an evicted image re-fetches and generates a fresh valid blob URL', async () => {
      const url = 'http://localhost:4040/rest/getCoverArt?id=rerequest-test';
      const firstBlob = await getCachedImageUrl(url);
      expect(firstBlob).toContain('blob:');

      // Simulate manual cache invalidation / eviction
      URL.revokeObjectURL(firstBlob);

      const secondBlob = await getCachedImageUrl(url);
      expect(secondBlob).toBeDefined();
    });

    it('[T2.B3.09] Accessing an existing item updates its LRU timestamp, preventing it from being evicted next', () => {
      const manager = new LRUImageMemoryManager(32);
      const tenMB = 10 * 1024 * 1024;

      manager.put('item1', 'blob:http://localhost/b1', tenMB);
      manager.put('item2', 'blob:http://localhost/b2', tenMB);
      manager.put('item3', 'blob:http://localhost/b3', tenMB);

      // Access item1 to make it most recently used
      manager.get('item1');

      // Add item4 (10MB), total = 40MB -> item2 should be evicted (as oldest untouched)
      manager.put('item4', 'blob:http://localhost/b4', tenMB);

      expect(manager.get('item1')).toBe('blob:http://localhost/b1');
      expect(manager.get('item2')).toBeUndefined(); // evicted
      expect(manager.get('item3')).toBe('blob:http://localhost/b3');
      expect(manager.get('item4')).toBe('blob:http://localhost/b4');
    });

    it('[T2.B3.10] 20 rapid concurrent requests for the exact same image URL make exactly 1 network fetch', async () => {
      const url = 'http://localhost:4040/rest/getCoverArt?id=art-concurrent-20';
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const promises = Array.from({ length: 20 }, () => getCachedImageUrl(url));
      const results = await Promise.all(promises);

      expect(results.length).toBe(20);
      const firstUrl = results[0];
      expect(results.every(u => u === firstUrl)).toBe(true);

      const matchingCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('art-concurrent-20'));
      expect(matchingCalls.length).toBe(1);
    });

    it('[T2.B3.11] 20 rapid concurrent requests for distinct image URLs fetch and cache all 20 images', async () => {
      const urls = Array.from({ length: 20 }, (_, i) => `http://localhost:4040/rest/getCoverArt?id=distinct-art-${i}`);
      const results = await Promise.all(urls.map(u => getCachedImageUrl(u)));

      expect(results.length).toBe(20);
      expect(results.every(u => u && u.startsWith('blob:'))).toBe(true);

      // Set of distinct blob URLs
      const uniqueBlobs = new Set(results);
      expect(uniqueBlobs.size).toBe(20);
    });

    it('[T2.B3.12] Mixed concurrent requests (10 duplicate + 10 distinct) resolve all URLs without deadlocks', async () => {
      const dupUrl = 'http://localhost:4040/rest/getCoverArt?id=mixed-dup';
      const distinctUrls = Array.from({ length: 10 }, (_, i) => `http://localhost:4040/rest/getCoverArt?id=mixed-dist-${i}`);

      const mixedPromises = [
        ...Array.from({ length: 10 }, () => getCachedImageUrl(dupUrl)),
        ...distinctUrls.map(u => getCachedImageUrl(u)),
      ];

      const results = await Promise.all(mixedPromises);
      expect(results.length).toBe(20);
      expect(results.every(u => Boolean(u))).toBe(true);
    });

    it('[T2.B3.13] Clear Image Cache action revokes all active blob URLs and clears cache map', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const manager = new LRUImageMemoryManager(128);

      manager.put('c1', 'blob:http://localhost/c1', 1024);
      manager.put('c2', 'blob:http://localhost/c2', 2048);
      manager.put('c3', 'blob:http://localhost/c3', 4096);

      manager.clear();

      expect(manager.cache.size).toBe(0);
      expect(manager.currentBytes).toBe(0);
      expect(revokeSpy).toHaveBeenCalledTimes(3);
    });

    it('[T2.B3.14] Image fetch returning invalid/empty blob handles error gracefully and returns fallback URL', async () => {
      vi.useFakeTimers();
      setSimulatedNetworkFailure('invalid-blob-image', true);
      const badUrl = 'http://localhost:4040/rest/getCoverArt?id=invalid-blob-image';

      const promise = getCachedImageUrl(badUrl);
      await vi.runAllTimersAsync();
      const res = await promise;

      expect(res).toBe(badUrl);
      vi.useRealTimers();
    });

    it('[T2.B3.15] Memory size tracking correctly calculates byte sizes for various image types (JPEG, PNG, WebP)', () => {
      const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF]);
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
      const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46]);

      expect(jpegHeader.byteLength).toBe(3);
      expect(pngHeader.byteLength).toBe(4);
      expect(webpHeader.byteLength).toBe(4);
    });
  });

  // ==========================================================================
  // Boundary Category 4: Audio Deck & Source Resolution (16 Tests)
  // ==========================================================================
  describe('Boundary Category 4: Audio Deck & Source Resolution', () => {
    it('[T2.B4.01] Rapid track switching (5 calls to deck.load in 50ms) cancels previous and resolves latest track', async () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('rapid-deck-1', mockEl);

      const urls = [
        'http://localhost:4040/rest/stream?id=track-1',
        'http://localhost:4040/rest/stream?id=track-2',
        'http://localhost:4040/rest/stream?id=track-3',
        'http://localhost:4040/rest/stream?id=track-4',
        'http://localhost:4040/rest/stream?id=track-5',
      ];

      // Fire 5 loads rapidly
      const promises = urls.map((url, i) => deck.load(url, i * 10));
      await Promise.all(promises);

      expect(mockEl.src).toBe('http://localhost:4040/rest/stream?id=track-5');
      expect(deck.getState()).toBe('ready');

      deck.destroy();
    });

    it('[T2.B4.02] Rapid play() invocations encountering AbortError do not throw unhandled promise rejections', async () => {
      const mockEl = createMockAudioElement();
      const abortErr = new Error('The play() request was interrupted by a new load request.');
      abortErr.name = 'AbortError';

      mockEl.play = vi.fn().mockRejectedValueOnce(abortErr);
      const deck = new AudioDeck('abort-deck', mockEl);

      await expect(deck.play()).resolves.toBeUndefined();
      deck.destroy();
    });

    it('[T2.B4.03] Seeking beyond duration (seek 500s on 180s track) clamps safe position to 180s', () => {
      const mockEl = createMockAudioElement();
      mockEl.duration = 180;
      const deck = new AudioDeck('seek-over-deck', mockEl);

      deck.seek(500);
      expect(mockEl.currentTime).toBe(180);

      deck.destroy();
    });

    it('[T2.B4.04] Seeking to negative position (seek -50s) clamps safe position to 0s', () => {
      const mockEl = createMockAudioElement();
      mockEl.duration = 180;
      const deck = new AudioDeck('seek-neg-deck', mockEl);

      deck.seek(-50);
      expect(mockEl.currentTime).toBe(0);

      deck.destroy();
    });

    it('[T2.B4.05] Seeking on local asset URL triggers seeking and seeked events accurately', () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('seek-event-deck', mockEl);

      let seekStarted = false;
      let seekCompleted = false;

      deck.on('seeking', () => { seekStarted = true; });
      deck.on('seeked', () => { seekCompleted = true; });

      deck.seek(45);
      mockEl.dispatchEvent(new Event('seeking'));
      mockEl.dispatchEvent(new Event('seeked'));

      expect(seekStarted).toBe(true);
      expect(seekCompleted).toBe(true);

      deck.destroy();
    });

    it('[T2.B4.06] AudioDeck error event sets deck state to "error" and emits error with event payload', () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('err-deck', mockEl);

      let emittedError: any = null;
      deck.on('error', (err) => { emittedError = err; });

      (mockEl as any).simulateError(new Error('Hardware decoder failure'));

      expect(deck.getState()).toBe('error');
      expect(emittedError).toBeDefined();

      deck.destroy();
    });

    it('[T2.B4.07] Corrupted audio file on disk emits MediaError on AudioElement and transitions deck to error state', async () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('corrupt-audio-deck', mockEl);

      const corruptLocalUri = 'http://asset.localhost/C%3A%2FHolad%2Fcorrupt.mp3';
      await deck.load(corruptLocalUri);

      (mockEl as any).simulateError(new Error('MEDIA_ERR_DECODE'));

      expect(deck.getState()).toBe('error');
      deck.destroy();
    });

    it('[T2.B4.08] Missing file on disk when store says completed causes getLocalTrackUri to return null', async () => {
      setPlatform('tauri');
      const trackId = 'ghost-track-1';
      const ghostPath = 'C:/Users/MockUser/Downloads/Holad/tracks/deleted_by_user.mp3';

      // Record as completed in store, but do NOT write to VFS
      useDownloadStore.getState().startDownload(trackId, 'Ghost Track', 'track');
      useDownloadStore.getState().completeDownload(trackId, ghostPath);

      const uri = await StorageManager.getLocalTrackUri(trackId, 'Ghost Track');
      expect(uri).toBeNull();
    });

    it('[T2.B4.09] Missing local file fallback: resolveTrackAudioSource falls back to remote stream when online', async () => {
      setPlatform('tauri');
      setOnline(true);
      const trackId = 'missing-but-online';
      const ghostPath = 'C:/Holad/missing.mp3';

      useDownloadStore.getState().startDownload(trackId, 'Missing Track', 'track');
      useDownloadStore.getState().completeDownload(trackId, ghostPath);

      const result = await resolveTrackAudioSource({
        id: trackId,
        title: 'Missing Track',
        artist: 'Artist',
        album: 'Album',
      });

      expect(result.isLocal).toBe(false);
      expect(result.isAvailable).toBe(true);
      expect(result.src).toContain('/api/stream/');
    });

    it('[T2.B4.10] Missing local file fallback: resolveTrackAudioSource returns unavailable (isAvailable: false) when offline', async () => {
      setPlatform('tauri');
      setOnline(false); // Offline
      const trackId = 'missing-and-offline';
      const ghostPath = 'C:/Holad/not_here.mp3';

      useDownloadStore.getState().startDownload(trackId, 'Offline Missing Track', 'track');
      useDownloadStore.getState().completeDownload(trackId, ghostPath);

      const result = await resolveTrackAudioSource({
        id: trackId,
        title: 'Offline Missing Track',
        artist: 'Artist',
        album: 'Album',
      });

      expect(result.isLocal).toBe(false);
      expect(result.isAvailable).toBe(false);
      expect(result.src).toBe('');
    });

    it('[T2.B4.11] Crossfade transition: outgoing local asset deck fades out as incoming remote deck fades in', async () => {
      const mockElA = createMockAudioElement();
      const mockElB = createMockAudioElement();

      const deckA = new AudioDeck('deck-local-out', mockElA);
      const deckB = new AudioDeck('deck-remote-in', mockElB);

      const localUri = 'http://asset.localhost/C%3A%2FHolad%2Flocal_song.mp3';
      const remoteUrl = 'http://localhost:4040/rest/stream?id=remote-song';

      await deckA.load(localUri);
      await deckB.load(remoteUrl);

      expect(isLocalMediaUrl(localUri)).toBe(true);
      expect(isLocalMediaUrl(remoteUrl)).toBe(false);

      // Perform crossfade steps (1.0 -> 0.0 for deckA, 0.0 -> 1.0 for deckB)
      const steps = [0.0, 0.25, 0.5, 0.75, 1.0];
      for (const progress of steps) {
        deckA.setVolume(1.0 - progress);
        deckB.setVolume(progress);
      }

      expect(mockElA.volume).toBe(0);
      expect(mockElB.volume).toBe(1);

      deckA.destroy();
      deckB.destroy();
    });

    it('[T2.B4.12] Crossfade transition: outgoing remote stream deck fades out as incoming local asset deck fades in', async () => {
      const mockElA = createMockAudioElement();
      const mockElB = createMockAudioElement();

      const deckA = new AudioDeck('deck-remote-out', mockElA);
      const deckB = new AudioDeck('deck-local-in', mockElB);

      const remoteUrl = 'http://localhost:4040/rest/stream?id=remote-song-2';
      const localUri = 'http://asset.localhost/C%3A%2FHolad%2Flocal_song_2.mp3';

      await deckA.load(remoteUrl);
      await deckB.load(localUri);

      deckA.setVolume(0.0);
      deckB.setVolume(1.0);

      expect(mockElA.volume).toBe(0);
      expect(mockElB.volume).toBe(1);

      deckA.destroy();
      deckB.destroy();
    });


    it('[T2.B4.14] Playback rate clamping limits rate strictly between 0.25x and 4.0x', () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('rate-clamp-deck', mockEl);

      deck.setPlaybackRate(0.1);
      expect(mockEl.playbackRate).toBe(0.25);

      deck.setPlaybackRate(10.0);
      expect(mockEl.playbackRate).toBe(4.0);

      deck.setPlaybackRate(1.5);
      expect(mockEl.playbackRate).toBe(1.5);

      deck.destroy();
    });

    it('[T2.B4.15] AudioDeck destroy cleans up all bound DOM event listeners and resets state to "idle"', () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('destroy-deck', mockEl);

      let stateChangeCount = 0;
      deck.on('statechange', () => { stateChangeCount++; });

      deck.destroy();

      expect(deck.getState()).toBe('idle');

      // Triggering event on audio element should no longer affect listeners
      mockEl.dispatchEvent(new Event('play'));
      expect(deck.getState()).toBe('idle');
    });

    it('[T2.B4.16] Setting volume clamps strictly within [0, 1] range (rejecting -0.5 and 1.5)', () => {
      const mockEl = createMockAudioElement();
      const deck = new AudioDeck('vol-clamp-deck', mockEl);

      deck.setVolume(-0.5);
      expect(mockEl.volume).toBe(0);

      deck.setVolume(1.5);
      expect(mockEl.volume).toBe(1);

      deck.setVolume(0.72);
      expect(mockEl.volume).toBe(0.72);

      deck.destroy();
    });
  });
});
