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
      
      // Try to fetch from Deezer
      const deezerUrl = await fetchArtistImage(artistName);
      
      if (isMounted) {
        if (deezerUrl) {
          setImageUrl(deezerUrl);
        } else if (artistId) {
          // Fallback to Navidrome cover if Deezer fails
          setImageUrl(getCoverArtUrl(artistId, 100));
        } else {
          setImageUrl(null);
        }
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
