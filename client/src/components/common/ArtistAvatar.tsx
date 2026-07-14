import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { fetchArtistImage } from '../../utils/artistImage';
import { getCoverArtUrl } from '../../api/subsonic';

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
          // Dynamic import handled by normal import now, but we'll use normal import
          const info = await import('../../api/subsonic').then(m => m.getArtistInfo(artistId));
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
        setImageUrl(url || null);
        setLoading(false);
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
        <img src={imageUrl} loading="lazy" alt={artistName} className="w-full h-full object-cover" />
      ) : (
        <Users size={fallbackSize} className="text-secondary" />
      )}
    </div>
  );
}
