import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchArtistImage } from '../../utils/artistImage';
import { getCoverArtUrl, getArtistInfo } from '../../api/subsonic';
import { getCachedImageUrl } from '../../utils/imageCache';

interface ArtistAvatarProps {
  artistName: string;
  artistId?: string;
  className?: string;
  fallbackSize?: number;
}

export default function ArtistAvatar({ artistName, artistId, className = "w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center", fallbackSize = 12 }: ArtistAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAvatar = async () => {
      setLoading(true);
      
      // 1. First try our 3rd party API flow (Apple -> Deezer)
      let url = await fetchArtistImage(artistName);

      // 2. If no image found, fallback to Navidrome getArtistInfo (Last.fm)
      if (!url && artistId) {
        try {
          const info = await getArtistInfo(artistId);
          if (info && info.largeImageUrl) {
            url = info.largeImageUrl;
          } else if (info && info.mediumImageUrl) {
            url = info.mediumImageUrl;
          }
        } catch (e) {
          console.error("Failed to fetch artist info from Navidrome", e);
        }
      }
      
      // 3. If still no image, fallback to Navidrome album cover art
      if (!url && artistId) {
        url = getCoverArtUrl(artistId, 300);
      }

      if (isMounted) {
        if (url) {
          try {
            const cachedUrl = await getCachedImageUrl(url);
            if (isMounted) setImageUrl(cachedUrl);
          } catch {
            if (isMounted) setImageUrl(url);
          }
        } else {
          setImageUrl(null);
        }
        if (isMounted) setLoading(false);
      }
    };

    loadAvatar();

    return () => {
      isMounted = false;
    };
  }, [artistName, artistId]);

  return (
    <div className={className}>
      {imageUrl && !loading ? (
        <img src={imageUrl} loading="lazy" alt={artistName} className="w-full h-full object-cover" onError={(e) => {
          // If the loaded image fails (e.g. broken Last.fm link from Navidrome), fallback to icon
          (e.target as HTMLImageElement).style.display = 'none';
        }} />
      ) : (
        <Users size={fallbackSize} className="text-secondary" />
      )}
    </div>
  );
}
