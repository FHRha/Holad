import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Star, ChevronDown, MoreHorizontal, SkipForward, ListPlus } from 'lucide-react';
import { getCoverArtUrl, getAlbum, starItem, unstarItem, setItemRating, getDownloadUrl } from '../../api/subsonic';
import { getCachedImageUrl } from '../../utils/imageCache';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import type { Track } from '../../store/playerStore';
import ArtistLinks from './ArtistLinks';
import { useLongPress } from '../../hooks/useLongPress';

export default function AlbumCard({ album }: { album: any }) {
  const navigate = useNavigate();
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const playNext = usePlayerStore(state => state.playNext);
  const addToQueue = usePlayerStore(state => state.addToQueue);
  const likedAlbumIds = usePlayerStore(state => state.likedAlbumIds);
  const toggleAlbumLike = usePlayerStore(state => state.toggleAlbumLike);
  const setIsProcessing = usePlayerStore(state => state.setIsProcessing);
  const { openMenu } = useContextMenuStore();

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

  const longPressProps = useLongPress(
    (e) => {
      let clientX = e.clientX;
      let clientY = e.clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
      openMenu(clientX, clientY, album, 'album');
    },
    (e) => {
      if (window.innerWidth < 768) {
        handlePlayNow(e);
        return;
      }
      const isJam = window.location.pathname.startsWith('/jam');
      const searchParams = new URLSearchParams(window.location.search);
      const room = searchParams.get('room');
      if (isJam && room) {
        navigate(`/jam/library/album/${album.id}?room=${room}`);
      } else {
        navigate(`/Holad/album/${album.id}`);
      }
    }
  );

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

  const [finalCoverUrl, setFinalCoverUrl] = useState<string | undefined>(undefined);
  const coverUrl = getCoverArtUrl(album.coverArt, 300);

  useEffect(() => {
    let isMounted = true;
    getCachedImageUrl(coverUrl).then(url => {
      if (isMounted) setFinalCoverUrl(url);
    }).catch(() => {
      if (isMounted) setFinalCoverUrl(coverUrl);
    });
    return () => { isMounted = false; };
  }, [coverUrl]);

  const mapTracks = (tracks: any[]): Track[] => {
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: album.title,
      albumId: album.id,
      artistId: t.artistId || album.artistId,
      coverArt: getCoverArtUrl(album.coverArt || album.id, 300),
      duration: t.duration
    }));
  };

  const handlePlayNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    try {
      const tracks = await getAlbum(album.id);
      setQueueAndPlay(mapTracks(tracks), 0);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlayNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    try {
      const tracks = await getAlbum(album.id);
      playNext(mapTracks(tracks));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddToQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsProcessing(true);
    try {
      const tracks = await getAlbum(album.id);
      addToQueue(mapTracks(tracks));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="group relative bg-[#181818] hover:bg-[#282828] rounded-xl cursor-pointer flex flex-col p-4 flex-shrink-0 transition-colors duration-300 shadow-sm hover:shadow-lg h-full"
      {...longPressProps}
    >
      <div className="relative aspect-square overflow-hidden rounded-t-lg bg-black/20">
        <img 
          src={finalCoverUrl} 
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

        {/* Top Banner (Rating Square - Desktop Only) */}
        {rating > 0 && (
          <div className="hidden md:flex absolute top-0 right-0 w-8 h-8 bg-primary text-background text-sm font-bold rounded-bl-lg z-10 items-center justify-center [@media(hover:hover)]:group-hover:opacity-0 transition-opacity duration-300 pointer-events-none">
            {rating}
          </div>
        )}

        {/* Mobile Info Overlay (Stars and Heart) */}
        <div className="md:hidden absolute bottom-2 left-2 right-2 flex justify-between items-center z-10 pointer-events-none">
          {rating > 0 && (
            <div className="flex items-center gap-1 text-primary text-xs font-bold bg-black/40 px-1.5 py-0.5 rounded-full pointer-events-auto">
              <Star size={10} fill="currentColor" />
              {rating}
            </div>
          )}
          {isLiked && (
            <div className="text-primary bg-black/40 p-1 rounded-full pointer-events-auto ml-auto">
              <Heart size={14} fill="currentColor" className="border-none" />
            </div>
          )}
        </div>

        {/* Hover Overlay Buttons on Image */}
        <div className="absolute inset-0 opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-all duration-300 hidden md:flex [@media(hover:none)]:!hidden flex-col justify-between p-3 bg-black/50">
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
            <ChevronDown size={20} className="text-white/70 hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); window.open(getDownloadUrl(album.id), '_blank'); }} />
            <MoreHorizontal size={20} className="text-white/70 hover:text-white cursor-pointer" onClick={(e) => { e.stopPropagation(); handleContextMenu(e); }} />
          </div>
        </div>
      </div>

      <div className="p-3 mt-auto">
        <h3 className="font-semibold text-sm text-foreground truncate leading-normal">{album.name}</h3>
        <ArtistLinks artistString={album.artist} artistId={album.artistId} className="text-xs text-secondary truncate mt-1" />
        <p className="text-[10px] text-foreground/40 mt-1 uppercase">
          {album.genre || 'MP3'} &nbsp;&nbsp; {album.year || ''}
        </p>
      </div>
    </div>
  );
}
