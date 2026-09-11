import { useState, useEffect, useRef } from 'react';
import { Music } from 'lucide-react';
import { getCachedImageUrl } from '../../utils/imageCache';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { getCoverArtUrl } from '../../api/subsonic';
import { preloadAndDecodeImage } from '../../utils/assetPreloader';

interface TrackImageProps {
  src?: string;
  className?: string;
  alt?: string;
  trackId?: string;
}

export default function TrackImage({ src: rawSrc, className = '', alt = '', trackId }: TrackImageProps) {
  const src = (!rawSrc || typeof rawSrc !== 'string' || rawSrc === 'undefined' || rawSrc === 'null' || !rawSrc.trim()) ? undefined : rawSrc;
  
  // Display buffer states: keep current image rendered while next one loads & decodes
  const [displayedSrc, setDisplayedSrc] = useState<string | undefined>(undefined);
  const [prevSrc, setPrevSrc] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [retries, setRetries] = useState<number>(0);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  
  const downloadItem = useDownloadStore(state => trackId ? state.downloads[trackId] : undefined);

  // Visibility detection with IntersectionObserver and fallback
  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
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
    if (!isVisible) return;

    const requestId = ++activeRequestIdRef.current;
    let isMounted = true;
    setIsLoading(true);

    const resolveAndApplyCover = async () => {
      // 1. Check local cover art URI from download store
      if (downloadItem?.localCoverArtUri) {
        await applySource(downloadItem.localCoverArtUri, requestId);
        return;
      }

      // 2. If neither src nor trackId provided, no cover can be resolved
      if (!src && !trackId) {
        if (isMounted && requestId === activeRequestIdRef.current) {
          setIsLoading(false);
          // Only clear displayedSrc if no image was ever shown, or smoothly transition
          if (!displayedSrc) {
            setDisplayedSrc(undefined);
          }
        }
        return;
      }

      let candidateSrc = src;
      // Convert raw ID or path to Subsonic cover art URL if not already a protocol URL
      if (candidateSrc && 
          !candidateSrc.startsWith('http') && 
          !candidateSrc.startsWith('/') && 
          !candidateSrc.startsWith('blob:') && 
          !candidateSrc.startsWith('data:') && 
          !candidateSrc.startsWith('asset:') && 
          !candidateSrc.startsWith('capacitor:') && 
          !candidateSrc.startsWith('file:') && 
          !candidateSrc.startsWith('_capacitor_')) {
        candidateSrc = getCoverArtUrl(candidateSrc, 300);
      }

      // 3. If candidate is already a local asset or file URI, apply directly
      if (candidateSrc && (
        candidateSrc.startsWith('http://asset.localhost') ||
        candidateSrc.startsWith('asset://') ||
        candidateSrc.startsWith('_capacitor_file_') ||
        candidateSrc.startsWith('capacitor://') ||
        candidateSrc.startsWith('file://') ||
        candidateSrc.startsWith('blob:') ||
        candidateSrc.startsWith('data:')
      )) {
        await applySource(candidateSrc, requestId);
        return;
      }

      // 4. Check offline storage for trackId
      if (trackId && (downloadItem?.status === 'completed' || downloadItem?.localCoverArtUri)) {
        try {
          const localCover = await StorageManager.getLocalCoverUri(trackId);
          if (localCover && isMounted && requestId === activeRequestIdRef.current) {
            await applySource(localCover, requestId);
            return;
          }
        } catch {}
      }

      // 5. Fall back to trackId if candidateSrc not resolved yet
      if (!candidateSrc && trackId) {
        candidateSrc = getCoverArtUrl(trackId, 300);
      }

      if (!candidateSrc) {
        if (isMounted && requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
        return;
      }

      // 6. Append retry param if retrying
      const urlToFetch = retries > 0 
        ? `${candidateSrc}${candidateSrc.includes('?') ? '&' : '?'}retry=${retries}`
        : candidateSrc;

      try {
        const cachedUrl = await getCachedImageUrl(urlToFetch);
        if (isMounted && requestId === activeRequestIdRef.current) {
          await applySource(cachedUrl, requestId);
        }
      } catch {
        if (isMounted && requestId === activeRequestIdRef.current) {
          await applySource(urlToFetch, requestId);
        }
      }
    };

    const applySource = async (finalUrl: string, reqId: number) => {
      // GPU decode the image before swapping to eliminate any white/black frames
      await preloadAndDecodeImage(finalUrl);

      if (!isMounted || reqId !== activeRequestIdRef.current) return;

      setDisplayedSrc((prev) => {
        if (prev === finalUrl) {
          setIsLoading(false);
          return prev;
        }

        // Buffer the previous image to crossfade smoothly
        if (prev) {
          setPrevSrc(prev);
          if (transitionTimerRef.current) {
            clearTimeout(transitionTimerRef.current);
          }
          transitionTimerRef.current = setTimeout(() => {
            setPrevSrc(undefined);
          }, 350);
        }

        setIsLoading(false);
        setError(false);
        return finalUrl;
      });
    };

    resolveAndApplyCover();

    return () => {
      isMounted = false;
    };
  }, [src, trackId, retries, downloadItem?.localCoverArtUri, isVisible]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => {
        setRetries(r => r + 1);
      }, 1000 * Math.pow(2, retries));
    } else {
      setError(true);
    }
  };

  // NEVER show <Music /> icon during track transitions if a cover is currently displayed or loading
  const shouldShowPlaceholder = !displayedSrc && !prevSrc && (error || (!isLoading && isVisible));

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {/* Display buffer: previous image sits underneath during crossfade */}
      {prevSrc && (
        <img 
          src={prevSrc} 
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" 
          alt="" 
          aria-hidden="true"
        />
      )}

      {/* Current displayed image: fades in smoothly on top */}
      {displayedSrc && (
        <img 
          key={displayedSrc}
          src={displayedSrc} 
          className="w-full h-full object-cover relative z-10 animate-in fade-in duration-300 ease-in-out" 
          alt={alt} 
          onError={handleError}
          loading="lazy"
          decoding="async"
        />
      )}

      {/* Fallback placeholder: only when absolutely no image is available or loading */}
      {shouldShowPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/10 z-20">
          <Music className="w-1/2 h-1/2 text-[#808080]" />
        </div>
      )}
    </div>
  );
}
