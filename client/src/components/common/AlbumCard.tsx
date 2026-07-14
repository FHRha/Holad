import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Star, ChevronDown, MoreHorizontal, SkipForward, ListPlus } from 'lucide-react';
import { getCoverArtUrl, getAlbum, starItem, unstarItem, setItemRating } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import type { Track } from '../../store/playerStore';
import { formatArtistName } from '../../utils/formatters';

export default function AlbumCard({ album }: { album: any }) {
  const navigate = useNavigate();
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const playNext = usePlayerStore(state => state.playNext);
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const likedAlbumIds = usePlayerStore(state => state.likedAlbumIds);
  const toggleAlbumLike = usePlayerStore(state => state.toggleAlbumLike);
  const { openMenu } = useContextMenuStore();

  const isLiked = likedAlbumIds.includes(album.id);
  const [rating, setRatingState] = useState(album.userRating || 0);
  const touchTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleRatingUpdate = (e: any) => {
      if (e.detail.id === album.id) {
        setRatingState(e.detail.rating);
      }
    };
    window.addEventListener('rating-updated', handleRatingUpdate);
    return () => window.removeEventListener('rating-updated', handleRatingUpdate);
  }, [album.id]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, album, 'album');
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchTimer.current = setTimeout(() => {
      openMenu(touch.clientX, touch.clientY, album, 'album');
    }, 500);
  };

  const handleTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleAlbumLike(album.id);
    if (isLiked) unstarItem(album.id, true);
    else starItem(album.id, true);
  };

  const handleRate = (e: React.MouseEvent, starValue: number) => {
    e.stopPropagation();
    const newRating = starValue === rating ? 0 : starValue;
    setRatingState(newRating);
    setItemRating(album.id, newRating);
  };

  const coverUrl = getCoverArtUrl(album.coverArt, 300);

  const mapTracks = (tracks: any[]): Track[] => {
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: album.id,
      coverArt: getCoverArtUrl(t.coverArt || album.id, 300),
      duration: t.duration
    }));
  };

  const handlePlayNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tracks = await getAlbum(album.id);
    setQueueAndPlay(mapTracks(tracks), 0);
  };

  const handlePlayNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tracks = await getAlbum(album.id);
    playNext(mapTracks(tracks));
  };

  const handleAddToQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tracks = await getAlbum(album.id);
    addToQueue(mapTracks(tracks));
  };

  return (
    <div 
      onClick={() => navigate(`/Holad/album/${album.id}`)}
      className="group relative bg-card rounded-lg cursor-pointer flex flex-col h-full flex-shrink-0 border border-transparent hover:bg-[#282828]"
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-lg bg-black/20">
        <img 
          src={coverUrl} 
          alt={album.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src.includes('&size=')) {
              target.src = target.src.replace(/&size=\d+/, '');
            }
          }}
        />

        {/* Top Banner (Rating Square) */}
        {rating > 0 && (
          <div className="absolute top-0 right-0 w-8 h-8 bg-primary text-background text-sm font-bold rounded-bl-lg z-10 flex items-center justify-center group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
            {rating}
          </div>
        )}

        {/* Hover Overlay Buttons on Image */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-3 bg-black/50">
          <div className="flex justify-between items-start">
            <Heart 
              size={20} 
              className={`cursor-pointer transition-colors hover:scale-110 ${isLiked ? 'text-primary' : 'text-white hover:text-primary'}`} 
              fill={isLiked ? "currentColor" : "none"}
              onClick={handleLike}
            />
            <div className="flex text-yellow-400 drop-shadow-md cursor-pointer z-20">
              {[1, 2, 3, 4, 5].map((starValue) => (
                <Star 
                  key={starValue} 
                  size={14} 
                  fill={starValue <= rating ? 'currentColor' : 'transparent'} 
                  className={`hover:scale-125 transition-transform ${starValue > rating ? 'text-white/30' : ''}`} 
                  onClick={(e) => handleRate(e, starValue)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 lg:gap-4">
            <button 
              onClick={handlePlayNext}
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
            >
              <ListPlus size={20} strokeWidth={1.5} />
            </button>

            <button 
              onClick={handlePlayNow}
              className="w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
            >
              <Play fill="currentColor" size={24} className="ml-1" />
            </button>

            <button 
              onClick={handleAddToQueue}
              className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
            >
              <SkipForward size={20} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex justify-between items-end">
            <ChevronDown size={20} className="text-white/70 hover:text-white cursor-pointer" />
            <MoreHorizontal size={20} className="text-white/70 hover:text-white cursor-pointer" />
          </div>
        </div>
      </div>

      <div className="p-3 mt-auto">
        <h3 className="font-semibold text-sm text-foreground truncate">{album.name}</h3>
        <p className="text-xs text-secondary truncate mt-1">{formatArtistName(album.artist)}</p>
        <p className="text-[10px] text-foreground/40 mt-1 uppercase">
          {album.genre || 'MP3'} &nbsp;&nbsp; {album.year || ''}
        </p>
      </div>
    </div>
  );
}
