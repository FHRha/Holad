import { fetchWithRetry } from '../api/subsonic-core';

const imageCache = new Map<string, string>();
const fetchingCache = new Map<string, Promise<string>>();

export async function getCachedImageUrl(originalUrl: string): Promise<string> {
  if (!originalUrl) return originalUrl;
  
  if (originalUrl.startsWith('data:') || originalUrl.startsWith('blob:')) {
    return originalUrl;
  }

  if (imageCache.has(originalUrl)) {
    return imageCache.get(originalUrl)!;
  }

  if (fetchingCache.has(originalUrl)) {
    return fetchingCache.get(originalUrl)!;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetchWithRetry(originalUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      imageCache.set(originalUrl, objectUrl);
      fetchingCache.delete(originalUrl);
      return objectUrl;
    } catch (error) {
      console.error('Failed to fetch and cache image:', error);
      fetchingCache.delete(originalUrl);
      return originalUrl; // Fallback to original URL if fetch fails
    }
  })();

  fetchingCache.set(originalUrl, fetchPromise);
  return fetchPromise;
}
