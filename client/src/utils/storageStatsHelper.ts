import { useState, useEffect, useCallback, useMemo } from 'react';
import { exists, readDir, stat } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { StorageManager, isTauri, isCapacitor } from './StorageManager';
import { getImageCacheStats } from './imageCache';
import { useDownloadStore } from '../store/downloadStore';
import { useSettingsStore } from '../store/settingsStore';

export interface StorageStatistics {
  audioBytes: number;
  imageBytes: number;
  metadataBytes: number;
  freeBytes: number;
  totalBytes: number;
  isLoading: boolean;
}

export interface PartitionPercentages {
  audioPct: number;
  imagePct: number;
  metaPct: number;
  freePct: number;
  usedPct: number;
}

/**
 * Formats raw byte numbers into human-readable strings (e.g., "512 KB", "1.24 GB", "0 B")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const normalizedIndex = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, normalizedIndex)).toFixed(dm))} ${sizes[normalizedIndex]}`;
}

/**
 * Calculates byte size of all localStorage items
 */
export function getMetadataSize(): number {
  let totalBytes = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const val = localStorage.getItem(key) || '';
          if (encoder) {
            totalBytes += encoder.encode(key).length + encoder.encode(val).length;
          } else {
            totalBytes += (key.length + val.length) * 2;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Error calculating metadata size:', e);
  }
  return totalBytes;
}

/**
 * Recursively calculates directory size across Tauri, Capacitor, or fallback
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
  if (!dirPath) return 0;
  let totalBytes = 0;

  if (isTauri()) {
    try {
      const hasDir = await exists(dirPath);
      if (!hasDir) return 0;

      const entries = await readDir(dirPath);
      for (const entry of entries) {
        const fullPath = await join(dirPath, entry.name);
        const isDirectory = typeof entry.isDirectory === 'function' ? (entry as any).isDirectory() : Boolean(entry.isDirectory);
        const isFile = typeof entry.isFile === 'function' ? (entry as any).isFile() : Boolean(entry.isFile);

        if (isDirectory) {
          totalBytes += await getDirectorySize(fullPath);
        } else if (isFile) {
          try {
            const fileStat = await stat(fullPath);
            totalBytes += fileStat.size || 0;
          } catch {
            if (typeof (entry as any).size === 'number') {
              totalBytes += (entry as any).size;
            }
          }
        }
      }
    } catch (e) {
      console.warn(`Error reading directory size in Tauri at ${dirPath}:`, e);
    }
  } else if (isCapacitor()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      try {
        const res = await Filesystem.readdir({ path: dirPath, directory: Directory.Data });
        for (const file of res.files) {
          const childPath = `${dirPath}/${file.name}`;
          if (file.type === 'directory') {
            totalBytes += await getDirectorySize(childPath);
          } else {
            totalBytes += file.size || 0;
          }
        }
      } catch {}
    } catch (e) {
      console.warn(`Error reading directory size in Capacitor at ${dirPath}:`, e);
    }
  }

  return totalBytes;
}

/**
 * Orchestrates complete storage statistics calculation across audio, images, metadata, and disk quota
 */
