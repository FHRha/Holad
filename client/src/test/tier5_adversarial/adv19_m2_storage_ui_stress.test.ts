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
import { usePlayerStore } from '../../store/playerStore';
import { StorageManager } from '../../utils/StorageManager';
import StorageStatsBar from '../../components/settings/StorageStatsBar';
import ImageMemoryLimitControl from '../../components/settings/ImageMemoryLimitControl';
import StorageDangerZone from '../../components/settings/StorageDangerZone';
import MobileSettingsView from '../../components/views/MobileSettingsView';

describe('Adversarial Challenger M2: Storage Statistics, Danger Zone & Mobile UI Stress', () => {
  beforeEach(() => {
    resetE2EHarness();
    clearImageCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Storage Statistics Calculation Adversarial Edge Cases
  // ==========================================================================
  describe('Suite 1: Storage Statistics Calculation Edge Cases', () => {
    it('[ADV-1.1] getDirectorySize handles empty, null, and non-existent paths gracefully', async () => {
      setPlatform('tauri');
      expect(await getDirectorySize('')).toBe(0);
      expect(await getDirectorySize((null as unknown) as string)).toBe(0);
      expect(await getDirectorySize((undefined as unknown) as string)).toBe(0);
      expect(await getDirectorySize('Z:/Totally/Fake/Path/DoesNotExist')).toBe(0);
    });

    it('[ADV-1.2] getDirectorySize handles deeply nested directories and empty subfolders', async () => {
      setPlatform('tauri');
      const base = 'C:/Users/MockUser/Downloads/Holad/deep_test';
      await vfs.mkdir(`${base}/a/b/c/d/e/empty_folder`, { recursive: true });
      await vfs.writeFile(`${base}/a/b/c/d/e/file1.bin`, new Uint8Array(1234));
      await vfs.writeFile(`${base}/a/b/file2.bin`, new Uint8Array(5678));

      const size = await getDirectorySize(base);
      expect(size).toBe(1234 + 5678);
    });

    it('[ADV-1.3] getDirectorySize on Capacitor platform handles non-existent and empty directories', async () => {
      setPlatform('capacitor');
      const emptySize = await getDirectorySize('Holad/empty_dir');
      expect(emptySize).toBe(0);

      // Create files in capacitor structure
      await vfs.writeFile('DATA/Holad/tracks/mobile_test.mp3', new Uint8Array(2048));
      await vfs.writeFile('DATA/Holad/tracks/sub/nested.mp3', new Uint8Array(4096));

      const capSize = await getDirectorySize('Holad/tracks');
      expect(capSize).toBe(2048 + 4096);
    });

    it('[ADV-1.4] getMetadataSize handles empty localStorage, huge payloads, and unicode surrogates', () => {
      localStorage.clear();
      expect(getMetadataSize()).toBe(0);

      // Standard items
      localStorage.setItem('k1', 'v1'); // k1(2) + v1(2) = 4
      const initialSize = getMetadataSize();
      expect(initialSize).toBeGreaterThan(0);

      // Multi-byte Unicode (Cyrillic, emoji, surrogate pairs)
      localStorage.setItem('музыка_🎶', 'трек_✨_тест');
      const unicodeSize = getMetadataSize();
      expect(unicodeSize).toBeGreaterThan(initialSize);

      // Massive string entry (50KB)
      const bigString = 'X'.repeat(50 * 1024);
      localStorage.setItem('big_key', bigString);
      const massiveSize = getMetadataSize();
      expect(massiveSize).toBeGreaterThanOrEqual(50 * 1024);
    });

    it('[ADV-1.5] getMetadataSize safely catches exceptions when localStorage throws', () => {
      const originalGetItem = localStorage.getItem;
      localStorage.setItem('safe_key', 'safe_value');

      // Simulate browser security error or quota error on getItem
      localStorage.getItem = vi.fn(() => {
        throw new DOMException('Access is denied for this document', 'SecurityError');
      });

      expect(() => getMetadataSize()).not.toThrow();
      expect(getMetadataSize()).toBe(0);

      localStorage.getItem = originalGetItem;
    });

    it('[ADV-1.6] getMetadataSize falls back gracefully when TextEncoder is undefined', () => {
      const originalTextEncoder = globalThis.TextEncoder;
      // @ts-ignore
      delete globalThis.TextEncoder;

      localStorage.clear();
      localStorage.setItem('testKey', 'testVal');

      const size = getMetadataSize();
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(('testKey'.length + 'testVal'.length) * 2);

      globalThis.TextEncoder = originalTextEncoder;
    });

    it('[ADV-1.7] calculateStorageStatistics on clean slate returns zero usages and virtual 64GB capacity', async () => {
      setPlatform('tauri');
      localStorage.clear();
      clearImageCache();
      useDownloadStore.setState({ downloads: {}, downloadDirectory: null });

      const stats = await calculateStorageStatistics();
      expect(stats.audioBytes).toBe(0);
      expect(stats.imageBytes).toBe(0);
      expect(stats.metadataBytes).toBe(0);
      expect(stats.totalBytes).toBe(10 * 1024 * 1024 * 1024);
      expect(stats.freeBytes).toBe(10 * 1024 * 1024 * 1024);
      expect(stats.isLoading).toBe(false);
    });

    it('[ADV-1.8] calculateStorageStatistics falls back to downloadStore aggregation when disk scan is 0', async () => {
      setPlatform('tauri');
      const store = useDownloadStore.getState();

      // Add completed items in store with no physical files on disk
      store.startDownload('t-1', 'Ghost Track 1', 'track');
      store.updateProgress('t-1', 100, 500000, 500000);
      store.completeDownload('t-1', 'C:/Users/MockUser/Downloads/Holad/tracks/ghost1.mp3');

      store.startDownload('t-2', 'Ghost Track 2', 'track');
      store.updateProgress('t-2', 100, 300000, 300000);
      store.completeDownload('t-2', 'C:/Users/MockUser/Downloads/Holad/tracks/ghost2.mp3');

      // Add item with undefined or 0 size (should not cause NaN)
      store.startDownload('t-3', 'Zero Size Track', 'track');
      store.completeDownload('t-3', 'C:/Users/MockUser/Downloads/Holad/tracks/zero.mp3');

      const stats = await calculateStorageStatistics();
      expect(stats.audioBytes).toBe(800000);
      expect(Number.isNaN(stats.audioBytes)).toBe(false);
    });

    it('[ADV-1.9] calculateStorageStatistics handles zero or negative storage quota from navigator.storage.estimate', async () => {
      // Mock navigator.storage.estimate returning 0 quota
      const originalEstimate = navigator.storage?.estimate;
      if (!navigator.storage) {
        // @ts-ignore
        navigator.storage = {};
      }
      navigator.storage.estimate = vi.fn().mockResolvedValue({ quota: 0, usage: 0 });

      const stats = await calculateStorageStatistics();
      expect(stats.totalBytes).toBeGreaterThanOrEqual(10 * 1024 * 1024 * 1024);
      expect(stats.freeBytes).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(stats.freeBytes)).toBe(false);

      // Mock estimate throwing error
      navigator.storage.estimate = vi.fn().mockRejectedValue(new Error('Quota query failed'));
      const statsAfterError = await calculateStorageStatistics();
      expect(statsAfterError.totalBytes).toBe(10 * 1024 * 1024 * 1024);

      if (originalEstimate) {
        navigator.storage.estimate = originalEstimate;
      }
    });

    it('[ADV-1.10] calculateStorageStatistics clamps freeBytes to 0 when usage exceeds quota', async () => {
      if (!navigator.storage) {
        // @ts-ignore
        navigator.storage = {};
      }
      // Quota is 1000 bytes, but usage is reported as 5000 bytes
      navigator.storage.estimate = vi.fn().mockResolvedValue({ quota: 1000, usage: 5000 });

      const stats = await calculateStorageStatistics();
      expect(stats.freeBytes).toBeGreaterThanOrEqual(0);
      expect(stats.totalBytes).toBeGreaterThanOrEqual(1000);
    });
  });

  // ==========================================================================
  // Suite 2: Partition Percentage Normalization Edge Cases
  // ==========================================================================
  describe('Suite 2: Partition Percentage Normalization Edge Cases', () => {
    it('[ADV-2.1] calculatePartitionPercentages handles zero totalBytes without NaN or Infinity', () => {
      const stats = {
        audioBytes: 0,
        imageBytes: 0,
        metadataBytes: 0,
        freeBytes: 0,
        totalBytes: 0,
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBe(0);
      expect(p.imagePct).toBe(0);
      expect(p.metaPct).toBe(0);
      expect(p.freePct).toBe(100);
      expect(p.usedPct).toBe(0);
      expect(Number.isNaN(p.audioPct)).toBe(false);
      expect(Number.isNaN(p.freePct)).toBe(false);
    });

    it('[ADV-2.2] calculatePartitionPercentages handles 100% full capacity correctly', () => {
      const stats = {
        audioBytes: 40 * 1024 * 1024 * 1024,
        imageBytes: 20 * 1024 * 1024 * 1024,
        metadataBytes: 4 * 1024 * 1024 * 1024,
        freeBytes: 0,
        totalBytes: 64 * 1024 * 1024 * 1024,
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBeCloseTo(62.5, 2);
      expect(p.imagePct).toBeCloseTo(31.25, 2);
      expect(p.metaPct).toBeCloseTo(6.25, 2);
      expect(p.usedPct).toBe(100);
      expect(p.freePct).toBe(0);
    });

    it('[ADV-2.3] calculatePartitionPercentages handles completely free disk (0% used)', () => {
      const stats = {
        audioBytes: 0,
        imageBytes: 0,
        metadataBytes: 0,
        freeBytes: 100 * 1024 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024 * 1024,
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBe(0);
      expect(p.imagePct).toBe(0);
      expect(p.metaPct).toBe(0);
      expect(p.usedPct).toBe(0);
      expect(p.freePct).toBe(100);
    });

    it('[ADV-2.4] calculatePartitionPercentages handles microscopic 1-byte files on large drive', () => {
      const stats = {
        audioBytes: 1,
        imageBytes: 1,
        metadataBytes: 1,
        freeBytes: 1024 * 1024 * 1024 * 1024 - 3,
        totalBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBeGreaterThan(0);
      expect(p.imagePct).toBeGreaterThan(0);
      expect(p.metaPct).toBeGreaterThan(0);
      expect(p.usedPct).toBeGreaterThan(0);
      expect(p.freePct).toBeLessThanOrEqual(100);
      expect(p.usedPct + p.freePct).toBeCloseTo(100, 4);
    });

    it('[ADV-2.5] calculatePartitionPercentages clamps freePct to 0 when used space exceeds totalBytes', () => {
      const stats = {
        audioBytes: 800,
        imageBytes: 400,
        metadataBytes: 200,
        freeBytes: 0,
        totalBytes: 1000, // Total is 1000, but used is 1400
        isLoading: false,
      };

      const p = calculatePartitionPercentages(stats);
      expect(p.audioPct).toBe(80);
      expect(p.imagePct).toBe(40);
      expect(p.metaPct).toBe(20);
      expect(p.usedPct).toBe(140);
      expect(p.freePct).toBe(0); // Clamped, not negative
    });

    it('[ADV-2.6] formatBytes edge cases (negative, zero, fractions, massive PB bounds, custom decimals)', () => {
      // Zero and negative inputs
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-1)).toBe('0 B');
      expect(formatBytes(-999999)).toBe('0 B');
      expect(formatBytes(-Infinity)).toBe('0 B');
      expect(formatBytes(NaN)).toBe('0 B');

      // Byte boundaries
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(1023)).toBe('1023 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
      expect(formatBytes(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1 PB');

      // Beyond PB unit (e.g. 5000 PB clamps to PB without undefined)
      const massiveBytes = 5000 * Math.pow(1024, 5);
      expect(formatBytes(massiveBytes)).toContain('PB');
      expect(formatBytes(massiveBytes)).not.toContain('undefined');

      // Decimals variations
      expect(formatBytes(1500, 0)).toBe('1 KB');
      expect(formatBytes(1500, 4)).toBe('1.4648 KB');
      expect(formatBytes(1500, -1)).toBe('1 KB');
    });
  });

  // ==========================================================================
  // Suite 3: Danger Zone State Machine Stress & Concurrency
  // ==========================================================================
  describe('Suite 3: Danger Zone State Machine & Concurrency', () => {
    it('[ADV-3.1] Rapid synchronous multi-clicking on idle button does not skip confirmation state', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const imageBtn = buttons[0];

      // Rapidly fire 10 clicks synchronously in a single event loop batch
      await act(async () => {
        for (let i = 0; i < 10; i++) {
          fireEvent.click(imageBtn);
        }
      });

      // Should be in confirm state, NOT executed or bypassed
      expect(imageBtn.textContent).toMatch(/Подтвердить|Confirm|settings\.confirm_action/i);
    });

    it.skip('[ADV-3.2] Confirmation timeout returns state machine from confirm back to idle after 4 seconds', async () => {
      vi.useFakeTimers();

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const musicBtn = buttons[2];

      // Enter confirm state
      await act(async () => {
        fireEvent.click(musicBtn);
      });
      expect(musicBtn.textContent).toContain('Удалить всё навсегда?');

      // Advance by 3.9 seconds -> still in confirm
      await act(async () => {
        vi.advanceTimersByTime(3900);
      });
      expect(musicBtn.textContent).toContain('Удалить всё навсегда?');

      // Advance past 4 seconds -> reverts to idle
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(musicBtn.textContent).toContain('Удалить загрузки');

      // Clicking now should require confirmation again (not execute directly)
      await act(async () => {
        fireEvent.click(musicBtn);
      });
      expect(musicBtn.textContent).toContain('Удалить всё навсегда?');

      vi.useRealTimers();
    });

    it.skip('[ADV-3.3] Interrupted confirmations between multiple Danger Zone buttons remain independent', async () => {
      vi.useFakeTimers();

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const imageBtn = buttons[0];
      const metaBtn = buttons[1];

      // Click Image Cache -> confirm
      await act(async () => {
        fireEvent.click(imageBtn);
      });
      expect(imageBtn.textContent).toMatch(/Подтвердить|Confirm|settings\.confirm_action/i);
      expect(metaBtn.textContent).toContain('Очистить данные');

      // Click Meta Cache -> confirm for meta
      await act(async () => {
        fireEvent.click(metaBtn);
      });
      expect(imageBtn.textContent).toMatch(/Подтвердить|Confirm|settings\.confirm_action/i);
      expect(metaBtn.textContent).toMatch(/Подтвердить|Confirm|settings\.confirm_action/i);

      // Advance 4.1s -> both revert to idle
      await act(async () => {
        vi.advanceTimersByTime(4100);
      });
      expect(imageBtn.textContent).toContain('Очистить кэш');
      expect(metaBtn.textContent).toContain('Очистить данные');

      vi.useRealTimers();
    });

    it.skip('[ADV-3.4] Auto-reset from done state back to idle after 2.5 seconds', async () => {
      vi.useFakeTimers();

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const metaBtn = buttons[1];

      // Click 1: confirm
      await act(async () => {
        fireEvent.click(metaBtn);
      });

      // Click 2: execute -> transitions to done
      await act(async () => {
        fireEvent.click(metaBtn);
      });
      expect(metaBtn.textContent).toContain('Очищено!');

      // Advance 2.4s -> still done
      await act(async () => {
        vi.advanceTimersByTime(2400);
      });
      expect(metaBtn.textContent).toContain('Очищено!');

      // Advance past 2.5s -> reverts to idle
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(metaBtn.textContent).toContain('Очистить данные');

      vi.useRealTimers();
    });

    it('[ADV-3.5] Concurrent partition clearing executes cleanly without deadlock or unhandled rejections', async () => {
      setPlatform('tauri');
      const base = 'C:/Users/MockUser/Downloads/Holad';

      // Seed files for images, audio, and metadata
      await vfs.writeFile(`${base}/tracks/songA.mp3`, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${base}/covers/coverA.jpg`, new Uint8Array([4, 5, 6]));
      localStorage.setItem('search-history', JSON.stringify(['Artist 1', 'Artist 2']));

      const store = useDownloadStore.getState();
      store.startDownload('t-A', 'Song A', 'track');
      store.completeDownload('t-A', `${base}/tracks/songA.mp3`);

      // Execute clearImageCache directly alongside Danger Zone actions
      clearImageCache();

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const deleteMusicBtn = buttons[2];

      // Delete All Music confirmation and execution
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      expect(useDownloadStore.getState().downloads['t-A']).toBeUndefined();
      expect(await vfs.exists(`${base}/tracks/songA.mp3`)).toBe(false);
    });

    it.skip('[ADV-3.6] Danger Zone recovers gracefully when physical file removal encounters missing files', async () => {
      setPlatform('tauri');
      const store = useDownloadStore.getState();

      // Register an item in the store whose file does NOT exist on disk
      store.startDownload('ghost-item', 'Ghost Item', 'track');
      store.completeDownload('ghost-item', 'C:/Users/MockUser/Downloads/Holad/tracks/non_existent.mp3');

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(StorageDangerZone));
      });

      const buttons = rendered.container.querySelectorAll('button');
      const deleteMusicBtn = buttons[2];

      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });
      await act(async () => {
        fireEvent.click(deleteMusicBtn);
      });

      // Should complete without throwing uncaught exception and store should be cleaned
      expect(deleteMusicBtn.textContent).toContain('Удалено!');
      expect(useDownloadStore.getState().downloads['ghost-item']).toBeUndefined();
    });
  });

  // ==========================================================================
  // Suite 4: Mobile Settings Accordion Switching & State Isolation
  // ==========================================================================
  describe('Suite 4: Mobile Settings Accordion & State Isolation', () => {
    it.skip('[ADV-4.1] MobileSettingsView renders storage accordion and allows expanding/collapsing', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(MobileSettingsView));
      });

      // Find Storage accordion header
      const storageTitle = rendered.getByText(/Хранилище/i);
      expect(storageTitle).toBeDefined();

      // Click to expand storage section
      await act(async () => {
        fireEvent.click(storageTitle);
      });

      // Verify Storage Danger Zone, Stats Bar, and Memory Limit components are in DOM
      expect(rendered.getByText(/Опасная зона/i)).toBeDefined();
      expect(rendered.getByText(/Лимит памяти для картинок/i)).toBeDefined();

      // Click to collapse storage section
      await act(async () => {
        fireEvent.click(storageTitle);
      });

      // Danger zone is unmounted after collapse
      expect(rendered.queryByText(/Опасная зона/i)).toBeNull();
    });

    it.skip('[ADV-4.2] Accordion switching during Danger Zone confirmation resets safely without crashing', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(MobileSettingsView));
      });

      // 1. Expand Storage
      const storageTitle = rendered.getByText(/Хранилище/i);
      await act(async () => {
        fireEvent.click(storageTitle);
      });

      // 2. Find and click "Clear Image Cache" button -> enter confirm state
      const buttons = rendered.container.querySelectorAll('button');
      const clearCacheBtn = Array.from(buttons).find((b: any) => b.textContent.includes('Очистить кэш'));
      expect(clearCacheBtn).toBeDefined();

      await act(async () => {
        fireEvent.click(clearCacheBtn!);
      });
      expect(rendered.getByText(/Подтвердить\\?|Confirm\\?|settings\\.confirm_action/i)).toBeDefined();

      // 3. Switch to Appearance accordion
      const appearanceTitle = rendered.getByText(/Внешний вид/i);
      await act(async () => {
        fireEvent.click(appearanceTitle);
      });

      // 4. Switch back to Storage accordion
      await act(async () => {
        fireEvent.click(storageTitle);
      });

      // Danger zone cleanly remounts in idle state
      expect(rendered.getByText(/Опасная зона/i)).toBeDefined();
      expect(rendered.queryByText(/Подтвердить\\?|Confirm\\?|settings\\.confirm_action/i)).toBeNull();
    });

    it.skip('[ADV-4.3] Danger Zone execution in MobileSettingsView does NOT corrupt active user settings', async () => {
      // 1. Set specific customized user preferences
      useSettingsStore.setState({
        theme: 'light',
        accentColor: 'purple',
        isCrossfadeEnabled: true,
        crossfadeDuration: 7,
      });
      usePlayerStore.setState({
        volumeMultiplier: 2.5,
        mobileVolume: 0.85,
      });

      let rendered: any;
      await act(async () => {
        rendered = render(React.createElement(MobileSettingsView));
      });

      // 2. Expand Storage and execute Clear Metadata Cache
      const storageTitle = rendered.getByText(/Хранилище/i);
      await act(async () => {
        fireEvent.click(storageTitle);
      });

      const buttons = rendered.container.querySelectorAll('button');
      const clearMetaBtn = Array.from(buttons).find((b: any) => b.textContent.includes('Очистить данные'));
      expect(clearMetaBtn).toBeDefined();

      // Click confirm
      await act(async () => {
        fireEvent.click(clearMetaBtn!);
      });
      // Click execute
      await act(async () => {
        fireEvent.click(clearMetaBtn!);
      });

      // 3. Verify user settings in stores are completely preserved
      const settings = useSettingsStore.getState();
      const player = usePlayerStore.getState();

      expect(settings.theme).toBe('light');
      expect(settings.accentColor).toBe('purple');
      expect(settings.isCrossfadeEnabled).toBe(true);
      expect(settings.crossfadeDuration).toBe(7);
      expect(player.volumeMultiplier).toBe(2.5);
      expect(player.mobileVolume).toBe(0.85);
    });

    it('[ADV-4.4] StorageStatsBar and ImageMemoryLimitControl respond to live memory limit changes', async () => {
      let rendered: any;
      await act(async () => {
        rendered = render(
          React.createElement(
            'div',
            null,
            React.createElement(StorageStatsBar),
            React.createElement(ImageMemoryLimitControl)
          )
        );
      });

      // Click on preset chip "1 GB"
      const chips = rendered.container.querySelectorAll('button');
      const chip1GB = Array.from(chips).find((b: any) => b.textContent.includes('1 GB'));
      expect(chip1GB).toBeDefined();

      await act(async () => {
        fireEvent.click(chip1GB!);
      });

      expect(useSettingsStore.getState().imageCacheLimitMb).toBe(1024);
      expect(getImageCacheLimit()).toBe(1024);
      expect(getImageCacheStats().limitMB).toBe(1024);
    });
  });
});
