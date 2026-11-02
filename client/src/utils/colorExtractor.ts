const COLOR_CACHE_KEY = 'holad_color_cache';

// In-memory cache for instant O(1) synchronous lookups without disk/localStorage overhead
const memoryCache = new Map<string, string>();
let isCacheLoaded = false;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const initCache = () => {
  if (isCacheLoaded || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(COLOR_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.entries(parsed).forEach(([k, v]) => {
        if (typeof v === 'string') memoryCache.set(k, v);
      });
    }
  } catch {}
  isCacheLoaded = true;
};

const persistCache = () => {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    try {
      const obj: Record<string, string> = {};
      memoryCache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(COLOR_CACHE_KEY, JSON.stringify(obj));
    } catch {}
  }, 1000);
};

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

// Concurrency limiter to prevent GPU pipeline stalls during page navigation
let activeExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const extractionQueue: Array<() => void> = [];

const processQueue = () => {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS || extractionQueue.length === 0) return;
  activeExtractions++;
  const next = extractionQueue.shift();
  if (next) next();
};

export async function extractDominantColor(imageUrl: string): Promise<string> {
  initCache();

  let cacheKey = imageUrl;
  try {
    const urlObj = new URL(imageUrl, window.location.origin);
    const id = urlObj.searchParams.get('id');
    if (id) cacheKey = id;
  } catch {}

  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  return new Promise((resolve) => {
    const task = () => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = imageUrl;

      const finish = (color: string) => {
        memoryCache.set(cacheKey, color);
        persistCache();
        activeExtractions--;
        processQueue();
        resolve(color);
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish('#1db954');
            return;
          }

          canvas.width = 10;
          canvas.height = 10;
          ctx.drawImage(img, 0, 0, 10, 10);
          const imageData = ctx.getImageData(0, 0, 10, 10).data;

          let r = 0, g = 0, b = 0;
          const count = imageData.length / 4;
          for (let i = 0; i < imageData.length; i += 4) {
            r += imageData[i];
            g += imageData[i + 1];
            b += imageData[i + 2];
          }

          r = Math.floor(r / count);
          g = Math.floor(g / count);
          b = Math.floor(b / count);

          let [h, s, l] = rgbToHsl(r, g, b);
          l = Math.min(l, 0.25);
          if (l < 0.05) l = 0.05;

          const color = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
          finish(color);
        } catch {
          finish('#1db954');
        }
      };

      img.onerror = () => {
        finish('#1db954');
      };
    };

    extractionQueue.push(task);
    processQueue();
  });
}
