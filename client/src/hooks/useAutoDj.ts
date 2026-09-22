import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { fetchRandomTracks, getCoverArtUrl } from '../api/subsonic';
import { isOffline } from '../utils/networkStatus';
import { getOfflineTracks } from '../store/downloadStore';
import { isTrackExcluded } from '../utils/trackFingerprint';

export function useAutoDj() {
  const {
    queue,
    currentIndex,
    isAutoDjEnabled,
    addToQueue,
    excludedTrackIds,
    excludedAlbumIds,
    excludedFingerprints,
  } = usePlayerStore();

  const isFetchingRef = useRef(false);

  useEffect(() => {
    const checkAutoDj = async () => {
      if (!isAutoDjEnabled || queue.length === 0 || currentIndex < queue.length - 2) {
        return;
      }

      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      try {
        const currentQueue = usePlayerStore.getState().queue;
        const queueTrackIds = new Set(currentQueue.map((q) => q.id));

        if (isOffline()) {
          const offline = getOfflineTracks();
          if (offline.length === 0) return;

          const eligibleOffline = offline.filter((t: any) => {
            const dur = typeof t.duration === 'number' ? t.duration : 0;
            return (
              dur >= 10 &&
              !queueTrackIds.has(t.id) &&
              !isTrackExcluded(t, excludedTrackIds, excludedAlbumIds, excludedFingerprints)
            );
          });

          if (eligibleOffline.length === 0) return;
          const shuffled = [...eligibleOffline].sort(() => Math.random() - 0.5).slice(0, 10);
          addToQueue(shuffled);
          return;
        }

        const validTracks: any[] = [];
        let retries = 0;
        const maxRetries = 5;

        while (validTracks.length < 10 && retries < maxRetries) {
          const needed = 10 - validTracks.length;
          const newTracks = await fetchRandomTracks(Math.max(needed, 20));
          if (!newTracks || newTracks.length === 0) break;

          for (const t of newTracks) {
            const dur = typeof t.duration === 'number' ? t.duration : 0;
            if (
              dur >= 10 &&
              !queueTrackIds.has(t.id) &&
              !validTracks.some((v) => v.id === t.id) &&
              !isTrackExcluded(t, excludedTrackIds, excludedAlbumIds, excludedFingerprints)
            ) {
              validTracks.push(t);
              if (validTracks.length >= 10) break;
            }
          }
          retries++;
        }

        if (validTracks.length === 0) return;

        const mapped = validTracks.slice(0, 10).map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          artistId: t.artistId,
          coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
          duration: t.duration,
          bitRate: t.bitRate,
          suffix: t.suffix,
        }));
        addToQueue(mapped);
      } catch (error) {
        console.error('Auto DJ failed to fetch tracks:', error);
      } finally {
        isFetchingRef.current = false;
      }
    };
    checkAutoDj();
  }, [currentIndex, isAutoDjEnabled, queue.length, addToQueue, excludedTrackIds, excludedAlbumIds, excludedFingerprints]);
}

