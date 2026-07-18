import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ListPlus, SkipForward, Trash2, Heart, Star, Download, Share2, User, Disc } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { usePlayerStore } from '../../store/playerStore';
import { starItem, unstarItem, setItemRating, getAlbum } from '../../api/subsonic';
import { getShareUrl } from '../../utils/serverConfig';
import { handleDownload } from '../../utils/downloadHelper';
import type { Track } from '../../store/playerStore';
import { getCoverArtUrl } from '../../api/subsonic';

export default function ContextMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen, x, y, item, type, closeMenu } = useContextMenuStore();
  const { setQueueAndPlay, playNext, addToQueue, queue, setQueue, likedTrackIds, likedAlbumIds, toggleTrackLike, toggleAlbumLike, role } = usePlayerStore();
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isGuest = isJamRoute && role !== 'host';
  const menuRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const isLiked = isAlbum ? (likedAlbumIds || []).includes(item?.id) : (likedTrackIds || []).includes(item?.id);
  const isInQueue = !isAlbum && (queue || []).some((t: Track) => t?.id === item?.id);

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
      albumId: t.albumId,
      artistId: t.artistId,
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
    handleDownload(item.id, item.title || item.name || 'download');
    closeMenu();
  };

  const onShare = () => {
    const shareUrl = type === 'album' 
      ? `${getShareUrl()}/jam/?album=${item.id}` 
      : `${getShareUrl()}/jam/?track=${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const ItemBtn = ({ icon: Icon, label, onClick, color = 'text-white' }: any) => (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/10 transition-colors text-sm font-semibold ${color}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );

  const MobileIconBtn = ({ icon: Icon, label, onClick, color = 'text-white', activeColor = '' }: any) => (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex flex-col items-center justify-center gap-1.5 p-2 active:bg-white/10 rounded-xl transition-colors`}
    >
      <Icon size={22} className={activeColor || color} />
      <span className={`text-[10px] font-medium text-center leading-tight ${color} opacity-80`}>{label}</span>
    </button>
  );



  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200"
          onClick={closeMenu}
        />
        <div 
          ref={menuRef}
          className="fixed z-[9999] bottom-0 left-0 right-0 bg-[#1c1c1c] border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300"
          style={{ 
            maxHeight: '85vh',
            transition: 'transform 0.3s ease-out'
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Header with Drag Handle */}
          <div 
            className="px-4 pt-2 pb-4 border-b border-white/10 touch-none"
            onTouchStart={(e) => {
              touchStartY.current = e.touches[0].clientY;
              if (menuRef.current) menuRef.current.style.transition = 'none';
            }}
            onTouchMove={(e) => {
              if (touchStartY.current !== null && menuRef.current) {
                const delta = e.touches[0].clientY - touchStartY.current;
                if (delta > 0) {
                  menuRef.current.style.transform = `translateY(${delta}px)`;
                }
              }
            }}
            onTouchEnd={(e) => {
              if (touchStartY.current !== null && menuRef.current) {
                const delta = e.changedTouches[0].clientY - touchStartY.current;
                menuRef.current.style.transition = 'transform 0.3s ease-out';
                if (delta > 80) {
                  closeMenu();
                } else {
                  menuRef.current.style.transform = 'translateY(0px)';
                }
                touchStartY.current = null;
              }
            }}
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-3">
        <img 
          src={item?.coverArt && (item.coverArt.toString().startsWith('http') || item.coverArt.toString().includes('getCoverArt')) ? item.coverArt : getCoverArtUrl(item?.coverArt || item?.id, 300)} 
          alt="" 
          className="w-12 h-12 rounded object-cover shadow-md pointer-events-none" 
        />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white text-[15px] truncate">{item.title || item.name}</span>
                <span className="text-secondary text-xs truncate">{item.artist}</span>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto hide-scrollbar max-h-[60vh] px-2 py-4 space-y-4">
            
            {/* Action Grid */}
            <div className="grid grid-cols-4 gap-2">
              <MobileIconBtn icon={Play} label={t('common.play_now')} onClick={() => handleAction(onPlayNow)} />
              <MobileIconBtn icon={ListPlus} label={t('common.play_next')} onClick={() => handleAction(onPlayNext)} />
              {!isInQueue && <MobileIconBtn icon={SkipForward} label={t('common.add_to_queue')} onClick={() => handleAction(onAddToQueue)} />}
              {!isGuest && <MobileIconBtn icon={Heart} label={t('common.favorite')} onClick={() => handleAction(onLike)} activeColor={isLiked ? "text-primary" : "text-white"} />}
              {!isGuest && <MobileIconBtn icon={Download} label={t('common.download')} onClick={() => handleAction(onDownload)} />}
              {!isGuest && <MobileIconBtn icon={Share2} label={t('common.share')} onClick={() => handleAction(onShare, false)} activeColor={isCopied ? "text-primary" : "text-white"} />}
              {!isGuest && item.artistId && <MobileIconBtn icon={User} label={t('common.go_to_artist')} onClick={() => handleAction(() => navigate(`/Holad/artist/${item.artistId}`))} />}
              {!isGuest && (isAlbum || item.albumId) && <MobileIconBtn icon={Disc} label={t('common.go_to_album')} onClick={() => handleAction(() => {
                if (isAlbum) navigate(`/Holad/album/${item.id}`);
                else if (item.albumId) navigate(`/Holad/album/${item.albumId}`);
              })} />}
              {item.queueIndex !== undefined && (
                <MobileIconBtn icon={Trash2} label={t('common.remove_from_queue')} onClick={() => handleAction(onRemoveFromQueue)} color="text-red-400" />
              )}
            </div>

            {/* Rating */}
            {!isGuest && (
              <div className="bg-white/5 rounded-2xl p-4 flex flex-col items-center gap-2">
                <span className="text-xs text-secondary font-medium">{t('common.rate')}</span>
                <div className="flex gap-2 text-yellow-400">
                  {[1, 2, 3, 4, 5].map(v => (
                    <Star 
                      key={v} 
                      size={24} 
                      fill={v <= rating ? 'currentColor' : 'transparent'} 
                      className={`active:scale-125 transition-transform ${v > rating ? 'text-white/30' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onRate(v); }}
                    />
                  ))}
                </div>
              </div>
            )}


          </div>
        </div>
      </>
    );
  }

  return (
    <div 
      ref={menuRef}
      className="fixed z-[9999] bg-[#1c1c1c] border border-white/10 rounded-lg shadow-2xl overflow-y-auto hide-scrollbar py-1 min-w-[220px] backdrop-blur-xl transform-gpu"
      style={{ 
        top: Math.min(y, window.innerHeight - 50), 
        left: Math.min(x, window.innerWidth - 230),
        transform: y > window.innerHeight / 2 ? 'translateY(-100%)' : 'none',
        maxHeight: '85vh'
      }}
      onContextMenu={(e) => e.preventDefault()} // prevent native menu on the custom menu
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <img 
          src={item.coverArt && (item.coverArt.toString().startsWith('http') || item.coverArt.toString().includes('getCoverArt')) ? item.coverArt : getCoverArtUrl(item.coverArt || item.id, 300)} 
          alt="" 
          className="w-10 h-10 rounded object-cover shadow-md" 
        />
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-white text-sm truncate">{item.title || item.name}</span>
          <span className="text-secondary text-xs truncate">{item.artist}</span>
        </div>
      </div>

      <div className="py-1">
        <ItemBtn icon={Play} label={t('common.play_now')} onClick={() => handleAction(onPlayNow)} />
        <ItemBtn icon={ListPlus} label={t('common.play_next')} onClick={() => handleAction(onPlayNext)} />
        {!isInQueue && <ItemBtn icon={SkipForward} label={t('common.add_to_queue')} onClick={() => handleAction(onAddToQueue)} />}
      </div>

      {item.queueIndex !== undefined && (
        <div className="py-1 border-t border-white/10">
          <ItemBtn icon={Trash2} label={t('common.remove_from_queue')} onClick={() => handleAction(onRemoveFromQueue)} color="text-red-400 hover:text-red-300" />
        </div>
      )}

      {!isGuest && (
        <>
          <div className="py-1 border-t border-white/10">
            <ItemBtn 
              icon={Heart} 
              label={isLiked ? t('common.remove_from_favs') : t('common.favorite')} 
              onClick={() => handleAction(onLike)} 
              color={isLiked ? "text-primary" : "text-white"} 
            />
            
            {/* Rating inline */}
            <div className="flex items-center justify-between px-4 py-2 hover:bg-white/10 transition-colors cursor-default">
              <div className="flex items-center gap-3 text-sm font-semibold text-white">
                <Star size={16} />
                <span>{t('common.rate')}</span>
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
            <ItemBtn icon={Download} label={t('common.download')} onClick={() => handleAction(onDownload)} />
            <ItemBtn 
              icon={Share2} 
              label={isCopied ? t('common.copied') : t('common.share')} 
              onClick={() => handleAction(onShare, false)} 
              color={isCopied ? "text-primary font-bold" : "text-white"}
            />
          </div>

          <div className="py-1 border-t border-white/10">
            {item.artistId && (
              <ItemBtn icon={User} label={t('common.go_to_artist')} onClick={() => handleAction(() => {
                navigate(`/Holad/artist/${item.artistId}`);
              })} />
            )}
            <ItemBtn icon={Disc} label={t('common.go_to_album')} onClick={() => handleAction(() => {
              if (isAlbum) navigate(`/Holad/album/${item.id}`);
              else if (item.albumId) navigate(`/Holad/album/${item.albumId}`);
            })} />
          </div>
        </>
      )}
    </div>
  );
}
