import { useState, useEffect } from 'react';
import { Music, Download } from 'lucide-react';
import { getCachedImageUrl } from '../../utils/imageCache';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';

interface TrackImageProps {
  src?: string;
  className?: string;
  alt?: string;
  trackId?: string;
}

export default function TrackImage({ src, className, alt = '', trackId }: TrackImageProps) {
  const [error, setError] = useState(false);
  const [retries, setRetries] = useState(0);
  const [finalSrc, setFinalSrc] = useState<string | undefined>(undefined);
  
  const downloadItem = useDownloadStore(state => trackId ? state.downloads[trackId] : undefined);
  const isDownloaded = downloadItem?.status === 'completed';

  useEffect(() => {
    let isMounted = true;

    // Check local cover art URI from download store first
    if (downloadItem?.localCoverArtUri) {
      setFinalSrc(downloadItem.localCoverArtUri);
      return;
    }

    if (!src && !trackId) {
      setFinalSrc(undefined);
      return;
    }

    const checkLocalAndFetch = async () => {
      // If src is already a local asset or file URI, use directly
      if (src && (
        src.startsWith('http://asset.localhost') ||
        src.startsWith('asset://') ||
        src.startsWith('_capacitor_file_') ||
        src.startsWith('capacitor://') ||
        src.startsWith('file://') ||
        src.startsWith('blob:') ||
        src.startsWith('data:')
      )) {
        if (isMounted) setFinalSrc(src);
        return;
      }

      if (trackId) {
        try {
          const localCover = await StorageManager.getLocalCoverUri(trackId);
          if (localCover && isMounted) {
            setFinalSrc(localCover);
            return;
          }
        } catch {}
      }

      if (!src) {
        if (isMounted) setFinalSrc(undefined);
        return;
      }

      // If we're retrying, append a timestamp to the original URL before caching
      const urlToFetch = retries > 0 
        ? `${src}${src.includes('?') ? '&' : '?'}retry=${retries}`
        : src;
        
      try {
        const cachedUrl = await getCachedImageUrl(urlToFetch);
        if (isMounted) {
          setFinalSrc(cachedUrl);
        }
      } catch {
        if (isMounted) {
          setFinalSrc(urlToFetch);
        }
      }
    };

    checkLocalAndFetch();
    
    return () => {
      isMounted = false;
    };
  }, [src, trackId, retries, downloadItem?.localCoverArtUri]);

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => {
        setRetries(r => r + 1);
      }, 1000);
    } else {
      setError(true);
    }
  };

  if (error || !finalSrc) {
    return (
      <div className={`flex items-center justify-center bg-white/10 ${className}`}>
        <Music className="w-1/2 h-1/2 text-white/30" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img 
        src={finalSrc} 
        className="w-full h-full object-cover" 
        alt={alt} 
        onError={handleError}
        loading="lazy"
      />
      {isDownloaded && (
        <div className="absolute top-1 left-1 z-10 w-4 h-4 sm:w-5 sm:h-5 bg-primary rounded-full flex items-center justify-center shadow-md">
          <Download size={10} className="text-black" />
        </div>
      )}
    </div>
  );
}
