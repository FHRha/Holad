import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Share, Shuffle, Trash2, Play, RefreshCw, ListPlus, UsersRound, Radio, LogOut, Check, ListMusic } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../common/dnd/SortableItem';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useUIStore } from '../../store/uiStore';
import { jamSocket } from '../../api/socket';
import { toast } from 'sonner';
import { getShareUrl } from '../../utils/serverConfig';
import { handleDownload } from '../../utils/downloadHelper';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';
import { getCoverArtUrl } from '../../api/subsonic';
import { fetchPlaybackState } from '../../api/playbackState';
import LongPressWrapper from '../common/LongPressWrapper';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import AddToPlaylistModal from '../common/AddToPlaylistModal';
import LoadingSpinner from '../common/LoadingSpinner';
import { SocialPanel, AudioModeToggle, useSocialState } from '../social';

export default function RightSidebar() {
  const { t } = useTranslation();
  const { queue, currentIndex, playTrack, toggleShuffle, clearQueue, isProcessing, setQueue, setCurrentIndex, roomId, participants } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const { rightSidebarWidth, setRightSidebarWidth } = useUIStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const downloads = useDownloadStore(state => state.downloads);

  const [activeTab, setActiveTab] = useState<'queue' | 'social'>('queue');
  const { currentNick, audioMode, setAudioMode, hasNotifications } = useSocialState();

  const handleRestoreQueue = async () => {
    try {
      const q = await fetchPlaybackState();
      if (q && q.queue && q.queue.length > 0) {
        const mapped = q.queue.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          artistId: t.artistId,
          coverArt: t.coverArt || getCoverArtUrl(t.id, 300),
          duration: t.duration,
          bitRate: t.bitRate,
          suffix: t.suffix
        }));
        setQueue(mapped);
        const currentId = q.song_id;
        if (currentId) {
          const idx = mapped.findIndex((t: any) => t.id === currentId);
          if (idx !== -1) setCurrentIndex(idx);
        } else if (typeof q.current_index === 'number' && q.current_index >= 0 && q.current_index < mapped.length) {
          setCurrentIndex(q.current_index);
        }
      }
    } catch (e) {
      console.error('Failed to restore queue', e);
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDownloadAlbum = () => {
    if (queue.length === 0 || currentIndex === -1) return;
    const currentTrack = queue[currentIndex];
    if (!currentTrack) return;
    const albumIdToDownload = currentTrack.albumId;
    if (albumIdToDownload) {
      handleDownload(albumIdToDownload, queue[currentIndex]?.album || 'album', 'album');
    }
    setShowShareMenu(false);
  };

  const handleShareAlbum = async () => {
    if (queue.length === 0 || currentIndex === -1) return;
    const currentTrack = queue[currentIndex];
    if (!currentTrack) return;
    
    const origin = getShareUrl();
    const url = `${origin}/jam/?album=${currentTrack.albumId || currentTrack.album}`;
      
    await navigator.clipboard.writeText(url);
    setCopiedKey('album');
    toast.success(t('common.album_link_copied', 'Ссылка на альбом скопирована!'));
    setTimeout(() => {
      setCopiedKey(null);
      setShowShareMenu(false);
    }, 2000);
  };

  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = rightSidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = startWidth.current - (e.clientX - startX.current);
      if (newWidth < 40) {
         setRightSidebarWidth(0);
         isResizing.current = false;
         document.body.style.cursor = 'default';
         document.body.style.userSelect = '';
      } else if (newWidth < 200) {
         setRightSidebarWidth(80); // Snap to small mode
      } else {
         const maxWidth = Math.min(500, window.innerWidth * 0.35);
         setRightSidebarWidth(Math.min(newWidth, maxWidth));
      }
    };
    
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [rightSidebarWidth, setRightSidebarWidth]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 200;
    if (bottom && visibleCount < queue.length) {
      setVisibleCount(prev => prev + 50);
    }
  };

  useEffect(() => {
    const activeEl = document.getElementById(`queue-item-${currentIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  const handleContextMenu = (e: React.MouseEvent, track: any, idx: number) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, { ...track, queueIndex: idx }, 'track');
  };

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);

  if (rightSidebarWidth === 0) return null;

  const isSmall = rightSidebarWidth <= 100;

  return (
    <>
      <AddToPlaylistModal 
        isOpen={isPlaylistModalOpen} 
        onClose={() => setIsPlaylistModalOpen(false)} 
        trackIds={queue.map((t: any) => t.id)} 
      />
      <div 
        className={`hidden md:flex flex-col h-full text-sm relative z-[60] flex-shrink-0 transition-[max-width,background-color] ${isSmall ? 'bg-gradient-to-r from-transparent to-background/90 border-l border-transparent' : 'bg-background border-l border-neutral-200 dark:border-white/5'}`}
        style={{ width: rightSidebarWidth, maxWidth: '35vw' }}
      >
        <div 
          className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-foreground/10 active:bg-white/20 transition-colors z-20"
          onMouseDown={handleMouseDown}
        />

        {!isSmall && (
          <>
            <div className="p-3.5 flex items-center justify-between text-secondary border-b border-neutral-200 dark:border-white/5">
              {activeTab === 'queue' ? (
                <div className="flex items-center gap-3">
                  <div className="relative flex" ref={shareRef}>
                    <button className="hover:text-foreground transition-colors" title={t('common.album_actions')} onClick={() => setShowShareMenu(!showShareMenu)}>
                      <Share size={16} />
                    </button>
                    {showShareMenu && (
                      <div className="absolute top-full left-0 mt-2 py-1 bg-card border border-neutral-200 dark:border-white/10 rounded-lg shadow-2xl z-[60] flex flex-col min-w-[180px]">
                        <button onClick={handleDownloadAlbum} className="text-left px-4 py-2 hover:bg-foreground/10 text-sm text-foreground font-medium transition-colors flex items-center gap-3 whitespace-nowrap">
                          <Download size={18} className="shrink-0" /> {t('common.download_album')}
                        </button>
                        <button onClick={handleShareAlbum} className={`text-left px-4 py-2 hover:bg-foreground/10 text-sm font-medium transition-colors border-t border-neutral-200 dark:border-white/10 flex items-center gap-3 whitespace-nowrap ${copiedKey === 'album' ? 'text-primary' : 'text-foreground'}`}>
                          {copiedKey === 'album' ? <Check size={18} className="shrink-0 text-primary" /> : <Share size={18} className="shrink-0" />} {copiedKey === 'album' ? t('common.copied') : t('common.share_album_track', 'Поделиться альбомом трека')}
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="hover:text-foreground transition-colors" title={t('common.shuffle')} onClick={toggleShuffle}><Shuffle size={18} /></button>
                  <button className="hover:text-foreground transition-colors" title={t('common.save_queue_to_playlist')} onClick={() => setIsPlaylistModalOpen(true)}><ListPlus size={18} /></button>
                  <button className="hover:text-foreground transition-colors" title={t('common.restore_queue_from_server', 'Восстановить очередь с сервера')} onClick={handleRestoreQueue}><RefreshCw size={18} /></button>
                  <button className="hover:text-foreground transition-colors" title={t('common.clear_queue')} onClick={clearQueue}><Trash2 size={18} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <UsersRound size={17} className="text-primary" />
                  <span className="font-bold text-sm text-foreground">{t('social.tab_friends')}</span>
                </div>
              )}

              <button
                onClick={() => setActiveTab(activeTab === 'queue' ? 'social' : 'queue')}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-semibold ${
                  activeTab === 'social'
                    ? 'bg-primary/20 text-primary'
                    : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground'
                }`}
                title={activeTab === 'queue' ? t('social.tab_friends') : t('social.tab_queue')}
              >
                {activeTab === 'queue' ? (
                  <>
                    <UsersRound size={15} />
                    <span>{t('social.tab_friends_button', 'Друзья')}</span>
                  </>
                ) : (
                  <>
                    <ListMusic size={15} />
                    <span>{t('social.tab_queue', 'Очередь')}</span>
                  </>
                )}
                {hasNotifications && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            </div>

            {activeTab === 'queue' && (
              <div className="flex pl-4 pr-8 py-2 text-xs font-semibold tracking-wider text-secondary border-b border-neutral-200 dark:border-white/5 uppercase">
                <div className="w-8">#</div>
                <div className="flex-1">{t('player.title')}</div>
                <div className="w-10 text-right"><Clock size={14} className="inline-block" /></div>
              </div>
            )}
          </>
        )}

        {isSmall && (
          <div className="p-2 flex justify-center border-b border-neutral-200 dark:border-white/5">
            <button
              onClick={() => setActiveTab(activeTab === 'queue' ? 'social' : 'queue')}
              className={`relative p-2 rounded-lg transition-colors ${
                activeTab === 'social'
                  ? 'bg-primary/20 text-primary'
                  : 'hover:bg-foreground/10 text-secondary hover:text-foreground'
              }`}
              title={activeTab === 'queue' ? t('social.tab_friends') : t('social.tab_queue')}
            >
              <UsersRound size={18} />
              {hasNotifications && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </button>
          </div>
        )}

        {activeTab === 'social' && !isSmall ? (
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 space-y-4 hide-scrollbar">
            {roomId ? (
              <div className="bg-neutral-100 dark:bg-[#141414] rounded-2xl p-3.5 shadow-sm space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-foreground uppercase tracking-wider whitespace-nowrap">
                      {t('social.active_jam')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-secondary">
                    <UsersRound size={13} className="text-secondary opacity-80 shrink-0" />
                    <span>{t('social.in_jam_with', { count: participants.length || 1 })}</span>
                  </div>
                </div>

                <AudioModeToggle audioMode={audioMode} onSetAudioMode={setAudioMode} variant="sidebar" />

                <button
                  type="button"
                  onClick={() => jamSocket.leaveRoom()}
                  className="w-full py-2 px-3 text-xs text-red-400 hover:text-red-300 flex items-center justify-center gap-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors font-semibold whitespace-nowrap"
                  title={t('social.leave_jam')}
                >
                  <LogOut size={13} />
                  <span>{t('social.leave_jam')}</span>
                </button>
              </div>
            ) : (
              <div className="bg-neutral-100 dark:bg-[#141414] rounded-2xl p-3.5 shadow-sm space-y-3">
                <button
                  onClick={() => jamSocket.createRoom(currentNick)}
                  className="w-full py-2.5 px-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.25)] hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Radio size={16} />
                  <span>{t('social.create_jam')}</span>
                </button>

                <AudioModeToggle audioMode={audioMode} onSetAudioMode={setAudioMode} variant="sidebar" />
              </div>
            )}

            <SocialPanel variant="sidebar" />
          </div>
        ) : (
          <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isSmall ? 'p-1' : 'p-2'} space-y-1 relative`} onScroll={handleScroll}>
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                <LoadingSpinner size="md" />
              </div>
            )}
            <SortableContext 
              items={queue.slice(0, visibleCount).map((t: any, idx: number) => `${t.id}-${idx}`)}
              strategy={verticalListSortingStrategy}
            >
              {queue.slice(0, visibleCount).map((track: any, idx: number) => {
                const isPlaying = idx === currentIndex;
                const sortableId = `${track.id}-${idx}`;
                return (
                  <SortableItem key={sortableId} id={sortableId}>
                    {({ setNodeRef, attributes, listeners, style, isDragging }: any) => (
                      <LongPressWrapper 
                        ref={setNodeRef}
                        style={style}
                        id={`queue-item-${idx}`}
                        {...attributes}
                        {...listeners}
                        onClick={() => playTrack(idx)}
                        onLongPress={(e: any) => handleContextMenu(e, track, idx)}
                        className={`flex items-center ${isSmall ? 'justify-center p-1 hover:scale-105 transition-transform' : `px-2 py-2 rounded-md ${isPlaying ? 'bg-foreground/10' : 'hover:bg-foreground/5'}`} cursor-grab active:cursor-grabbing group ${isDragging ? 'opacity-30' : ''}`}
                        title={isSmall ? `${track.title} • ${formatArtistName(track.artist)}` : undefined}
                      >
                        {!isSmall && (
                          <div className="w-6 flex justify-center text-secondary text-xs select-none pointer-events-none">
                            {isPlaying ? <Play size={12} className="text-primary stroke-none" fill="currentColor" /> : idx + 1}
                          </div>
                        )}
                        <div className={`relative group rounded overflow-hidden shadow-sm flex-shrink-0 ${isSmall ? 'w-14 h-14' : 'w-10 h-10 mx-2'}`}>
                          <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId || track.id, 100)} className="w-full h-full rounded object-cover pointer-events-none" alt="" trackId={track.id} />
                          {isSmall && (
                            <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} pointer-events-none`}>
                              <Play size={16} className={isPlaying ? "text-primary stroke-none" : "text-foreground stroke-none"} fill="currentColor" />
                            </div>
                          )}
                        </div>
                        {!isSmall && (
                          <>
                            <div className="flex-1 min-w-0 flex flex-col justify-center select-none pointer-events-none">
                              <p className={`flex items-center gap-2 truncate text-sm font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>
                                <span className="truncate">{track.title}</span>
                                {isItemDownloaded(downloads, track.id, track.albumId, track) && <Download size={14} className="text-primary shrink-0" />}
                              </p>
                              <p className="truncate text-xs text-secondary">{formatArtistName(track.artist)}</p>
                            </div>
                            <div className="w-10 text-right text-xs text-secondary select-none pointer-events-none">
                              {formatTime(track.duration)}
                            </div>
                          </>
                        )}
                      </LongPressWrapper>
                    )}
                  </SortableItem>
                );
              })}
            </SortableContext>
            {queue.length === 0 && !isSmall && (
              <div className="text-center mt-10 text-secondary text-sm">{t('player.queue_is_empty')}</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
