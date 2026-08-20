/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { StorageManager } from '../utils/StorageManager';
import { getStreamUrl } from '../api/subsonic';
import { isOffline } from '../utils/networkStatus';

export interface TrackAudioSourceResult {
  src: string;
  isLocal: boolean;
  isAvailable: boolean;
}

export async function resolveTrackAudioSource(track: any): Promise<TrackAudioSourceResult> {
  if (!track || !track.id) {
    return { src: '', isLocal: false, isAvailable: false };
  }

  try {
    const localUri = await StorageManager.getLocalTrackUri(track.id, track.title || track.name, track.albumId);
    if (localUri) {
      return { src: localUri, isLocal: true, isAvailable: true };
    }
  } catch (e) {
    console.error('Error resolving local track uri:', e);
  }

  // If track not downloaded locally:
  if (isOffline()) {
    // Offline and not downloaded: not available to play
    return { src: '', isLocal: false, isAvailable: false };
  }

  // Online: stream from server
  return {
    src: getStreamUrl(track.id),
    isLocal: false,
    isAvailable: true,
  };
}

export function useTrackSource(track: any) {
  const [src, setSrc] = useState<string>('');
  const [trackId, setTrackId] = useState<string>('');
  const [isLocal, setIsLocal] = useState<boolean>(false);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    // oxlint-disable-next-line
    if (!track) {
      setSrc('');
      setTrackId('');
      setIsLocal(false);
      setIsAvailable(false);
      setIsLoading(false);
      return;
    }

    const resolve = async () => {
      setIsLoading(true);
      try {
        const result = await resolveTrackAudioSource(track);
        if (!isMounted) return;

        setSrc(result.src);
        setTrackId(track.id);
        setIsLocal(result.isLocal);
        setIsAvailable(result.isAvailable);
      } catch (err) {
        console.error('Error resolving track source:', err);
        if (isMounted) {
          setSrc(isOffline() ? '' : getStreamUrl(track.id));
          setTrackId(track.id);
          setIsLocal(false);
          setIsAvailable(!isOffline());
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    resolve();

    return () => {
      isMounted = false;
    };
  }, [track?.id, track?.title, track?.albumId]);

  return { src, trackId, isLocal, isLoading, isAvailable };
}
