import { useState, useEffect } from 'react';
import { getSimilarSongs, getCoverArtUrl } from '../api/subsonic';
import type { Track } from '../store/playerStore';

export function useSimilarTracks(trackId: string | undefined) {
  const [similarTracks, setSimilarTracks] = useState<Track[]>([]);

  useEffect(() => {
    if (trackId) {
      getSimilarSongs(trackId).then(songs => {
        const mapped = songs.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
          duration: t.duration
        }));
        setSimilarTracks(mapped);
      });
    } else {
      setSimilarTracks([]);
    }
  }, [trackId]);

  return { similarTracks };
}
