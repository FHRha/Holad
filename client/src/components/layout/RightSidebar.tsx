import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Share, Shuffle, Trash2, Play, RefreshCw, ListPlus, UsersRound, Radio, Speaker, Headphones, UserPlus, Check, Copy, LogOut, X, Loader2, Search, Music, ListMusic } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../common/dnd/SortableItem';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useUIStore } from '../../store/uiStore';
import { useSocialStore } from '../../store/socialStore';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';
import { jamSocket } from '../../api/socket';
import { toast } from 'sonner';
import { getShareUrl } from '../../utils/serverConfig';
import { handleDownload } from '../../utils/downloadHelper';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';
import { getCoverArtUrl, getPlayQueue } from '../../api/subsonic';
import LongPressWrapper from '../common/LongPressWrapper';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import AddToPlaylistModal from '../common/AddToPlaylistModal';

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
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [isTagCopied, setIsTagCopied] = useState(false);

  const {
    userName,
    userTag,
    friends,
    pendingRequests,
    activeInvites,
    audioMode,
    searchResults,
    isSearching,
    searchUsers,
    clearSearchResults,
    setAudioMode,
    sendFriendRequest,
    respondFriendRequest,
    inviteFriendToJam,
    removeInvite
  } = useSocialStore();

  const authUser = useAuthStore((s) => s.user);
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const slotId = useDemoStore((s) => s.slotId);
  const guestNick = slotId ? `${t('demo.guest', 'Гость')} #${slotId}` : t('demo.guest', 'Гость');
  const currentNick = isDemoMode
    ? (userName && !userName.toLowerCase().includes(authUser?.toLowerCase() || 'fhr') ? userName : guestNick)
    : (userName || authUser || usePlayerStore.getState().userName || 'User');
  const displayTag = userTag
    ? (userTag.includes('#') ? userTag : `${currentNick}#${userTag}`)
    : `${currentNick}#0000`;

  const isUserInJam = (targetUserId?: string, targetUsername?: string, targetTag?: string) => {
    if (!roomId) return false;
    const myName = isDemoMode ? currentNick : (userName || authUser);
    if (targetUsername && myName && targetUsername.toLowerCase() === myName.toLowerCase()) {
      return true;
    }
    return participants.some((p) => {
      if (targetUserId && p.userId && p.userId === targetUserId) return true;
      if (targetUsername && p.name && p.name.toLowerCase() === targetUsername.toLowerCase()) {
        if (targetTag && p.tag) {
          return p.tag === targetTag;
        }
        return true;
      }
      return false;
    });
  };

  useEffect(() => {
    if (!friendSearchInput.trim()) {
      clearSearchResults();
      return;
    }
    const timer = setTimeout(() => {
      searchUsers(friendSearchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [friendSearchInput, searchUsers, clearSearchResults]);

  const currentTrack = queue[currentIndex];
  const hasNotifications = pendingRequests.incoming.length > 0 || activeInvites.length > 0;

  const handleRestoreQueue = async () => {
    try {
      const q = await getPlayQueue();
      if (q && q.entry) {
        // Map to track format if needed, though subsonic returns similar structure
        const mapped = q.entry.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          artistId: t.artistId,
          coverArt: t.coverArt,
          duration: t.duration,
          bitRate: t.bitRate,
          suffix: t.suffix
        }));
        setQueue(mapped);
        
        // Find current track index by current id if available, or keep 0
        const currentId = q.current;
        if (currentId) {
          const idx = mapped.findIndex((t: any) => t.id === currentId);
          if (idx !== -1) setCurrentIndex(idx);
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
        {/* Resizer */}
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

              {/* View Switch Button */}
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
            {/* Jam Card */}
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

                {/* Audio Mode Selector */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setAudioMode('speaker_dj')}
                    className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
                      audioMode === 'speaker_dj'
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
                        : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'speaker_dj' ? 'bg-primary/25 text-primary' : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'}`}>
                      <Speaker size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_speaker')}
                        </span>
                        {audioMode === 'speaker_dj' && <Check size={13} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_speaker_desc')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioMode('synced_audio')}
                    className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
                      audioMode === 'synced_audio'
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
                        : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'synced_audio' ? 'bg-primary/25 text-primary' : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'}`}>
                      <Headphones size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_headphones')}
                        </span>
                        {audioMode === 'synced_audio' && <Check size={13} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_headphones_desc')}
                      </p>
                    </div>
                  </button>
                </div>

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

                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setAudioMode('speaker_dj')}
                    className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
                      audioMode === 'speaker_dj'
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
                        : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'speaker_dj' ? 'bg-primary/25 text-primary' : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'}`}>
                      <Speaker size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_speaker')}
                        </span>
                        {audioMode === 'speaker_dj' && <Check size={13} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_speaker_desc')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioMode('synced_audio')}
                    className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start gap-2.5 ${
                      audioMode === 'synced_audio'
                        ? 'bg-primary/15 text-foreground ring-1 ring-primary/30 font-semibold shadow-sm'
                        : 'bg-neutral-200/60 dark:bg-[#1c1c1c] hover:bg-neutral-200 dark:hover:bg-[#222222] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'synced_audio' ? 'bg-primary/25 text-primary' : 'bg-neutral-300/50 dark:bg-white/5 text-secondary'}`}>
                      <Headphones size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_headphones')}
                        </span>
                        {audioMode === 'synced_audio' && <Check size={13} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_headphones_desc')}
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Incoming Jam Invites */}
            {activeInvites.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                  {t('deeplink.invite_title')}
                </span>
                {activeInvites.map((inv) => (
                  <div key={inv.roomId} className="bg-neutral-100 dark:bg-[#141414] rounded-2xl p-3 shadow-md space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      {inv.track?.coverArt ? (
                        <img
                          src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                          alt=""
                          className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                          <Radio size={18} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs text-foreground truncate">
                          {inv.fromUser} <span className="text-secondary font-mono text-[10px]">#{inv.fromTag}</span>
                        </div>
                        <div className="text-[11px] text-secondary truncate">
                          {t('social.invited_to_jam_toast', { name: inv.fromUser })}
                        </div>
                        {inv.track?.title && (
                          <div className="text-[11px] text-primary truncate font-medium flex items-center gap-1 mt-0.5">
                            <Music size={11} className="shrink-0" />
                            <span className="truncate">{inv.track.title}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const joinNick = currentNick;
                          jamSocket.joinRoom(inv.roomId, joinNick);
                          removeInvite(inv.roomId);
                        }}
                        className="flex-1 py-1.5 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                      >
                        <Check size={13} />
                        <span>{t('social.accept')}</span>
                      </button>
                      <button
                        onClick={() => removeInvite(inv.roomId)}
                        className="flex-1 py-1.5 bg-neutral-200 dark:bg-[#202020] hover:bg-neutral-300 dark:hover:bg-[#282828] text-foreground font-semibold text-xs rounded-xl transition-colors"
                      >
                        {t('social.decline')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                  {t('social.tab_friends')} ({friends.length})
                </span>
              </div>

              {friends.length === 0 ? (
                <div className="py-7 px-4 rounded-2xl bg-neutral-100 dark:bg-[#141414] text-center flex flex-col items-center justify-center gap-1.5">
                  <div className="w-10 h-10 rounded-full bg-neutral-200/70 dark:bg-white/5 flex items-center justify-center text-secondary mb-1">
                    <UsersRound size={20} />
                  </div>
                  <p className="text-xs font-semibold text-foreground">{t('social.no_friends')}</p>
                  <p className="text-[11px] text-secondary max-w-[210px] leading-relaxed">{t('social.no_friends_desc')}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {friends.map((friend) => {
                    const friendId = friend.user_id || friend.id || '';
                    const inJam = isUserInJam(friendId, friend.username, friend.tag);
                    return (
                      <div
                        key={friendId}
                        className="bg-neutral-100 dark:bg-[#141414] hover:bg-neutral-200/60 dark:hover:bg-[#181818] rounded-xl p-2.5 transition-all flex items-center justify-between gap-2.5 group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold text-xs flex items-center justify-center ring-1 ring-primary/25">
                              {friend.username?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-neutral-100 dark:ring-[#141414] ${
                                friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
                              }`}
                              title={friend.isOnline ? t('social.status_online') : t('social.status_offline')}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1">
                              <span className="font-semibold text-xs text-foreground truncate">{friend.username}</span>
                              <span className="text-[10px] text-secondary font-mono">#{friend.tag}</span>
                            </div>
                            {friend.isOnline && friend.nowPlaying ? (
                              <p className="text-[11px] text-primary truncate flex items-center gap-1 font-medium mt-0.5">
                                <Music size={11} className="shrink-0 animate-pulse" />
                                <span className="truncate">
                                  {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
                                </span>
                              </p>
                            ) : (
                              <p className="text-[10px] text-secondary mt-0.5">
                                {friend.isOnline ? t('social.status_online') : t('social.status_offline')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {roomId && !inJam && (
                            <button
                              onClick={() => inviteFriendToJam(friendId, roomId, currentTrack)}
                              className="p-1.5 px-2.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-lg transition-colors text-xs font-semibold flex items-center gap-1"
                              title={t('social.invite_to_jam')}
                            >
                              <Radio size={13} />
                              <span className="hidden xl:inline text-[11px]">{t('social.invite_to_jam')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add Friend Section */}
            <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-white/5">
              {/* User's own tag display */}
              <div className="flex items-center justify-between p-2.5 bg-neutral-100 dark:bg-[#141414] rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs shrink-0 ring-1 ring-primary/25">
                    {currentNick.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-secondary uppercase font-semibold tracking-wider">{t('social.my_tag')}</span>
                    <span className="font-mono font-bold text-xs text-foreground truncate">{displayTag}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(displayTag);
                    setIsTagCopied(true);
                    toast.success(t('social.tag_copied'));
                    setTimeout(() => setIsTagCopied(false), 2000);
                  }}
                  className="p-1.5 px-2.5 rounded-lg bg-neutral-200/70 dark:bg-[#1e1e1e] hover:bg-neutral-200 dark:hover:bg-[#262626] text-secondary hover:text-foreground transition-all flex items-center gap-1.5 text-xs font-medium shrink-0"
                  title={t('social.copy_tag')}
                >
                  {isTagCopied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                  <span>{isTagCopied ? t('social.tag_copied') : t('social.copy_tag')}</span>
                </button>
              </div>

              {/* Add Friend Search Input */}
              <div className="space-y-2">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!friendSearchInput.trim()) return;
                    await sendFriendRequest(friendSearchInput.trim());
                    toast.success(t('social.sent_request'));
                    setFriendSearchInput('');
                    clearSearchResults();
                  }}
                  className="relative flex items-center w-full bg-neutral-100 dark:bg-[#161616] hover:bg-neutral-200/60 dark:hover:bg-[#1c1c1c] rounded-xl px-3 transition-colors focus-within:ring-1 focus-within:ring-primary/40 focus-within:bg-neutral-200/80 dark:focus-within:bg-[#1a1a1a]"
                >
                  <Search size={14} className="text-secondary pointer-events-none shrink-0 mr-2.5" />
                  <input
                    type="text"
                    placeholder={t('social.search_placeholder')}
                    value={friendSearchInput}
                    onChange={(e) => setFriendSearchInput(e.target.value)}
                    className="flex-1 bg-transparent border-0 outline-none shadow-none py-2 text-xs text-foreground placeholder:text-secondary focus:outline-none focus:ring-0 min-w-0"
                  />
                  {friendSearchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setFriendSearchInput('');
                        clearSearchResults();
                      }}
                      className="p-0.5 text-secondary hover:text-foreground transition-colors shrink-0 ml-1.5"
                    >
                      <X size={13} />
                    </button>
                  )}
                </form>

                {/* Live Search Results List */}
                {friendSearchInput.trim().length > 0 && (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-4 text-xs text-secondary gap-2 bg-neutral-100 dark:bg-[#141414] rounded-xl">
                        <Loader2 size={14} className="animate-spin text-primary" />
                        <span>{t('social.searching')}</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-3.5 text-xs text-secondary bg-neutral-100 dark:bg-[#141414] rounded-xl">
                        {t('social.no_users_found')}
                      </div>
                    ) : (
                      searchResults.map((user) => {
                        const isFriend = friends.some(
                          (f) => (f.user_id && f.user_id === user.user_id) || (f.id && f.id === user.user_id) || (f.username === user.username && f.tag === user.tag)
                        );
                        const isPendingOut = pendingRequests.outgoing.some(
                          (r) => r.toUserId === user.user_id || (r.toUsername === user.username && r.toTag === user.tag)
                        );
                        const isIncoming = pendingRequests.incoming.some(
                          (r) => r.fromUserId === user.user_id || (r.fromUsername === user.username && r.fromTag === user.tag)
                        );
                        const userInJam = isUserInJam(user.user_id, user.username, user.tag);

                        return (
                          <div
                            key={user.user_id}
                            className="p-2.5 bg-neutral-100 dark:bg-[#141414] rounded-xl space-y-2"
                          >
                            {/* User Row */}
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative shrink-0">
                                  {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-xs ring-1 ring-primary/25">
                                      {(user.username || 'U')[0].toUpperCase()}
                                    </div>
                                  )}
                                  {user.isOnline && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-neutral-100 dark:ring-[#141414]" />
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="font-semibold text-xs text-foreground truncate">{user.username}</span>
                                    <span className="text-[10px] text-secondary font-mono shrink-0">#{user.tag}</span>
                                  </div>
                                  <span className={`text-[10px] ${user.isOnline ? 'text-green-500 font-medium' : 'text-secondary'}`}>
                                    {user.isOnline ? t('social.status_online') : t('social.status_offline')}
                                  </span>
                                </div>
                              </div>

                              {isFriend ? (
                                <span className="text-[10px] text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-md flex items-center gap-1 shrink-0">
                                  <Check size={11} />
                                  <span>{t('social.already_friends')}</span>
                                </span>
                              ) : isPendingOut ? (
                                <span className="text-[10px] text-secondary font-medium px-2 py-0.5 bg-neutral-200 dark:bg-white/5 rounded-md flex items-center gap-1 shrink-0">
                                  <Clock size={11} />
                                  <span>{t('social.sent_request')}</span>
                                </span>
                              ) : null}
                            </div>

                            {/* Action Buttons Row */}
                            {(!isFriend && !isPendingOut) || (roomId && !userInJam) ? (
                              <div className="flex items-stretch gap-1.5 pt-1.5 border-t border-neutral-200 dark:border-white/5">
                                {!isFriend && !isPendingOut && (
                                  isIncoming ? (
                                    <button
                                      type="button"
                                      onClick={() => respondFriendRequest(user.user_id, 'accept')}
                                      className="flex-1 h-9 px-2.5 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 whitespace-nowrap"
                                    >
                                      <Check size={13} />
                                      <span>{t('social.accept')}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await sendFriendRequest(`${user.username}#${user.tag}`);
                                        toast.success(t('social.sent_request'));
                                      }}
                                      className="flex-1 h-9 px-2.5 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                                      title={t('social.add_friend')}
                                    >
                                      <UserPlus size={13} />
                                      <span>{t('social.add_friend')}</span>
                                    </button>
                                  )
                                )}

                                {roomId && !userInJam && (
                                  <button
                                    type="button"
                                    onClick={() => inviteFriendToJam(user.user_id, roomId, currentTrack)}
                                    className="flex-1 h-9 px-2.5 bg-neutral-200/80 dark:bg-[#202020] hover:bg-neutral-300 dark:hover:bg-[#262626] text-foreground font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                                    title={t('social.invite_to_jam')}
                                  >
                                    <Radio size={13} className="text-primary" />
                                    <span>{t('social.invite_to_jam')}</span>
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Incoming Requests */}
              {pendingRequests.incoming.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-secondary">
                      {t('social.friend_requests')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                      {pendingRequests.incoming.length}
                    </span>
                  </div>
                  {pendingRequests.incoming.map((req, idx) => {
                    const reqId = req.fromUserId || String(idx);
                    const reqName = req.fromUsername || 'User';
                    const reqTag = req.fromTag ? `#${req.fromTag}` : '';
                    return (
                      <div
                        key={reqId}
                        className="bg-neutral-100 dark:bg-[#141414] rounded-xl p-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-foreground truncate">{reqName}</div>
                          <div className="text-[10px] text-secondary font-mono truncate">{reqTag}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => { if (req.fromUserId) respondFriendRequest(req.fromUserId, 'accept'); }}
                            className="p-1.5 px-2 bg-primary text-black rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1 text-xs font-semibold"
                            title={t('social.accept')}
                          >
                            <Check size={13} />
                            <span>{t('social.accept')}</span>
                          </button>
                          <button
                            onClick={() => { if (req.fromUserId) respondFriendRequest(req.fromUserId, 'decline'); }}
                            className="p-1.5 bg-neutral-200 dark:bg-[#222222] hover:bg-neutral-300 dark:hover:bg-[#2a2a2a] text-foreground rounded-lg transition-colors"
                            title={t('social.decline')}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Queue List */
          <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isSmall ? 'p-1' : 'p-2'} space-y-1 relative`} onScroll={handleScroll}>
            {isProcessing && (
              <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-sm flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
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
                                {isItemDownloaded(downloads, track.id, track.albumId) && <Download size={14} className="text-primary shrink-0" />}
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
