import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { fetchRandomTracks, getCoverArtUrl } from '../api/subsonic';
import { isOffline } from '../utils/networkStatus';
import { getOfflineTracks } from '../store/downloadStore';

export function useAutoDj() {
  const { queue, currentIndex, isAutoDjEnabled, addToQueue, excludedTrackIds, excludedAlbumIds } = usePlayerStore();

  useEffect(() => {
    const checkAutoDj = async () => {
      if (isAutoDjEnabled && queue.length > 0 && currentIndex >= queue.length - 2) {
        try {
          if (isOffline()) {
            const offline = getOfflineTracks();
            if (offline.length === 0) return;
            const shuffled = [...offline].sort(() => Math.random() - 0.5).slice(0, 10);
            addToQueue(shuffled);
            return;
          }

          const validTracks: any[] = [];
          let retries = 0;
          const maxRetries = 5;
          
          while (validTracks.length < 10 && retries < maxRetries) {
            const needed = 10 - validTracks.length;
            const newTracks = await fetchRandomTracks(needed);
            if (!newTracks || newTracks.length === 0) break;
            
            const filtered = newTracks.filter((t: any) => !excludedTrackIds.includes(t.id) && !excludedAlbumIds.includes(t.albumId));
            
            // ensure no duplicates in validTracks
            for (const t of filtered) {
              if (!validTracks.find(v => v.id === t.id)) {
                validTracks.push(t);
              }
            }
            retries++;
          }

          const mapped = validTracks.slice(0, 10).map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            artistId: t.artistId,
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