export async function calculateStorageStatistics(customDownloadDir?: string | null): Promise<StorageStatistics> {
  let audioBytes = 0;
  let diskImageBytes = 0;

  if (isTauri()) {
    try {
      const baseDir = customDownloadDir || useDownloadStore.getState().downloadDirectory || await StorageManager.getDefaultDownloadDir();
      const tracksDir = await join(baseDir, 'tracks');
      const albumsDir = await join(baseDir, 'albums');
      const coversDir = await join(baseDir, 'covers');

      const tracksSize = await getDirectorySize(tracksDir);
      const albumsSize = await getDirectorySize(albumsDir);
      const coversSize = await getDirectorySize(coversDir);

      audioBytes = tracksSize + albumsSize;
      diskImageBytes = coversSize;
    } catch (err) {
      console.warn('Error calculating Tauri storage sizes:', err);
    }
  } else if (isCapacitor()) {
    try {
      const tracksSize = await getDirectorySize('Holad/tracks');
      const albumsSize = await getDirectorySize('Holad/albums');
      const coversSize = await getDirectorySize('Holad/covers');

      audioBytes = tracksSize + albumsSize;
      diskImageBytes = coversSize;
    } catch (err) {
      console.warn('Error calculating Capacitor storage sizes:', err);
    }
  }

  // Fallback store aggregator for audio size if filesystem returns 0 but downloads exist
  if (audioBytes === 0) {
    const downloads = useDownloadStore.getState().downloads;
    for (const id in downloads) {
      const item = downloads[id];
      if (item.status === 'completed' && item.type === 'track') {
        audioBytes += (item.sizeBytes || item.totalBytes || 0);
      }
    }
  }

  // Total in-memory blob cache bytes from LRU image manager
  const inMemoryImageBytes = getImageCacheStats().currentBytes;
  const imageBytes = diskImageBytes + inMemoryImageBytes;
  const metadataBytes = getMetadataSize();

  const totalUsedBytes = audioBytes + imageBytes + metadataBytes;
  const { totalStorageLimitGb = 10 } = useSettingsStore.getState();
  let totalBytes: number;
  let freeBytes: number;

  if (totalStorageLimitGb > 0) {
    totalBytes = totalStorageLimitGb * 1024 * 1024 * 1024;
    freeBytes = Math.max(0, totalBytes - totalUsedBytes);
  } else {
    // Unlimited mode (0 GB): query navigator.storage.estimate() or fall back to system quota estimate
    totalBytes = 64 * 1024 * 1024 * 1024; // Default virtual 64 GB
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota && estimate.quota > 0) {
          totalBytes = estimate.quota;
          freeBytes = Math.max(0, estimate.quota - Math.max(estimate.usage || 0, totalUsedBytes));
        } else {
          totalBytes = Math.max(totalUsedBytes + 64 * 1024 * 1024 * 1024, 64 * 1024 * 1024 * 1024);
          freeBytes = Math.max(0, totalBytes - totalUsedBytes);
        }
      } else {
        freeBytes = Math.max(0, totalBytes - totalUsedBytes);
      }
    } catch (e) {
      console.warn('Error querying storage quota estimate:', e);
      freeBytes = Math.max(0, totalBytes - totalUsedBytes);
    }
  }

  return {
    audioBytes,
    imageBytes,
    metadataBytes,
    freeBytes,
    totalBytes,
    isLoading: false,
  };
}

/**
 * Computes exact normalized percentage distribution for visual progress bars
 */
export function calculatePartitionPercentages(stats: StorageStatistics): PartitionPercentages {
  const total = stats.totalBytes > 0
    ? stats.totalBytes
    : Math.max(1, stats.audioBytes + stats.imageBytes + stats.metadataBytes + stats.freeBytes);

  if (total <= 0) {
    return {
      audioPct: 0,
      imagePct: 0,
      metaPct: 0,
      freePct: 100,
      usedPct: 0,
    };
  }

  const audioPct = (stats.audioBytes / total) * 100;
  const imagePct = (stats.imageBytes / total) * 100;
  const metaPct = (stats.metadataBytes / total) * 100;
  const usedPct = audioPct + imagePct + metaPct;
  const freePct = Math.max(0, 100 - usedPct);

  return {
    audioPct,
    imagePct,
    metaPct,
    freePct,
    usedPct,
  };
}

/**
 * Custom React hook for storage statistics with auto-polling and manual refresh
 */
export function useStorageStats(pollIntervalMs?: number) {
  const [stats, setStats] = useState<StorageStatistics>({
    audioBytes: 0,
    imageBytes: 0,
    metadataBytes: 0,
    freeBytes: 0,
    totalBytes: 0,
    isLoading: true,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const newStats = await calculateStorageStatistics();
      setStats(newStats);
    } catch (e) {
      console.error('Failed to compute storage statistics:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    if (pollIntervalMs && pollIntervalMs > 0) {
      const interval = setInterval(refresh, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [refresh, pollIntervalMs]);

  // Re-scan when downloads store changes (download completed or removed)
  useEffect(() => {
    const unsub = useDownloadStore.subscribe((state, prevState) => {
      if (state.downloads !== prevState.downloads || state.downloadDirectory !== prevState.downloadDirectory) {
        refresh();
      }
    });
    return () => unsub();
  }, [refresh]);

  // Re-scan when settings store (totalStorageLimitGb) changes
  useEffect(() => {
    const unsub = useSettingsStore.subscribe((state, prevState) => {
      if (state.totalStorageLimitGb !== prevState.totalStorageLimitGb) {
        refresh();
      }
    });
    return () => unsub();
  }, [refresh]);

  const percentages = useMemo(() => calculatePartitionPercentages(stats), [stats]);

  return {
    stats,
    percentages,
    refresh,
    isRefreshing,
  };
}
