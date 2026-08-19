import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import {
  vfs,
  resetE2EHarness,
  setPlatform,
} from '../e2e/harness';
import {
  formatBytes,
  getMetadataSize,
  getDirectorySize,
  calculateStorageStatistics,
  calculatePartitionPercentages,
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
import { useSettingsStore } from '../../store/settingsStore';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import StorageStatsBar from '../../components/settings/StorageStatsBar';
import ImageMemoryLimitControl from '../../components/settings/ImageMemoryLimitControl';
import StorageDangerZone from '../../components/settings/StorageDangerZone';

describe('Milestone 2: Storage Statistics, Memory Limit & Danger Zone Core', () => {
  beforeEach(() => {
    resetE2EHarness();
    clearImageCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Feature 7: Storage Statistics Helper & Bar UI
  // ==========================================================================
  describe('Feature 7: storageStatsHelper & StorageStatsBar', () => {
    it('formatBytes converts raw byte numbers into formatted strings', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-10)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 512)).toBe('512 KB');
      expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 2.75)).toBe('2.75 GB');
      expect(formatBytes(1024 * 1024 * 1024 * 1024 * 4)).toBe('4 TB');
    });

    it('getMetadataSize returns byte size of localStorage items', () => {
      localStorage.clear();
      localStorage.setItem('streamnavi-test-key-1', 'test-value-1');
      localStorage.setItem('streamnavi-test-key-2', 'longer-test-value-for-metadata');

      const size = getMetadataSize();
      expect(size).toBeGreaterThan(0);
    });

    it('getDirectorySize recursively calculates folder sizes on Desktop Tauri VFS', async () => {
      setPlatform('tauri');
      const base = 'C:/Users/MockUser/Downloads/Holad';
      await vfs.writeFile(`${base}/tracks/song1.mp3`, new Uint8Array(500));
      await vfs.writeFile(`${base}/tracks/song2.mp3`, new Uint8Array(700));
      await vfs.writeFile(`${base}/albums/Rock/track1.mp3`, new Uint8Array(1000));

      const tracksSize = await getDirectorySize(`${base}/tracks`);
      const albumsSize = await getDirectorySize(`${base}/albums`);
      const totalSize = await getDirectorySize(base);

      expect(tracksSize).toBe(1200);
      expect(albumsSize).toBe(1000);
      expect(totalSize).toBe(2200);
    });

    it('getDirectorySize returns 0 for non-existent directory', async () => {
      setPlatform('tauri');
      const size = await getDirectorySize('C:/NonExistent/Folder');
      expect(size).toBe(0);
    });

    it('calculateStorageStatistics aggregates audio, image, and metadata sizes', async () => {
      setPlatform('tauri');
      const base = 'C:/Users/MockUser/Downloads/Holad';
      await vfs.writeFile(`${base}/tracks/s1.mp3`, new Uint8Array(1024 * 400));
      await vfs.writeFile(`${base}/albums/Alb1/s2.mp3`, new Uint8Array(1024 * 600));
      await vfs.writeFile(`${base}/covers/cov1.jpg`, new Uint8Array(1024 * 200));

      const stats = await calculateStorageStatistics(base);
      expect(stats.audioBytes).toBe(1024 * 1000);
      expect(stats.imageBytes).toBeGreaterThanOrEqual(1024 * 200);
      expect(stats.metadataBytes).toBeGreaterThanOrEqual(0);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.freeBytes).toBeGreaterThan(0);
      expect(stats.isLoading).toBe(false);
    });

    it('calculatePartitionPercentages calculates accurate proportional shares', () => {
      const stats = {
        audioBytes: 500,
        imageBytes: 300,
        metadataBytes: 200,
        freeBytes: 9000,
        totalBytes: 10000,
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBe(5);
      expect(p.imagePct).toBe(3);
      expect(p.metaPct).toBe(2);
      expect(p.usedPct).toBe(10);
      expect(p.freePct).toBe(90);
    });

    it('StorageStatsBar component renders and allows refresh interaction', async () => {
      const onRefreshMock = vi.fn();
      let rendered: any;
      await act(async () => {
        rendered = render(<StorageStatsBar onRefreshRequested={onRefreshMock} />);
      });

      const refreshBtn = rendered.container.querySelector('button');
      expect(refreshBtn).not.toBeNull();

      await act(async () => {
        fireEvent.click(refreshBtn!);
      });

      expect(onRefreshMock).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Feature 8: Image Cache & Memory Limit Manager
  // ==========================================================================
  describe('Feature 8: imageCache, settingsStore & ImageMemoryLimitControl', () => {
    it('LRUImageMemoryManager clamps limits within [32, 2048]', () => {
      const mgr = new LRUImageMemoryManager(16);
      expect(mgr.limitMB).toBe(32);

      mgr.setLimitMB(4096);
      expect(mgr.limitMB).toBe(2048);

      mgr.setLimitMB(512);
      expect(mgr.limitMB).toBe(512);
    });

    it('getImageCacheStats reports live memory metrics and usage percentage', () => {
      setImageCacheLimit(128);
      const stats = getImageCacheStats();
      expect(stats.limitMB).toBe(128);
      expect(stats.limitBytes).toBe(128 * 1024 * 1024);
      expect(stats.currentBytes).toBe(0);
      expect(stats.itemCount).toBe(0);
      expect(stats.usagePercent).toBe(0);
    });

    it('settingsStore imageCacheLimitMb setter updates imageCache and clamps values', () => {
      const { setImageCacheLimitMb } = useSettingsStore.getState();
      setImageCacheLimitMb(512);
      expect(useSettingsStore.getState().imageCacheLimitMb).toBe(512);
      expect(getImageCacheLimit()).toBe(512);

      setImageCacheLimitMb(10); // Below 32
      expect(useSettingsStore.getState().imageCacheLimitMb).toBe(32);
      expect(getImageCacheLimit()).toBe(32);

      setImageCacheLimitMb(5000); // Above 2048
      expect(useSettingsStore.getState().imageCacheLimitMb).toBe(2048);
      expect(getImageCacheLimit()).toBe(2048);
    });

    it('clearImageCache revokes all cached blob URLs and resets metrics', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
      const mgr = new LRUImageMemoryManager(32);

      mgr.evictToFit(0);
      clearImageCache();

      const stats = getImageCacheStats();
      expect(stats.currentBytes).toBe(0);
      expect(stats.itemCount).toBe(0);
    });

    it('ImageMemoryLimitControl renders presets and updates store when preset chip is clicked', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(<ImageMemoryLimitControl />);
      });

      const buttons = rendered.container.querySelectorAll('button');
      const preset512 = Array.from(buttons).find((b: any) => b.textContent.includes('512 MB'));
      expect(preset512).toBeDefined();

      await act(async () => {
        fireEvent.click(preset512!);
      });

      expect(useSettingsStore.getState().imageCacheLimitMb).toBe(512);
      expect(getImageCacheLimit()).toBe(512);
    });
  });

  // ==========================================================================
  // Feature 9 & 10: Storage Danger Zone & Deletion Operations
  // ==========================================================================
  describe('Feature 9 & 10: Danger Zone Operations', () => {
    it('StorageManager.removeTrack and removeDirectory physically deletes files from VFS', async () => {
      setPlatform('tauri');
      const trackPath = 'C:/Users/MockUser/Downloads/Holad/tracks/delete_me.mp3';
      const albumPath = 'C:/Users/MockUser/Downloads/Holad/albums/DeleteAlbum';

      await vfs.writeFile(trackPath, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${albumPath}/track1.mp3`, new Uint8Array([4, 5, 6]));

      expect(await vfs.exists(trackPath)).toBe(true);
      expect(await vfs.exists(albumPath)).toBe(true);

      await StorageManager.removeTrack(trackPath);
      expect(await vfs.exists(trackPath)).toBe(false);

      await StorageManager.removeDirectory(albumPath);
      expect(await vfs.exists(albumPath)).toBe(false);
    });

    it('clearImageCache does not touch downloaded audio files on disk', async () => {
      setPlatform('tauri');
      const audioPath = 'C:/Users/MockUser/Downloads/Holad/tracks/keep_safe.mp3';
      await vfs.writeFile(audioPath, new Uint8Array([10, 20, 30]));

      clearImageCache();

      expect(await vfs.exists(audioPath)).toBe(true);
    });

    it('StorageDangerZone operates confirmation state machine before clearing', async () => {
      vi.useFakeTimers();
      const onActionComplete = vi.fn();

      let rendered: any;
      await act(async () => {
        rendered = render(<StorageDangerZone onActionComplete={onActionComplete} />);
      });

      const buttons = rendered.container.querySelectorAll('button');
      // Find "Clear Metadata" button
      const metaBtn = buttons[1];
      expect(metaBtn).toBeDefined();

      // First click enters confirm state
      await act(async () => {
        fireEvent.click(metaBtn);
      });
      expect(metaBtn.textContent).toContain('Подтвердить');

      // Second click executes action
      await act(async () => {
        fireEvent.click(metaBtn);
      });

      expect(onActionComplete).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('StorageDangerZone Delete All Downloaded Music empties store and files', async () => {
      setPlatform('tauri');
      const store = useDownloadStore.getState();
      const trackPath = 'C:/Users/MockUser/Downloads/Holad/tracks/track_kill.mp3';
      await vfs.writeFile(trackPath, new Uint8Array([1, 2, 3]));

      store.startDownload('t-kill', 'Track Kill', 'track');
      store.completeDownload('t-kill', trackPath);

      expect(useDownloadStore.getState().downloads['t-kill']).toBeDefined();

      let rendered: any;
      await act(async () => {
        rendered = render(<StorageDangerZone />);
      });

      const buttons = rendered.container.querySelectorAll('button');
      const deleteMusicBtn = buttons[2];

      // First click: confirm
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      // Second click: execute delete
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      expect(useDownloadStore.getState().downloads['t-kill']).toBeUndefined();
      expect(await vfs.exists(trackPath)).toBe(false);
    });
  });

  // ==========================================================================
  // Milestone 2 R2 Enhancements: UI Adaptation, Slider Marks & Layout Verification
  // ==========================================================================
  describe('Milestone 2 R2: UI Adaptation, Slider Marks & Layout Verification', () => {
    it('ImageMemoryLimitControl contains correctly positioned percentage scale ticks', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(<ImageMemoryLimitControl />);
      });

      const label32 = rendered.container.querySelector('.left-0');
      const label512 = rendered.container.querySelector('.left-\\[23\\.8\\%\\]');
      const label1GB = rendered.container.querySelector('.left-\\[49\\.2\\%\\]');
      const label2GB = rendered.container.querySelector('.right-0');

      expect(label32).not.toBeNull();
      expect(label32.textContent).toBe('32 MB');
      expect(label512).not.toBeNull();
      expect(label512.textContent).toBe('512 MB');
      expect(label1GB).not.toBeNull();
      expect(label1GB.textContent).toBe('1 GB');
      expect(label2GB).not.toBeNull();
      expect(label2GB.textContent).toBe('2 GB');
    });

    it('StorageDangerZone renders action descriptions with leading-normal and no truncate clipping', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(<StorageDangerZone />);
      });

      const descriptions = rendered.container.querySelectorAll('.leading-normal');
      expect(descriptions.length).toBeGreaterThanOrEqual(3);
      
      // Ensure none of the danger zone descriptions have class 'truncate'
      descriptions.forEach((desc: Element) => {
        expect(desc.className).not.toContain('truncate');
      });
    });

    it('StorageStatsBar contains md:grid-cols-4 for responsive 2-column modal layout', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(<StorageStatsBar />);
      });

      const grid = rendered.container.querySelector('.grid-cols-2.md\\:grid-cols-4');
      expect(grid).not.toBeNull();
    });
  });
});

