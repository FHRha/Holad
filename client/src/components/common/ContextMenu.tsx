import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ListPlus, SkipForward, Trash2, Heart, Star, Download, Share2, User, Disc } from 'lucide-react';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { usePlayerStore } from '../../store/playerStore';
import { starItem, unstarItem, setItemRating, getDownloadUrl, getAlbum } from '../../api/subsonic';
import type { Track } from '../../store/playerStore';
import { getCoverArtUrl } from '../../api/subsonic';

export default function ContextMenu() {
  const navigate = useNavigate();
  const { isOpen, x, y, item, type, closeMenu } = useContextMenuStore();
  const { setQueueAndPlay, playNext, addToQueue, queue, setQueue, likedTrackIds, likedAlbumIds, toggleTrackLike, toggleAlbumLike, role } = usePlayerStore();
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isGuest = isJamRoute && role !== 'host';
  const menuRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(0);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setRating(item.userRating || 0);
    }
  }, [isOpen, item]);

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, closeMenu]);

  // Handle scrolling to close
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => closeMenu();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isOpen, closeMenu]);

  if (!isOpen || !item) return null;

  const isAlbum = type === 'album';
  const isLiked = isAlbum ? likedAlbumIds.includes(item.id) : likedTrackIds.includes(item.id);
  const isInQueue = !isAlbum && queue.some((t: Track) => t.id === item.id);

  const handleAction = async (action: () => void | Promise<void>, shouldClose = true) => {
    try {
      await action();
    } catch (e) {
      console.error(e);
    }
    if (shouldClose) closeMenu();
  };

  const getTracks = async (): Promise<Track[]> => {
    if (!isAlbum) return [item as Track];
    const tracks = await getAlbum(item.id);
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverArt: getCoverArtUrl(t.coverArt, 300),
      duration: t.duration
    }));
  };

  const onPlayNow = async () => {
    const tracks = await getTracks();
    setQueueAndPlay(tracks, 0);
  };

  const onPlayNext = async () => {
    const tracks = await getTracks();
    playNext(tracks);
  };

  const onAddToQueue = async () => {
    const tracks = await getTracks();
    addToQueue(tracks);
  };

  const onRemoveFromQueue = () => {
    if (item.queueIndex !== undefined) {
      const newQueue = [...queue];
      newQueue.splice(item.queueIndex, 1);
      setQueue(newQueue);
    }
  };

  const onLike = () => {
    if (isAlbum) {
      toggleAlbumLike(item.id);
      if (isLiked) unstarItem(item.id, true);
      else starItem(item.id, true);
    } else {
      toggleTrackLike(item.id);
      if (isLiked) unstarItem(item.id);
      else starItem(item.id);
    }
  };

  const onRate = (val: number) => {
    const newRating = rating === val ? 0 : val;
    setRating(newRating);
    setItemRating(item.id, newRating);
    window.dispatchEvent(new CustomEvent('rating-updated', { detail: { id: item.id, rating: newRating } }));
  };

  const onDownload = () => {
    const url = getDownloadUrl(item.id);
    window.open(url, '_blank');
  };

  const onShare = () => {
    const link = `${window.location.origin}/jam/?track=${item.id}`;
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const ItemBtn = ({ icon: Icon, label, onClick, color = 'text-white' }: any) => (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors text-sm font-semibold ${color}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );

  return (
    <div 
      ref={menuRef}
      className="fixed z-[9999] bg-[#1c1c1c] border border-white/10 rounded-lg shadow-2xl overflow-hidden py-1 min-w-[220px] backdrop-blur-xl"
      style={{ 
        top: y, 
        left: x,
        transform: y > window.innerHeight - 400 ? 'translateY(-100%)' : 'none'
      }}
      onContextMenu={(e) => e.preventDefault()} // prevent native menu on the custom menu
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <img src={item.coverArt} alt="" className="w-10 h-10 rounded object-cover shadow-md" />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-white text-sm truncate">{item.title || item.name}</span>
          <span className="text-secondary text-xs truncate">{item.artist}</span>
        </div>
      </div>

      <div className="py-1">
        <ItemBtn icon={Play} label="Слушать сейчас" onClick={() => handleAction(onPlayNow)} />
        <ItemBtn icon={ListPlus} label="Слушать следующим" onClick={() => handleAction(onPlayNext)} />
        {!isInQueue && <ItemBtn icon={SkipForward} label="Добавить в очередь" onClick={() => handleAction(onAddToQueue)} />}
      </div>

      {item.queueIndex !== undefined && (
        <div className="py-1 border-t border-white/10">
          <ItemBtn icon={Trash2} label="Удалить из очереди" onClick={() => handleAction(onRemoveFromQueue)} color="text-red-400 hover:text-red-300" />
        </div>
      )}

      {!isGuest && (
        <>
          <div className="py-1 border-t border-white/10">
            <ItemBtn 
              icon={Heart} 
              label={isLiked ? "Удалить из любимых" : "Любимый"} 
              onClick={() => handleAction(onLike)} 
              color={isLiked ? "text-primary" : "text-white"} 
            />
            
            {/* Rating inline */}
            <div className="flex items-center justify-between px-4 py-2 hover:bg-white/10 transition-colors cursor-default">
              <div className="flex items-center gap-3 text-sm font-semibold text-white">
                <Star size={16} />
                <span>Оценить</span>
              </div>
              <div className="flex gap-1 text-yellow-400">
                {[1, 2, 3, 4, 5].map(v => (
                  <Star 
                    key={v} 
                    size={14} 
                    fill={v <= rating ? 'currentColor' : 'transparent'} 
                    className={`cursor-pointer hover:scale-125 transition-transform ${v > rating ? 'text-white/30' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onRate(v); }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="py-1 border-t border-white/10">
            <ItemBtn icon={Download} label="Скачать" onClick={() => handleAction(onDownload)} />
            <ItemBtn 
              icon={Share2} 
              label={isCopied ? "Скопировано!" : "Поделиться (Врем. ссылка)"} 
              onClick={() => handleAction(onShare, false)} 
              color={isCopied ? "text-primary font-bold" : "text-white"}
            />
          </div>

          <div className="py-1 border-t border-white/10">
            <ItemBtn icon={User} label="Перейти к Исполнителю" onClick={() => handleAction(() => {})} />
            <ItemBtn icon={Disc} label="Перейти к Альбому" onClick={() => handleAction(() => {
              if (isAlbum) navigate(`/Holad/album/${item.id}`);
              else if (item.albumId) navigate(`/Holad/album/${item.albumId}`);
            })} />
          </div>
        </>
      )}
    </div>
  );
}
