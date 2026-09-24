
export interface ImageCacheEntry {
  blobUrl: string;
  sizeBytes: number;
  accessSeq: number;
  lastAccessed: number;
}

export interface ImageCacheStats {
  currentBytes: number;
  limitBytes: number;
  limitMB: number;
  itemCount: number;
  usagePercent: number;
}

export class LRUImageMemoryManager {
  private cache = new Map<string, ImageCacheEntry>();
  private fetchingCache = new Map<string, Promise<string>>();
  private fetchQueue: Array<() => void> = [];
  private activeFetches: number = 0;
  private readonly maxConcurrentFetches: number = 4;
  public currentBytes: number = 0;
  public limitMB: number = 48;
  private accessCounter: number = 0;

  constructor(limitMB: number = 48, maxConcurrentFetches: number = 4) {
    this.limitMB = this.clampLimit(limitMB);
    this.maxConcurrentFetches = maxConcurrentFetches > 0 ? maxConcurrentFetches : 4;
  }

  private clampLimit(mb: number): number {
    if (typeof mb !== 'number' || isNaN(mb)) return 48;
    return Math.max(32, Math.min(2048, Math.round(mb)));
  }

  public get maxBytes(): number {
    return this.limitMB * 1024 * 1024;
  }

  public setLimitMB(mb: number): void {
    this.limitMB = this.clampLimit(mb);
    this.evictToFit(0);
  }

  public getStats(): ImageCacheStats {
    const limitBytes = this.maxBytes;
    const usagePercent = limitBytes > 0 ? Math.min(100, (this.currentBytes / limitBytes) * 100) : 0;
    return {
      currentBytes: this.currentBytes,
      limitBytes,
      limitMB: this.limitMB,
      itemCount: this.cache.size,
      usagePercent,
    };
  }

  public evictToFit(incomingBytes: number): void {
    while (this.currentBytes + incomingBytes > this.maxBytes && this.cache.size > 0) {
      let oldestKey: string | null = null;
      let oldestSeq = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.accessSeq < oldestSeq) {
          oldestSeq = entry.accessSeq;
          oldestKey = key;
        }
      }

      if (!oldestKey) break;
      const oldestEntry = this.cache.get(oldestKey)!;
      this.currentBytes -= oldestEntry.sizeBytes;
      try {
        URL.revokeObjectURL(oldestEntry.blobUrl);
      } catch (err) {
        console.warn('Error revoking object URL:', err);
      }
      this.cache.delete(oldestKey);
    }
  }

  private enqueueFetch<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.activeFetches++;
        task()
          .then(resolve, reject)
          .finally(() => {
            this.activeFetches--;
            this.processQueue();
          });
      };

      if (this.activeFetches < this.maxConcurrentFetches) {
        run();
      } else {
        this.fetchQueue.push(run);
      }
    });
  }

  private processQueue(): void {
    while (this.activeFetches < this.maxConcurrentFetches && this.fetchQueue.length > 0) {
      const next = this.fetchQueue.shift();
      if (next) {
        next();
      }
    }
  }

  public async getCachedImageUrl(originalUrl: string): Promise<string> {
    if (!originalUrl) return originalUrl;

    if (
      originalUrl.startsWith('data:') ||
      originalUrl.startsWith('blob:') ||
      originalUrl.startsWith('http://asset.localhost') ||
      originalUrl.startsWith('asset://') ||
      originalUrl.startsWith('_capacitor_file_') ||
      originalUrl.startsWith('capacitor://') ||
      originalUrl.startsWith('file://')
    ) {
      return originalUrl;
    }

    // Cache hit
    if (this.cache.has(originalUrl)) {
      const entry = this.cache.get(originalUrl)!;
      entry.accessSeq = ++this.accessCounter;
      entry.lastAccessed = Date.now();
      return entry.blobUrl;
    }

    // Concurrent in-flight request deduplication
    if (this.fetchingCache.has(originalUrl)) {
      return this.fetchingCache.get(originalUrl)!;
    }

    const fetchPromise = this.enqueueFetch(async () => {
      // Re-check cache in case a previous request populated it while waiting in queue
      if (this.cache.has(originalUrl)) {
        const entry = this.cache.get(originalUrl)!;
        entry.accessSeq = ++this.accessCounter;
        entry.lastAccessed = Date.now();
        return entry.blobUrl;
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(originalUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const blob = await response.blob();
        const sizeBytes = blob.size || 0;
        const objectUrl = URL.createObjectURL(blob);

        this.evictToFit(sizeBytes);

        this.cache.set(originalUrl, {
          blobUrl: objectUrl,
          sizeBytes,
          accessSeq: ++this.accessCounter,
          lastAccessed: Date.now(),
        });
        this.currentBytes += sizeBytes;

        return objectUrl;
      } catch (error) {
        console.debug('Failed to fetch and cache image (fallback to original):', error);
        return originalUrl; // Graceful fallback
      } finally {
        this.fetchingCache.delete(originalUrl);
      }
    });

    this.fetchingCache.set(originalUrl, fetchPromise);
    return fetchPromise;
  }

  public clear(): void {
    for (const entry of this.cache.values()) {
      try {
        URL.revokeObjectURL(entry.blobUrl);
      } catch (err) {
        console.warn('Error revoking object URL:', err);
      }
    }
    this.cache.clear();
    this.fetchingCache.clear();
    this.currentBytes = 0;
  }
}

// Export singleton instance and utility functions
export const imageMemoryCache = new LRUImageMemoryManager(48);

export async function getCachedImageUrl(originalUrl: string): Promise<string> {
  return imageMemoryCache.getCachedImageUrl(originalUrl);
}

export function setImageCacheLimit(limitMb: number): void {
  imageMemoryCache.setLimitMB(limitMb);
}

export function getImageCacheLimit(): number {
  return imageMemoryCache.limitMB;
}

export function getImageCacheStats(): ImageCacheStats {
  return imageMemoryCache.getStats();
}

export function clearImageCache(): void {
  imageMemoryCache.clear();
}
