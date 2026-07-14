import { useState, useEffect } from 'react';
import { getAlbumFull, getCoverArtUrl, starItem, unstarItem, setItemRating } from '../api/subsonic';
import { usePlayerStore } from '../store/playerStore';
import { extractDominantColor } from '../utils/colorExtractor';

export function useAlbumData(id: string | undefined, observerTarget: React.RefObject<HTMLDivElement | null>) {
  const [album, setAlbum] = useState<any>(null);
  const [dominantColor, setDominantColor] = useState<string>('#181818');
  const [visibleCount, setVisibleCount] = useState(50);
  
  const { setQueueAndPlay, playNext, addToQueue, likedAlbumIds, toggleAlbumLike } = usePlayerStore();

  useEffect(() => {
    if (!id) return;
    getAlbumFull(id).then(data => {
      setAlbum(data);
      if (data) {
        const coverUrl = getCoverArtUrl(data.coverArt || data.id, 600);
        extractDominantColor(coverUrl).then(setDominantColor);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!album) return;
    const handleRatingUpdate = (e: any) => {
      if (e.detail.id === album.id) {
        setAlbum((prev: any) => ({ ...prev, userRating: e.detail.rating }));
      }
    };
    window.addEventListener('rating-updated', handleRatingUpdate);
    return () => window.removeEventListener('rating-updated', handleRatingUpdate);
  }, [album]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && album?.song && visibleCount < album.song.length) {
          setVisibleCount(prev => prev + 50);
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [album, visibleCount, observerTarget]);

  const isLiked = album ? likedAlbumIds.includes(album.id) : false;

  const getMappedTracks = () => {
    if (!album || !album.song) return [];
    return album.song.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist || album.artist,
      album: album.name,
      albumId: album.id,
      artistId: t.artistId || album.artistId,
      coverArt: getCoverArtUrl(album.coverArt || t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating
    }));
  };

  const handlePlayAll = () => {
    const tracks = getMappedTracks();
    if (tracks.length === 0) return;
    setQueueAndPlay(tracks, 0);
  };

  const handlePlayNext = () => {
    const tracks = getMappedTracks();
    if (tracks.length === 0) return;
    playNext(tracks);
  };

  const handleAddToEnd = () => {
    const tracks = getMappedTracks();
    if (tracks.length === 0) return;
    addToQueue(tracks);
  };

  const handlePlaySong = (index: number) => {
    const tracks = getMappedTracks();
    if (tracks.length === 0) return;
    setQueueAndPlay(tracks, index);
  };

  const handleLike = () => {
    if (!album) return;
    toggleAlbumLike(album.id);
    if (isLiked) unstarItem(album.id, true);
    else starItem(album.id, true);
  };

  const handleRate = (val: number) => {
    if (!album) return;
    const newRating = album.userRating === val ? 0 : val;
    setAlbum({ ...album, userRating: newRating });
    setItemRating(album.id, newRating);
  };

  return {
    album,
    dominantColor,
    visibleCount,
    isLiked,
    handlePlayAll,
    handlePlayNext,
    handleAddToEnd,
    handleLike,
    handleRate,
    handlePlaySong
  };
}
