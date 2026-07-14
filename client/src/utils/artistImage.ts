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
    'lida': null, // Force fallback to Navidrome cover art for Lida because Deezer's is wrong
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
  
  return new Promise((resolve) => {
    const callbackName = 'deezer_cb_' + Math.round(100000 * Math.random());
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.body.removeChild(script);
      
      let url: string | null = null;
      if (data && data.data && data.data.length > 0) {
        // Find exact matches (case-insensitive) against the search query
        const exactMatches = data.data.filter((a: any) => a.name.toLowerCase() === searchQuery.toLowerCase());
        
        let bestArtist = data.data[0];
        if (exactMatches.length > 0) {
          // Of the exact matches, pick the one with most fans
          bestArtist = exactMatches.reduce((prev: any, current: any) => {
            return (prev.nb_fan || 0) > (current.nb_fan || 0) ? prev : current;
          });
        } else {
          // If no exact match, pick the most popular from the top 5 results
          bestArtist = data.data.slice(0, 5).reduce((prev: any, current: any) => {
            return (prev.nb_fan || 0) > (current.nb_fan || 0) ? prev : current;
          });
        }
        url = bestArtist.picture_xl || bestArtist.picture_big || bestArtist.picture_medium || null;
      }
      
      if (url) {
        localStorage.setItem(cacheKey, JSON.stringify({ url, timestamp: Date.now() }));
        resolve(url);
      } else {
        // Final fallback to iTunes API if Deezer doesn't find anything
        const fetchFromITunes = async () => {
          try {
            const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
              const itunesUrl = data.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
              localStorage.setItem(cacheKey, JSON.stringify({ url: itunesUrl, timestamp: Date.now() }));
              resolve(itunesUrl);
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        };
        fetchFromITunes();
      }
    };

    const script = document.createElement('script');
    script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(searchQuery)}&output=jsonp&callback=${callbackName}`;
    script.onerror = () => {
      delete (window as any)[callbackName];
      document.body.removeChild(script);
      
      // If Deezer script fails (e.g., adblocker), fallback to iTunes
      const fetchFromITunes = async () => {
        try {
          const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=1`);
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const itunesUrl = data.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
            localStorage.setItem(cacheKey, JSON.stringify({ url: itunesUrl, timestamp: Date.now() }));
            resolve(itunesUrl);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      };
      fetchFromITunes();
    };
    document.body.appendChild(script);
  });
}
