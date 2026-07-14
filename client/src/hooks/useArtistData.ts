import { useState, useEffect } from 'react';
import { getArtist, getTopSongs, getArtistInfo, getCoverArtUrl, searchAll } from '../api/subsonic';
import { usePlayerStore } from '../store/playerStore';
import type { Track } from '../store/playerStore';

export function useArtistData(id: string | undefined) {
  const { setQueueAndPlay } = usePlayerStore();
  
  const [artist, setArtist] = useState<any>(null);
  const [artistInfo, setArtistInfo] = useState<any>(null);
  const [topSongs, setTopSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  // Extract ID from slug like "Oxxxymiron-12345"
  const actualId = id ? id.split('-').pop() : '';

  useEffect(() => {
    if (!actualId) return;
    setLoading(true);
    
    Promise.all([
      getArtist(actualId),
      getArtistInfo(actualId).catch(() => null), // If fails, ignore
    ]).then(([artistData, infoData]) => {
      setArtist(artistData);
      setArtistInfo(infoData);
      
      // Fetch top songs only after we know the artist name
      if (artistData?.name) {
        Promise.all([
          getTopSongs(artistData.name, 1000).catch(() => []),
          searchAll(artistData.name, 1000).catch(() => ({ song: [] }))
        ]).then(([topRes, searchRes]) => {
          
          const searchSongs = (searchRes.song || []).filter((s: any) => 
            s.artist?.toLowerCase().includes(artistData.name.toLowerCase())
          );
          
          // Combine and deduplicate explicitly to keep topRes intact and first
          const uniqueSongs: any[] = [];
          const seenIds = new Set();

          for (const s of topRes) {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              uniqueSongs.push(s);
            }
          }

          for (const s of searchSongs) {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              uniqueSongs.push(s);
            }
          }
          
          const tracksForQueue: Track[] = uniqueSongs.map((s: any) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            album: s.album,
            albumId: s.albumId,
            coverArt: getCoverArtUrl(s.coverArt || s.albumId || s.id, 300),
            duration: s.duration,
            userRating: s.userRating
          }));

          setTopSongs(tracksForQueue);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [actualId]);

  const handlePlayArtist = () => {
    if (topSongs.length > 0) {
      setQueueAndPlay(topSongs, 0);
    }
  };

  const handleShuffleArtist = () => {
    if (topSongs.length > 0) {
      const shuffled = [...topSongs].sort(() => Math.random() - 0.5);
      setQueueAndPlay(shuffled, 0);
    }
  };

  const handlePlaySong = (index: number) => {
    setQueueAndPlay(topSongs, index);
  };

  return {
    artist,
    artistInfo,
    topSongs,
    loading,
    handlePlayArtist,
    handleShuffleArtist,
    handlePlaySong
  };
}
