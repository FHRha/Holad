// In-memory cache for pre-baked blurred cover data URLs
const bakedCoverCache = new Map<string, string>();
const inFlightBakes = new Map<string, Promise<string>>();

const MAX_CACHE_SIZE = 50;

/**
 * Returns a synchronously available pre-baked blurred data URL if already cached.
 */
export function getCachedBakedBlurredCover(imageUrl: string | undefined | null): string | undefined {
  if (!imageUrl) return undefined;
  return bakedCoverCache.get(imageUrl);
}

/**
 * Pre-bakes a smooth, abstract blurred version of an image URL.
 * Renders downscaled to a 48x48 canvas and exports as a lightweight JPEG data URL.
 * When scaled to fullscreen via GPU bilinear filtering, it delivers silky 60-120 FPS
 * background transitions without expensive CSS blur() rasterization filters.
 */
export async function getBakedBlurredCover(imageUrl: string | undefined | null): Promise<string> {
  if (!imageUrl || typeof window === 'undefined') return '';

  if (bakedCoverCache.has(imageUrl)) {
    return bakedCoverCache.get(imageUrl)!;
  }

  if (inFlightBakes.has(imageUrl)) {
    return inFlightBakes.get(imageUrl)!;
  }

  const bakePromise = new Promise<string>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // 48x48 provides ideal color field abstraction when upscaled by GPU texture samplers
          canvas.width = 48;
          canvas.height = 48;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(imageUrl);
            return;
          }

          // Subtle filter on 48px canvas if supported
          if ('filter' in ctx) {
            ctx.filter = 'blur(2px)';
          }
          ctx.drawImage(img, 0, 0, 48, 48);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          if (bakedCoverCache.size >= MAX_CACHE_SIZE) {
            const firstKey = bakedCoverCache.keys().next().value;
            if (firstKey) bakedCoverCache.delete(firstKey);
          }
          bakedCoverCache.set(imageUrl, dataUrl);
          inFlightBakes.delete(imageUrl);
          resolve(dataUrl);
        } catch {
          inFlightBakes.delete(imageUrl);
          resolve(imageUrl);
        }
      };

      img.onerror = () => {
        inFlightBakes.delete(imageUrl);
        resolve(imageUrl);
      };

      img.src = imageUrl;
    } catch {
      inFlightBakes.delete(imageUrl);
      resolve(imageUrl);
    }
  });

  inFlightBakes.set(imageUrl, bakePromise);
  return bakePromise;
}
