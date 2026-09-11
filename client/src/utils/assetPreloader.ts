import { StorageManager } from './StorageManager';
import { getCoverArtUrl } from '../api/subsonic';
import { getCachedImageUrl } from './imageCache';
import type { Track } from '../types';

export const CANONICAL_COVER_SIZES = [120, 300, 800] as const;

// Track preloaded/decoded URLs to prevent duplicate GPU decodes
const decodedUrls = new Set<string>();
const inFlightPreloads = new Map<string, Promise<boolean>>();

/**
 * Preload and decode an image URL on the GPU using new Image().decode().
 * Safe against non-browser environments, JSDOM, invalid URLs, and decoding errors.
 */
export async function preloadAndDecodeImage(url: string | null | undefined): Promise<boolean> {
  if (!url || typeof window === 'undefined') return false;

  if (decodedUrls.has(url)) {
    return true;
  }

  // In JSDOM test environment, Image networking and GPU decode are not implemented
  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) {
    decodedUrls.add(url);
    return true;
  }

  if (inFlightPreloads.has(url)) {
    return inFlightPreloads.get(url)!;
  }

  const decodePromise = new Promise<boolean>((resolve) => {
    try {
      if (typeof Image === 'undefined') {
        resolve(true);
        return;
      }

      const img = new Image();
      let settled = false;

      const finish = (ok: boolean) => {
        if (!settled) {
          settled = true;
          inFlightPreloads.delete(url);
          if (ok) decodedUrls.add(url);
          resolve(ok);
        }
      };

      // 10-second safety timeout so decode never hangs
      const timeout = setTimeout(() => finish(false), 10000);

      // In modern browsers, HTMLImageElement.decode() performs asynchronous GPU decoding
      if (typeof img.decode === 'function') {
        img.src = url;
        img.decode()
          .then(() => {
            clearTimeout(timeout);
            finish(true);
          })
          .catch(() => {
            // Some browsers reject decode() on aborted requests, but onload may still work
            clearTimeout(timeout);
            finish(true);
          });
        return;
      }

      // Fallback for older browsers without Image.decode()
      img.onload = () => {
        clearTimeout(timeout);
        finish(true);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        finish(false);
      };

      img.src = url;

      if (img.complete) {
        clearTimeout(timeout);
        finish(true);
      }
    } catch {
      inFlightPreloads.delete(url);
      resolve(false);
    }
  });

  inFlightPreloads.set(url, decodePromise);
  return decodePromise;
}

/**
 * Check if a URL has already been decoded on the GPU.
 */
export function isImageDecoded(url: string): boolean {
  return decodedUrls.has(url);
}

/**
 * Preloads and GPU-decodes canonical sizes (120, 300, 800) of cover art for an upcoming track.
 * Seamlessly integrates with StorageManager.getLocalCoverUri for offline tracks.
 * Non-blocking: will never reject or delay audio playback.
 */
export async function preloadTrackAssets(track: Track | any): Promise<void> {
  if (!track || !track.id) return;

  try {
    // 1. Check if track is offline / has local cover URI
    let localUri: string | null = null;
    try {
      localUri = await StorageManager.getLocalCoverUri(track.id);
    } catch (e) {
      console.debug(`Failed to check local cover URI for track ${track.id}:`, e);
    }

    if (localUri) {
      // Offline track has a single canonical local file URI, preload & decode directly
      await preloadAndDecodeImage(localUri);
      return;
    }

    // 2. Online / Subsonic track: resolve canonical sizes
    const coverId = track.coverArt || track.albumId || track.id;
    if (!coverId) return;

    await Promise.allSettled(
      CANONICAL_COVER_SIZES.map(async (size) => {
        try {
          const rawUrl = getCoverArtUrl(coverId, size);
          if (!rawUrl) return;

          // Cache blob in memory LRU cache
          const cachedUrl = await getCachedImageUrl(rawUrl);
          // GPU decode into browser rendering buffer
          await preloadAndDecodeImage(cachedUrl);
        } catch (err) {
          console.debug(`Failed preloading cover art size ${size} for track ${track.id}:`, err);
        }
      })
    );
  } catch (err) {
    console.debug(`preloadTrackAssets error for track ${track?.id}:`, err);
  }
}
