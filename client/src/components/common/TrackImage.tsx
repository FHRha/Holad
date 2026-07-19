import { useState, useEffect } from 'react';
import { Music, Download } from 'lucide-react';
import { getCachedImageUrl } from '../../utils/imageCache';
import { useDownloadStore } from '../../store/downloadStore';

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
  const isDownloaded = useDownloadStore(state => trackId ? !!state.downloads[trackId] && state.downloads[trackId].status === 'completed' : false);

  useEffect(() => {
    if (!src) {
      setFinalSrc(undefined);
      return;
    }
    
    // If we're retrying, append a timestamp to the original URL before caching
    const urlToFetch = retries > 0 
      ? `${src}${src.includes('?') ? '&' : '?'}retry=${retries}`
      : src;
      
    let isMounted = true;
    
    getCachedImageUrl(urlToFetch).then(cachedUrl => {
      if (isMounted) {
        setFinalSrc(cachedUrl);
      }
    }).catch(() => {
      if (isMounted) {
        setFinalSrc(urlToFetch);
      }
    });
    
    return () => {
      isMounted = false;
    };
  }, [src, retries]);

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
