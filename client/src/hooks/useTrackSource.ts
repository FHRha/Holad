import { useState, useEffect } from 'react';
import { StorageManager } from '../utils/StorageManager';
import { getStreamUrl } from '../api/subsonic';

export function useTrackSource(track: any) {
  const [src, setSrc] = useState<string>('');
  const [isLocal, setIsLocal] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    if (!track) {
      setSrc('');
      setIsLocal(false);
      setIsLoading(false);
      return;
    }

    const resolveSource = async () => {
      setIsLoading(true);
      try {
        const localUri = await StorageManager.getLocalTrackUri(track.id, track.title, track.albumId);
        
        if (!isMounted) return;

        if (localUri) {
          setSrc(localUri);
          setIsLocal(true);
        } else {
          setSrc(getStreamUrl(track.id));
          setIsLocal(false);
        }
      } catch (err) {
        console.error('Error resolving track source:', err);
        if (isMounted) {
          // Fallback to stream url on error
          setSrc(getStreamUrl(track.id));
          setIsLocal(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    resolveSource();

    return () => {
      isMounted = false;
    };
  }, [track?.id, track?.title, track?.albumId]);

  return { src, isLocal, isLoading };
}
