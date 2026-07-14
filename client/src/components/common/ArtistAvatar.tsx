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
      
      if (artistId) {
        try {
          const info = await import('../../api/subsonic').then(m => m.getArtistInfo(artistId));
          if (info && info.largeImageUrl) {
            if (isMounted) {
              setImageUrl(info.largeImageUrl);
              setLoading(false);
            }
            return;
          }
        } catch (e) {
          console.error(e);
        }
      }

      // If Navidrome has no specific image URL in info, try its cover art first
      // Actually, Navidrome getCoverArt for artist ID uses the same image.
      // But let's try Deezer as a fallback if getArtistInfo doesn't have it
      const deezerUrl = await fetchArtistImage(artistName);
      
      if (isMounted) {
        if (deezerUrl) {
          setImageUrl(deezerUrl);
        } else if (artistId) {
          // Fallback to Navidrome cover if Deezer fails
          setImageUrl(getCoverArtUrl(artistId, 300));
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
