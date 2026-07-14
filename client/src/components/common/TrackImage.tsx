import { useState } from 'react';
import { Music } from 'lucide-react';

interface TrackImageProps {
  src?: string;
  className?: string;
  alt?: string;
}

export default function TrackImage({ src, className, alt = '' }: TrackImageProps) {
  const [error, setError] = useState(false);
  const [retries, setRetries] = useState(0);

  const handleError = () => {
    if (retries < 3) {
      setTimeout(() => {
        setRetries(r => r + 1);
      }, 1000);
    } else {
      setError(true);
    }
  };

  // If we're retrying, append a timestamp to the URL to bypass browser cache
  const currentSrc = src && retries > 0 
    ? `${src}${src.includes('?') ? '&' : '?'}retry=${retries}`
    : src;

  if (error || !currentSrc) {
    return (
      <div className={`flex items-center justify-center bg-white/10 ${className}`}>
        <Music className="w-1/2 h-1/2 text-white/30" />
      </div>
    );
  }

  return (
    <img 
      src={currentSrc} 
      className={className} 
      alt={alt} 
      onError={handleError}
      loading="lazy"
    />
  );
}
