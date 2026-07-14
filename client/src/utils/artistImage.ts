const CACHE_PREFIX = 'artist_img_v2_';
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface CachedImage {
  url: string | null;
  timestamp: number;
}

export async function fetchArtistImage(artistName: string): Promise<string | null> {
  if (!artistName) return null;
  
  const normalizedName = artistName.toLowerCase().trim();
  
  // Hardcoded overrides for problematic artists
  const ARTIST_ALIASES: Record<string, string> = {
    'пятерка': '5opka',
    '5opka': '5opka',
  };

  const CUSTOM_IMAGES: Record<string, string | null> = {
    'lida': 'https://cdn-images.dzcdn.net/images/artist/d8071219c78cabf7cc055b22c01ed944/1000x1000-000000-80-0-0.jpg',
  };

  if (normalizedName in CUSTOM_IMAGES) {
    return CUSTOM_IMAGES[normalizedName];
  }

  const searchQuery = ARTIST_ALIASES[normalizedName] || artistName;
  
  const cacheKey = `${CACHE_PREFIX}${searchQuery.toLowerCase()}`;
  const cachedStr = localStorage.getItem(cacheKey);
  
  if (cachedStr) {
    try {
      const cached: CachedImage = JSON.parse(cachedStr);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.url;
      }
    } catch (e) {
      // Ignore parse errors, just refetch
    }
  }

  const fetchDeezer = async (retries = 2): Promise<string | null> => {
    return new Promise((resolve) => {
      const callbackName = 'deezer_cb_' + Math.round(100000 * Math.random());
      const script = document.createElement('script');
      
      let timeoutId = setTimeout(() => {
        cleanup();
        if (retries > 0) resolve(fetchDeezer(retries - 1));
        else resolve(null);
      }, 5000); // 5s timeout for JSONP

      const cleanup = () => {
        clearTimeout(timeoutId);
        delete (window as any)[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      (window as any)[callbackName] = (data: any) => {
        cleanup();
        let url: string | null = null;
        if (data && data.data && data.data.length > 0) {
          const exactMatches = data.data.filter((a: any) => a.name.toLowerCase() === searchQuery.toLowerCase());
          let bestArtist = data.data[0];
          if (exactMatches.length > 0) {
            bestArtist = exactMatches.reduce((prev: any, current: any) => (prev.nb_fan || 0) > (current.nb_fan || 0) ? prev : current);
          } else {
            bestArtist = data.data.slice(0, 5).reduce((prev: any, current: any) => (prev.nb_fan || 0) > (current.nb_fan || 0) ? prev : current);
          }
          url = bestArtist.picture_xl || bestArtist.picture_big || bestArtist.picture_medium || null;
        }
        resolve(url);
      };

      script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(searchQuery)}&output=jsonp&callback=${callbackName}`;
      script.onerror = () => {
        cleanup();
        if (retries > 0) resolve(fetchDeezer(retries - 1));
        else resolve(null);
      };
      document.body.appendChild(script);
    });
  };

  const fetchApple = async (retries = 2): Promise<string | null> => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`);
      if (!res.ok) throw new Error('Apple API error');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
      }
      return null;
    } catch (e) {
      if (retries > 0) return fetchApple(retries - 1);
      return null;
    }
  };

  let url = await fetchDeezer();
  if (!url) {
    url = await fetchApple();
  }

  if (url) {
    localStorage.setItem(cacheKey, JSON.stringify({ url, timestamp: Date.now() }));
  }
  return url;
}
