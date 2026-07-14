import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Star, ChevronDown, MoreHorizontal, SkipForward, ListPlus } from 'lucide-react';
import { getCoverArtUrl, getAlbum, starItem, unstarItem, setItemRating } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import type { Track } from '../../store/playerStore';
import { extractDominantColor } from '../../utils/colorExtractor';
import { formatArtistName } from '../../utils/formatters';

const isLightColor = (color: string | null): boolean => {
  if (!color) return false;
  
  const getLum = (r: number, g: number, b: number) => {
    const lum = [r/255, g/255, b/255].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return (lum[0] * 0.2126 + lum[1] * 0.7152 + lum[2] * 0.0722) > 0.35;
  };

  const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]);
    const s = parseInt(hslMatch[2]) / 100;
    const l = parseInt(hslMatch[3]) / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return getLum(Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255));
  }

  const rgbMatch = color.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return getLum(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }

  const hexMatch = color.match(/^#([0-9a-fA-F]{3,6})/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return getLum(r, g, b);
    }
  }

  return false;
};

export default function HeroAlbumCard({ album }: { album: any }) {
  const navigate = useNavigate();
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const playNext = usePlayerStore(state => state.playNext);
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const likedAlbumIds = usePlayerStore(state => state.likedAlbumIds);
  const toggleAlbumLike = usePlayerStore(state => state.toggleAlbumLike);
  const { openMenu } = useContextMenuStore();
  
  const [dominantColor, setDominantColor] = useState<string | null>(null);
  const touchTimer = useRef<number | null>(null);

  const isLiked = likedAlbumIds.includes(album.id);
  const [rating, setRatingState] = useState(album.userRating || 0);

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
    e.preventDefault();
    const newRating = starValue === rating ? 0 : starValue;
    setRatingState(newRating);
    setItemRating(album.id, newRating).catch(console.error);
  };

  const coverUrl = getCoverArtUrl(album.coverArt, 600);

  useEffect(() => {
    extractDominantColor(coverUrl).then(color => setDominantColor(color));
  }, [coverUrl]);

  const isLight = isLightColor(dominantColor);

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
      className="group relative rounded-xl cursor-pointer flex flex-col p-6 flex-shrink-0 h-full"
      style={{
        backgroundColor: dominantColor ? dominantColor : '#181818'
      }}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <div className="text-center mb-4">
        <h3 className={`font-bold text-lg truncate drop-shadow-md ${isLight ? 'text-black' : 'text-white'}`}>{album.name}</h3>
      </div>

      <div className="relative aspect-square overflow-hidden rounded-lg shadow-2xl mb-5 mx-2 bg-black/20">
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

        {/* Rating Square */}
        {rating > 0 && (
          <div className="absolute top-0 right-0 w-8 h-8 bg-primary text-background text-sm font-bold rounded-bl-lg z-10 flex items-center justify-center group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
            {rating}
          </div>
        )}

        {/* Hover Overlay Buttons on Image */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-between p-3 bg-black/50">
          <div className="flex justify-between items-start">
            <Heart 
              size={24} 
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

          <div className="flex items-center justify-center gap-3 lg:gap-5">
            <button 
              onClick={handlePlayNext}
              className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
            >
              <ListPlus size={20} strokeWidth={1.5} />
            </button>

            <button 
              onClick={handlePlayNow}
              className="w-14 h-14 lg:w-16 lg:h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
            >
              <Play fill="currentColor" size={24} className="ml-1" />
            </button>

            <button 
              onClick={handleAddToQueue}
              className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
            >
              <SkipForward size={20} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex justify-between items-end">
            <ChevronDown size={24} className="text-white/70 hover:text-white cursor-pointer" />
            <MoreHorizontal size={24} className="text-white/70 hover:text-white cursor-pointer" />
          </div>
        </div>
      </div>

      <div className="text-center mt-auto">
        <p className={`text-sm font-semibold truncate drop-shadow-md ${isLight ? 'text-black' : 'text-white'}`}>{formatArtistName(album.artist)}</p>
        <p className={`text-xs truncate mt-1 font-medium tracking-widest uppercase drop-shadow-md ${isLight ? 'text-black/70' : 'text-white/70'}`}>
          {album.genre || 'MP3'} &nbsp;&nbsp; {album.year || ''}
        </p>
      </div>
    </div>
  );
}
