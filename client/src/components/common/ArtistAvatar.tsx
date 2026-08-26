import { useEffect, useState, useRef } from 'react';
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

export default function ArtistAvatar({ artistName, artistId, className = "w-6 h-6 rounded-full overflow-hidden bg-foreground/10 flex-shrink-0 flex items-center justify-center", fallbackSize = 12 }: ArtistAvatarProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!isVisible) return;

    const loadAvatar = async () => {
      setLoading(true);
      
      // 1. First try external APIs (Yandex/LastFM) via backend if enabled
      let url = null;
      try {
        const { getExternalArtistStats } = await import('../../api/externalApi');
        const stats = await getExternalArtistStats(artistName);
        if (stats && stats.data && stats.data.image) {
          url = stats.data.image;
        }
      } catch (e) {
        console.error("Failed to get external artist stats for image", e);
      }

      // 2. If no external image, fallback to 3rd party API flow (Apple -> Deezer)
      if (!url) {
        url = await fetchArtistImage(artistName);
      }

      // 3. If no image found, fallback to Navidrome getArtistInfo
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
      
      // 4. If still no image, fallback to Navidrome album cover art
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
  }, [artistName, artistId, isVisible]);

  return (
    <div ref={containerRef} className={className}>
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
