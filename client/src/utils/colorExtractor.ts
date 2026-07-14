const COLOR_CACHE_KEY = 'streamnavi_color_cache';

const getCache = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(COLOR_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const setCache = (key: string, color: string) => {
  try {
    const cache = getCache();
    cache[key] = color;
    localStorage.setItem(COLOR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
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

export async function extractDominantColor(imageUrl: string): Promise<string> {
  // Extract the ID from the URL to use as a stable cache key (since auth params change)
  let cacheKey = imageUrl;
  try {
    const urlObj = new URL(imageUrl, window.location.origin);
    const id = urlObj.searchParams.get('id');
    if (id) cacheKey = id;
  } catch {
    // ignore parsing errors
  }

  const cache = getCache();
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Important for CORS
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('#1db954'); // Fallback to primary color
        return;
      }

      // We only need a tiny image to get the average/dominant color
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
      
      // Force dark mode aesthetic: limit maximum lightness to 25%
      l = Math.min(l, 0.25);
      
      // If it's completely black or very gray, add a slight tint
      if (l < 0.05) l = 0.05;

      const color = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
      setCache(cacheKey, color);
      resolve(color);
    };

    img.onerror = () => {
      resolve('#1db954'); // Fallback to primary color
    };
  });
}
