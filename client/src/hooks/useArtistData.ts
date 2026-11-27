import { useState, useEffect } from 'react';
import { getArtist, getTopSongs, getArtistInfo, getCoverArtUrl, searchAll, getSimilarSongs } from '../api/subsonic';
import { getExternalArtistStats } from '../api/externalApi';
import { usePlayerStore } from '../store/playerStore';
import type { Track } from '../store/playerStore';

export function useArtistData(id: string | undefined) {
  const { setQueueAndPlay } = usePlayerStore();

  const [artist, setArtist] = useState<any>(null);
  const [artistInfo, setArtistInfo] = useState<any>(null);
  const [externalStats, setExternalStats] = useState<any>(null);
  const [topSongs, setTopSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracksLoading, setTracksLoading] = useState(true);

  // Extract ID from slug like "Oxxxymiron-12345"
  const actualId = id ? id.split('-').pop() : '';

  useEffect(() => {
    if (!actualId) return;
    let cancelled = false;
    setLoading(true);
    setTracksLoading(true);
    setTopSongs([]);

    Promise.all([
      getArtist(actualId),
      getArtistInfo(actualId).catch(() => null), // If fails, ignore
    ])
      .then(([artistData, infoData]) => {
        if (cancelled) return;
        setArtist(artistData);
        setArtistInfo(infoData);
        // Render artist header & albums immediately instead of waiting for top songs
        setLoading(false);

        // Fetch top songs and external stats in background after artist info resolves
        if (artistData?.name) {
          getExternalArtistStats(artistData.name)
            .then(stats => {
              if (cancelled) return;
              if (stats && stats.data) {
                stats.data.image = getCoverArtUrl(artistData.coverArt || artistData.id, 600);
              }
              setExternalStats(stats);
            })
            .catch(() => {});

          Promise.all([
            getTopSongs(artistData.name, 1000, artistData.id).catch(() => []),
            searchAll(artistData.name, 1000).catch(() => ({ song: [] })),
          ])
            .then(([topRes, searchRes]) => {
              if (cancelled) return;

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
                artistId: s.artistId || artistData.id,
                coverArt: getCoverArtUrl(s.coverArt || s.albumId || s.id, 300),
                duration: s.duration,
                userRating: s.userRating,
                bitRate: s.bitRate,
                suffix: s.suffix,
                year: s.year,
              }));

              setTopSongs(tracksForQueue);
            })
            .finally(() => {
              if (!cancelled) {
                setTracksLoading(false);
              }
            });
        } else {
          setTracksLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) {
          setLoading(false);
          setTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
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

  const handlePlayRadio = async () => {
    if (!artist?.id) return;
    try {
      const similarSongs = await getSimilarSongs(artist.id, 50).catch(() => []);
      const combined = [...topSongs.slice(0, 10), ...similarSongs];

      const uniqueMap = new Map();
      combined.forEach(s => {
        if (!uniqueMap.has(s.id)) uniqueMap.set(s.id, s);
      });

      const shuffledRadio = Array.from(uniqueMap.values()).sort(() => Math.random() - 0.5);

      const tracksForQueue: Track[] = shuffledRadio.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        album: s.album,
        albumId: s.albumId,
        artistId: s.artistId || artist.id,
        coverArt: getCoverArtUrl(s.coverArt || s.albumId || s.id, 300),
        duration: s.duration,
        userRating: s.userRating,
        bitRate: s.bitRate,
        suffix: s.suffix,
        year: s.year,
      }));

      if (tracksForQueue.length > 0) {
        setQueueAndPlay(tracksForQueue, 0);
      }
    } catch (err) {
      console.error('Radio error', err);
    }
  };

  return {
    artist,
    artistInfo,
    externalStats,
    topSongs,
    loading,
    tracksLoading,
    handlePlayArtist,
    handleShuffleArtist,
    handlePlaySong,
    handlePlayRadio,
  };
}
