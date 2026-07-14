import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { fetchRandomTracks, getCoverArtUrl } from '../api/subsonic';

export function useAutoDj() {
  const { queue, currentIndex, isAutoDjEnabled, addToQueue } = usePlayerStore();

  useEffect(() => {
    const checkAutoDj = async () => {
      if (isAutoDjEnabled && queue.length > 0 && currentIndex >= queue.length - 2) {
        try {
          const newTracks = await fetchRandomTracks(10);
          const mapped = newTracks.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
            duration: t.duration
          }));
          addToQueue(mapped);
        } catch (error) {
          console.error("Auto DJ failed to fetch tracks:", error);
        }
      }
    };
    checkAutoDj();
  }, [currentIndex, isAutoDjEnabled, queue.length, addToQueue]);
}
