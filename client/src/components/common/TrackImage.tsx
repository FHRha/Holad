import { useState, useEffect } from 'react';
import { Music } from 'lucide-react';
import { getCachedImageUrl } from '../../utils/imageCache';

interface TrackImageProps {
  src?: string;
  className?: string;
  alt?: string;
}

export default function TrackImage({ src, className, alt = '' }: TrackImageProps) {
  const [error, setError] = useState(false);
  const [retries, setRetries] = useState(0);
  const [finalSrc, setFinalSrc] = useState<string | undefined>(undefined);

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
    <img 
      src={finalSrc} 
      className={className} 
      alt={alt} 
      onError={handleError}
      loading="lazy"
    />
  );
}
