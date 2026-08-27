import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Play, ListPlus, ListMinus, SkipForward, Trash2, Heart, Star, Download, Share2, User, Disc, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { usePlayerStore } from '../../store/playerStore';
import { starItem, unstarItem, setItemRating, getAlbum } from '../../api/subsonic';
import { getShareUrl } from '../../utils/serverConfig';
import { handleDownload } from '../../utils/downloadHelper';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import type { Track } from '../../store/playerStore';
import { getCoverArtUrl } from '../../api/subsonic';
import { getPlaylists, createPlaylist, updatePlaylistTracks, updatePlaylist } from '../../api/subsonic/playlists';
import { usePlaylistStore } from '../../store/playlistStore';
import AddToPlaylistModal from './AddToPlaylistModal';
import { ListMusic, Plus, ChevronRight } from 'lucide-react';
import { networkManager } from '../../utils/networkStatus';

export default function ContextMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOpen, x, y, item, type, closeMenu } = useContextMenuStore();
  const { setQueueAndPlay, playNext, addToQueue, queue, setQueue, likedTrackIds, likedAlbumIds, toggleTrackLike, toggleAlbumLike, role, toggleTrackExclude, toggleAlbumExclude, excludedTrackIds, excludedAlbumIds } = usePlayerStore();
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isGuest = isJamRoute && role !== 'host';
  const menuRef = useRef<HTMLDivElement>(null);
  const [rating, setRating] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const touchStartY = useRef<number | null>(null);
  
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [modalTrackIds, setModalTrackIds] = useState<string[]>([]);
  
  const { downloads, removeDownload } = useDownloadStore();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isOpen && item) {
      setRating(item.userRating || 0);
      setShowPlaylists(false);
      setNewPlaylistName('');
    }
  }, [isOpen, item]);

  const onShowPlaylists = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowPlaylists(true);
    const customPlaylists = usePlaylistStore.getState().playlists;
    const mappedCustomPlaylists = customPlaylists.map(cp => ({
      id: cp.id,
      name: cp.name,
      songCount: cp.trackIds.length,
      coverArt: null,
      isCustom: true
    }));
    
    try {
      if (!networkManager.isOnline()) {
         setPlaylists(mappedCustomPlaylists);
         return;
      }
      const list = await getPlaylists();
      setPlaylists([...mappedCustomPlaylists, ...(list || [])]);
    } catch (err) {
      console.error(err);
      setPlaylists(mappedCustomPlaylists);
    }
  };

  const handleCreatePlaylistInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      if (!networkManager.isOnline()) {
        const newId = usePlaylistStore.getState().createPlaylist(newPlaylistName.trim());
        await handleAddToPlaylist(newId, true);
        return;
      }
      
      await createPlaylist(newPlaylistName.trim());
      const updated = await getPlaylists();
      
      const customPlaylists = usePlaylistStore.getState().playlists;
      const mappedCustomPlaylists = customPlaylists.map(cp => ({
        id: cp.id,
        name: cp.name,
        songCount: cp.trackIds.length,
        coverArt: null,
        isCustom: true
      }));
      setPlaylists([...mappedCustomPlaylists, ...(updated || [])]);
      
      const created = updated.find(p => p.name === newPlaylistName.trim());
      if (created) {
        await handleAddToPlaylist(created.id, false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, isCustomOverride?: boolean) => {
    try {
      const tracks = await getTracks();
      const ids = tracks.map(t => t.id);
      
      const playlist = playlists.find(p => p.id === playlistId);
      const isCustom = isCustomOverride ?? playlist?.isCustom;
      
      if (isCustom) {
        ids.forEach(id => {
          usePlaylistStore.getState().addTrack(playlistId, id);
        });
      } else {
        await updatePlaylistTracks(playlistId, ids);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      closeMenu();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFromPlaylist = async () => {
    try {
      if (item.isCustomPlaylist) {
        usePlaylistStore.getState().removeTrack(item.playlistId, item.id);
      } else {
        await updatePlaylist(item.playlistId, undefined, item.playlistIndex);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      setTimeout(() => window.location.reload(), 300);
      closeMenu();
    } catch (err) {
      console.error(err);
    }
  };

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
  const isDownloaded = item ? isItemDownloaded(downloads, item.id, item.albumId) : false;

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
      duration: t.duration,
      bitRate: t.bitRate,
      suffix: t.suffix
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

  const isExcluded = isAlbum ? (excludedAlbumIds || []).includes(item?.id) : (excludedTrackIds || []).includes(item?.id);

  const onExclude = () => {
    if (isAlbum) {
      toggleAlbumExclude(item.id);
      const state = usePlayerStore.getState();
      const currentTrack = state.queue[state.currentIndex];
      if (!isExcluded && currentTrack?.albumId === item.id) {
        state.nextTrack();
      }
    } else {
      toggleTrackExclude(item.id);
      const state = usePlayerStore.getState();
      const currentTrack = state.queue[state.currentIndex];
      if (!isExcluded && currentTrack?.id === item.id) {
        state.nextTrack();
      }
    }
  };

  const onRate = (val: number) => {
    const newRating = rating === val ? 0 : val;
    setRating(newRating);
    setItemRating(item.id, newRating);
    window.dispatchEvent(new CustomEvent('rating-updated', { detail: { id: item.id, rating: newRating } }));
  };

  const onDownload = () => {
    handleDownload(item.id, item.title || item.name || 'download', type === 'album' ? 'album' : 'track');
    closeMenu();
  };

  const onRemoveDownload = async () => {
    let downloadId = item.id;
    let dlItem = downloads[downloadId];
    
    if (!dlItem && item.albumId && downloads[item.albumId]) {
      downloadId = item.albumId;
      dlItem = downloads[downloadId];
    }
    
    if (dlItem) {
      if (dlItem.type === 'album') {
        if (dlItem.path) {
          try {
            await StorageManager.removeDirectory(dlItem.path);
          } catch (e) {
            console.error('Failed to remove directory on disk:', e);
          }
        }
        const curDownloads = useDownloadStore.getState().downloads;
        for (const childId in curDownloads) {
          if (curDownloads[childId]?.albumId === downloadId) {
            removeDownload(childId);
          }
        }
      } else {
        if (dlItem.path) {
          try {
            await StorageManager.removeTrack(dlItem.path);
          } catch (e) {
            console.error('Failed to remove track on disk:', e);
          }
        }
      }
      removeDownload(downloadId);
    }
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
      onMouseDown={(e) => { 
        if (e.button !== 0) return; // only left click
        e.preventDefault(); 
        e.stopPropagation(); 
        onClick(); 
      }}
      className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-foreground/10 transition-colors text-sm font-semibold ${color}`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );

  const MobileIconBtn = ({ icon: Icon, label, onClick, color = 'text-white', activeColor = '' }: any) => (
    <button 
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex flex-col items-center justify-center gap-1.5 p-2 active:bg-foreground/10 rounded-xl transition-colors`}
    >
      <Icon size={22} className={activeColor || color} />
      <span className={`text-[10px] font-medium text-center leading-tight ${color} opacity-80`}>{label}</span>
    </button>
  );



  if (typeof document === 'undefined') return null;

  // Wait, I can't do async synchronously for rendering. Let's pass a function or just fetch it in the modal if needed, OR just pass `[item.id]` and if it's an album... Actually, I wrote handleAddToPlaylist which gets tracks. 
  // Wait, I can pass `[item.id]` if it's a track. But for Album?
  // Let's modify AddToPlaylistModal to accept an async function `getTrackIds: () => Promise<string[]>` instead of `trackIds: string[]`.
  // Wait, I already created `AddToPlaylistModal.tsx` and used it in `RightSidebar.tsx`. `RightSidebar` uses `trackIds`. Let's keep `trackIds` but for Album in ContextMenu, I can fetch them when opening the modal!
  
  const handleOpenPlaylistModal = async () => {
    try {
      if (isAlbum) {
        const tracks = await getTracks();
        setModalTrackIds(tracks.map(t => t.id));
      } else {
        setModalTrackIds([item.id]);
      }
      setIsPlaylistModalOpen(true);
    } catch (err) {
      console.error(err);
    }
  };

  if (isMobile) {
    return createPortal(
      <>
        <AddToPlaylistModal 
          isOpen={isPlaylistModalOpen} 
          onClose={() => { setIsPlaylistModalOpen(false); closeMenu(); }}
          trackIds={modalTrackIds}
        />
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
            
            {showPlaylists ? (
              <div className="flex flex-col gap-2">
                <button onClick={() => setShowPlaylists(false)} className="text-secondary text-sm font-semibold mb-2 self-start flex items-center">
                  <ChevronRight size={16} className="rotate-180 mr-1" />
                  {t('common.add_to_playlist')}
                </button>
                {playlists.slice(0, 5).map(p => (
                  <button 
                    key={p.id}
                    onClick={() => handleAddToPlaylist(p.id)}
                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors text-left"
                  >
                    {p.coverArt ? (
                      <img src={getCoverArtUrl(p.coverArt, 100)} alt="" className="w-10 h-10 rounded object-cover shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center text-secondary">
                        <ListMusic size={18} />
                      </div>
                    )}
                    <span className="text-sm font-semibold text-white truncate flex-1">{p.name}</span>
                  </button>
                ))}
                {playlists.length === 0 && (
                  <div className="text-secondary text-sm text-center py-4">{t('common.no_playlists_found')}</div>
                )}
                
                <form onSubmit={handleCreatePlaylistInline} className="flex gap-2 mt-2">
                  <input 
                    type="text" 
                    placeholder={t('common.new_playlist')} 
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors"
                  />
                  <button 
                    type="submit"
                    disabled={!newPlaylistName.trim()}
                    className="px-4 py-2.5 bg-white/10 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-white/20 transition-colors"
                  >
                    <Plus size={18} />
                  </button>
                </form>

                {playlists.length > 0 && (
                  <button onClick={handleOpenPlaylistModal} className="w-full py-3 mt-2 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
                    {t('common.show_all_playlists')}
                  </button>
                )}
              </div>
            ) : type !== 'playlist' ? (
              <>
                {/* Action Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <MobileIconBtn icon={Play} label={t('common.play_now')} onClick={() => handleAction(onPlayNow)} />
                  <MobileIconBtn icon={ListPlus} label={t('common.play_next')} onClick={() => handleAction(onPlayNext)} />
                  {!isInQueue && <MobileIconBtn icon={SkipForward} label={t('common.add_to_queue')} onClick={() => handleAction(onAddToQueue)} />}
                  {item.playlistId ? (
                    <MobileIconBtn icon={ListMinus} label={t('common.remove_from_playlist', 'Убрать из плейлиста')} onClick={handleRemoveFromPlaylist} color="text-red-500" />
                  ) : (
                    <MobileIconBtn icon={ListMusic} label={t('common.add_to_playlist')} onClick={onShowPlaylists} />
                  )}
                  {!isGuest && <MobileIconBtn icon={Heart} label={t('common.favorite')} onClick={() => handleAction(onLike)} activeColor={isLiked ? "text-primary" : "text-white"} />}
                  {!isGuest && <MobileIconBtn icon={Ban} label={t('common.ignore', 'В игнор')} onClick={() => handleAction(onExclude)} activeColor={isExcluded ? "text-red-500" : "text-white"} />}
                  {!isGuest && (isDownloaded ? (
                    <MobileIconBtn icon={Trash2} color="text-primary" label={t('common.remove_download')} onClick={() => handleAction(onRemoveDownload)} />
                  ) : (
                    <MobileIconBtn icon={Download} label={t('common.download')} onClick={() => handleAction(onDownload)} />
                  ))}
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
              </>
            ) : null}

            {type === 'playlist' && (
              <div className="grid grid-cols-3 gap-2">
                <MobileIconBtn icon={Play} label={t('common.open', 'Открыть')} onClick={() => handleAction(() => { navigate(`/Holad/playlist/${item.id}`); })} />
                <MobileIconBtn icon={Share2} label={isCopied ? t('common.copied') : t('common.share')} onClick={() => handleAction(() => {
                  const shareUrl = `${getShareUrl()}/jam/?playlist=${item.id}`;
                  navigator.clipboard.writeText(shareUrl);
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2000);
                }, false)} activeColor={isCopied ? "text-primary" : "text-white"} />
                <MobileIconBtn icon={Trash2} color="text-red-500" label={t('common.delete', 'Удалить')} onClick={async () => {
                  if (window.confirm(t('common.delete_playlist_confirm', 'Вы уверены, что хотите удалить плейлист?'))) {
                    try {
                      if (item.isCustom) {
                        usePlaylistStore.getState().deletePlaylist(item.id);
                      } else {
                        const { deletePlaylist } = await import('../../api/subsonic/playlists');
                        await deletePlaylist(item.id);
                      }
                      window.dispatchEvent(new CustomEvent('playlists-updated'));
                      setTimeout(() => window.location.reload(), 300);
                    } catch(e) { console.error(e); }
                    closeMenu();
                  }
                }} />
              </div>
            )}

          </div>
        </div>
      </>,
      document.body
    );
  }

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
  const safeX = typeof x === 'number' && !isNaN(x) ? x : winWidth / 2;
  const safeY = typeof y === 'number' && !isNaN(y) ? y : winHeight / 2;
  const left = Math.max(8, Math.min(safeX, winWidth - 230));
  const top = Math.max(8, Math.min(safeY, winHeight - 50));
  const transform = safeY > winHeight / 2 ? 'translateY(-100%)' : 'none';

  return createPortal(
    <>
      <AddToPlaylistModal 
        isOpen={isPlaylistModalOpen} 
        onClose={() => { setIsPlaylistModalOpen(false); closeMenu(); }}
        trackIds={modalTrackIds}
      />
      <div 
        ref={menuRef}
        className="fixed z-[9999] bg-[#1c1c1c] border border-white/10 rounded-lg shadow-2xl overflow-y-auto hide-scrollbar py-1 min-w-[220px] transform-gpu"
        style={{ 
          top, 
          left,
          transform,
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

      {showPlaylists ? (
        <div className="py-2 px-1 flex flex-col w-[240px]">
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPlaylists(false); }} 
            className="text-secondary text-xs font-semibold mb-2 px-3 flex items-center hover:text-white"
          >
            <ChevronRight size={14} className="rotate-180 mr-1" />
            {t('common.add_to_playlist')}
          </button>
          
          {playlists.slice(0, 5).map(p => (
            <button 
              key={p.id}
              onClick={() => handleAddToPlaylist(p.id)}
              className="flex items-center gap-3 p-2 mx-1 hover:bg-white/5 rounded-lg transition-colors text-left"
            >
              {p.coverArt ? (
                <img src={getCoverArtUrl(p.coverArt, 100)} alt="" className="w-8 h-8 rounded object-cover shadow-sm" />
              ) : (
                <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-secondary">
                  <ListMusic size={14} />
                </div>
              )}
              <span className="text-sm font-semibold text-white truncate flex-1">{p.name}</span>
            </button>
          ))}
          {playlists.length === 0 && (
            <div className="text-secondary text-xs text-center py-4">{t('common.no_playlists_found')}</div>
          )}
          
          <form onSubmit={handleCreatePlaylistInline} className="flex gap-2 mt-2 px-2">
            <input 
              type="text" 
              placeholder={t('common.new_playlist')} 
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors min-w-0"
            />
            <button 
              type="submit"
              disabled={!newPlaylistName.trim()}
              className="px-3 py-1.5 bg-white/10 text-white font-semibold rounded-lg disabled:opacity-50 hover:bg-white/20 transition-colors"
            >
              <Plus size={14} />
            </button>
          </form>

          {playlists.length > 0 && (
            <button onClick={handleOpenPlaylistModal} className="w-[calc(100%-16px)] mx-2 py-2 mt-2 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold rounded-lg transition-colors">
              {t('common.show_all_playlists')}
            </button>
          )}
        </div>
      ) : type !== 'playlist' ? (
        <>
          <div className="py-1">
            <ItemBtn icon={Play} label={t('common.play_now')} onClick={() => handleAction(onPlayNow)} />
            <ItemBtn icon={ListPlus} label={t('common.play_next')} onClick={() => handleAction(onPlayNext)} />
            {!isInQueue && <ItemBtn icon={SkipForward} label={t('common.add_to_queue')} onClick={() => handleAction(onAddToQueue)} />}
            {item.playlistId ? (
              <ItemBtn icon={ListMinus} label={t('common.remove_from_playlist', 'Убрать из плейлиста')} onClick={handleRemoveFromPlaylist} color="text-red-500 hover:text-red-400" />
            ) : (
              <ItemBtn icon={ListMusic} label={t('common.add_to_playlist')} onClick={onShowPlaylists} />
            )}
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
                <ItemBtn 
                  icon={Ban} 
                  label={isExcluded ? t('common.unignore', 'Убрать из игнора') : t('common.ignore', 'В игнор')} 
                  onClick={() => handleAction(onExclude)} 
                  color={isExcluded ? "text-red-500" : "text-white"} 
                />
                
                {/* Rating inline */}
                <div className="flex items-center justify-between px-4 py-2 hover:bg-foreground/10 transition-colors cursor-default">
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
                {isDownloaded ? (
                  <ItemBtn icon={Trash2} color="text-primary font-bold" label={t('common.remove_download')} onClick={() => handleAction(onRemoveDownload)} />
                ) : (
                  <ItemBtn icon={Download} label={t('common.download')} onClick={() => handleAction(onDownload)} />
                )}
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
        </>
      ) : null}

      {type === 'playlist' && (
        <div className="py-1">
          <ItemBtn icon={Play} label={t('common.open', 'Открыть')} onClick={() => handleAction(() => { navigate(`/Holad/playlist/${item.id}`); })} />
          <ItemBtn icon={Share2} label={isCopied ? t('common.copied') : t('common.share')} onClick={() => handleAction(() => {
            const shareUrl = `${getShareUrl()}/jam/?playlist=${item.id}`;
            navigator.clipboard.writeText(shareUrl);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
          }, false)} color={isCopied ? "text-primary font-bold" : "text-white"} />
          <div className="py-1 border-t border-white/10">
            <ItemBtn icon={Trash2} label={t('common.delete', 'Удалить')} onClick={async () => {
              if (window.confirm(t('common.delete_playlist_confirm', 'Вы уверены, что хотите удалить плейлист?'))) {
                try {
                  if (item.isCustom) {
                    usePlaylistStore.getState().deletePlaylist(item.id);
                  } else {
                    const { deletePlaylist } = await import('../../api/subsonic/playlists');
                    await deletePlaylist(item.id);
                  }
                  window.dispatchEvent(new CustomEvent('playlists-updated'));
                  setTimeout(() => window.location.reload(), 300);
                } catch(e) { console.error(e); }
                closeMenu();
              }
            }} color="text-red-500 hover:text-red-400" />
          </div>
        </div>
      )}
    </div>
    </>,
    document.body
  );
}
