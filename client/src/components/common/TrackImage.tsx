import { useState, useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
import { getCachedImageUrl } from '../../utils/imageCache';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { getCoverArtUrl } from '../../api/subsonic';

interface TrackImageProps {
  src?: string;
  className?: string;
  alt?: string;
  trackId?: string;
}

export default function TrackImage({ src: rawSrc, className, alt = '', trackId }: TrackImageProps) {
  const src = (!rawSrc || typeof rawSrc !== 'string' || rawSrc === 'undefined' || rawSrc === 'null' || !rawSrc.trim()) ? undefined : rawSrc;
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
      let resolvedSrc = src;
      if (resolvedSrc && !resolvedSrc.startsWith('http') && !resolvedSrc.startsWith('/') && !resolvedSrc.startsWith('blob:') && !resolvedSrc.startsWith('data:') && !resolvedSrc.startsWith('asset:') && !resolvedSrc.startsWith('capacitor:') && !resolvedSrc.startsWith('file:') && !resolvedSrc.startsWith('_capacitor_')) {
        resolvedSrc = getCoverArtUrl(resolvedSrc, 300);
      }

      // If src is already a local asset or file URI, use directly
      if (resolvedSrc && (
        resolvedSrc.startsWith('http://asset.localhost') ||
        resolvedSrc.startsWith('asset://') ||
        resolvedSrc.startsWith('_capacitor_file_') ||
        resolvedSrc.startsWith('capacitor://') ||
        resolvedSrc.startsWith('file://') ||
        resolvedSrc.startsWith('blob:') ||
        resolvedSrc.startsWith('data:')
      )) {
        if (isMounted) setFinalSrc(resolvedSrc);
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

      if (!resolvedSrc && trackId) {
        resolvedSrc = getCoverArtUrl(trackId, 300);
      }

      if (!resolvedSrc) {
        if (isMounted) setFinalSrc(undefined);
        return;
      }

      // If we're retrying, append a timestamp to the original URL before caching
      const urlToFetch = retries > 0 
        ? `${resolvedSrc}${resolvedSrc.includes('?') ? '&' : '?'}retry=${retries}`
        : resolvedSrc;
        
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
      <div ref={containerRef} className={`flex items-center justify-center bg-foreground/10 ${className}`}>
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
          decoding="async"
        />
      )}
    </div>
  );
}
