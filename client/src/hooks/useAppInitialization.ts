import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { fetchStarred, getPlayQueue, getCoverArtUrl } from '../api/subsonic';
import { jamSocket } from '../api/socket';
import type { Track } from '../types';

export function useAppInitialization() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const albumId = searchParams.get('album');
  
  const setLikedItems = usePlayerStore(state => state.setLikedItems);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isJamRoute = location.pathname.startsWith('/jam');
  const queueFetched = useRef(false);

  useEffect(() => {
    // Only connect if authenticated OR if we are on a jam route
    if (!isAuthenticated && !isJamRoute) return;
    
    jamSocket.connect();
    
    // Connection logic is now handled in JamLayout if needed
    // We only connect for global listeners if needed, but jam routing handles the join.

    if (isAuthenticated) {
      fetchStarred().then(data => {
        const trackIds = data.song?.map((t: any) => t.id) || [];
        const albumIds = data.album?.map((a: any) => a.id) || [];
        setLikedItems(trackIds, albumIds);
      }).catch(e => console.error("Failed to fetch starred items", e));
    }

    const isStandaloneJam = isJamRoute && (!!trackId || !!albumId);

    if (!isStandaloneJam && !roomToJoin && !queueFetched.current) {
      queueFetched.current = true;
      getPlayQueue().then(queueData => {
        if (queueData && queueData.entry) {
          const mappedTracks: Track[] = queueData.entry.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            artistId: t.artistId,
            coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
            duration: t.duration
          }));
          
          let initialIndex = 0;
          if (queueData.current) {
            const idx = mappedTracks.findIndex(t => t.id === queueData.current);
            if (idx !== -1) initialIndex = idx;
          }

          usePlayerStore.setState({
            queue: mappedTracks,
            originalQueue: mappedTracks,
            currentIndex: initialIndex,
            isPlaying: false, 
            initialPosition: queueData.position || 0
          });
        }
      }).catch(e => console.error("Failed to fetch play queue", e));
    }
  }, [isAuthenticated, roomToJoin, trackId, albumId, setLikedItems, isJamRoute]);

  return { isAuthenticated, isJamRoute };
}
