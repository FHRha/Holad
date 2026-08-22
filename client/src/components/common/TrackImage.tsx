import { useState, useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
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
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const downloadItem = useDownloadStore(state => trackId ? state.downloads[trackId] : undefined);

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
  }, [src, trackId, retries, downloadItem?.localCoverArtUri, isVisible]);

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => {
        setRetries(r => r + 1);
      }, 1000 * Math.pow(2, retries));
    } else {
      setError(true);
    }
  };

  if (error || (!finalSrc && isVisible)) {
    return (
      <div ref={containerRef} className={`flex items-center justify-center bg-white/10 ${className}`}>
        <Music className="w-1/2 h-1/2 text-[#808080]" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {finalSrc && (
        <img 
          src={finalSrc} 
          className="w-full h-full object-cover" 
          alt={alt} 
          onError={handleError}
          loading="lazy"
        />
      )}
    </div>
  );
}
