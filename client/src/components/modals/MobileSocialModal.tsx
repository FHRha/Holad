import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { 
  UsersRound, Radio, Copy, Check, Search, X, Loader2, 
  UserPlus, Clock, Music, Speaker, Headphones
} from 'lucide-react';
import { useSocialStore } from '../../store/socialStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';
import { jamSocket } from '../../api/socket';
import { toast } from 'sonner';
import { getCoverArtUrl } from '../../api/subsonic';
import JamSessionControl from '../jam/JamSessionControl';

interface MobileSocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'friends' | 'jam';
}

export default function MobileSocialModal({ isOpen, onClose, defaultTab = 'friends' }: MobileSocialModalProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const dragMode = useRef<'pointer' | 'touch' | null>(null);
  const isClosing = useRef(false);
  const isContentDragging = useRef(false);
  const contentStartY = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<'friends' | 'jam'>(defaultTab);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [isTagCopied, setIsTagCopied] = useState(false);

  const handleClose = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    if (menuRef.current) {
      menuRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => {
        onClose();
        isClosing.current = false;
      }, 200);
    } else {
      onClose();
      isClosing.current = false;
    }
  };

  const startDrag = (clientY: number, mode: 'pointer' | 'touch', pointerId?: number, target?: HTMLElement) => {
    if (isClosing.current) return;
    dragMode.current = mode;
    isDragging.current = true;
    dragStartY.current = clientY;
    if (menuRef.current) {
      menuRef.current.style.transition = 'none';
    }
    if (mode === 'pointer' && pointerId !== undefined && target?.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId);
      } catch {}
    }
  };

  const updateDrag = (clientY: number) => {
    if (!isDragging.current || dragStartY.current === null || !menuRef.current) return;
    const delta = clientY - dragStartY.current;
    if (delta > 0) {
      menuRef.current.style.transform = `translateY(${delta}px)`;
    } else {
      menuRef.current.style.transform = `translateY(${Math.max(delta * 0.25, -30)}px)`;
    }
  };

  const endDrag = (clientY?: number) => {
    if (!isDragging.current || dragStartY.current === null || !menuRef.current) {
      dragMode.current = null;
      isDragging.current = false;
      return;
    }
    const finalY = clientY ?? dragStartY.current;
    const delta = finalY - dragStartY.current;
    dragStartY.current = null;
    dragMode.current = null;
    isDragging.current = false;

    if (delta > 75) {
      handleClose();
    } else {
      menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(0px)';
    }
  };

  const cancelDrag = () => {
    if (!isDragging.current) return;
    dragStartY.current = null;
    dragMode.current = null;
    isDragging.current = false;
    if (menuRef.current) {
      menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(0px)';
    }
  };

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

  const { roomId, queue, currentIndex, participants } = usePlayerStore();
  const currentTrack = queue[currentIndex];

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

  const hasFriendNotifications = pendingRequests.incoming.length > 0 || activeInvites.length > 0;

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;
    isClosing.current = false;
    if (menuRef.current) {
      menuRef.current.style.transform = 'translateY(0px)';
    }
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Debounced search for friends
  useEffect(() => {
    if (!friendSearchInput.trim()) {
      clearSearchResults();
      return;
    }
    const timer = setTimeout(() => {
      searchUsers(friendSearchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [friendSearchInput, searchUsers, clearSearchResults]);

  // Check if a user is currently in the active Jam room
  const isUserInJam = (friendId: string, username: string, tag?: string) => {
    if (!roomId) return false;
    const myName = isDemoMode ? currentNick : (userName || authUser);
    if (username && myName && username.toLowerCase() === myName.toLowerCase()) {
      return true;
    }
    return participants.some(
      (p) => (p.userId && p.userId === friendId) || (p.name === username && (!tag || p.tag === tag))
    );
  };

  const handleCopyTag = async () => {
    try {
      await navigator.clipboard.writeText(displayTag);
      setIsTagCopied(true);
      toast.success(t('social.tag_copied', 'Тег скопирован!'));
      setTimeout(() => setIsTagCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998] animate-in fade-in duration-200 md:hidden"
        onClick={handleClose}
      />
      
      {/* Bottom Sheet */}
      <div 
        ref={menuRef}
        className="fixed z-[9999] bottom-0 left-0 right-0 bg-[#161616] border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)] overflow-hidden pb-6 animate-in slide-in-from-bottom-full duration-300 md:hidden flex flex-col will-change-transform"
        style={{ 
          maxHeight: '90vh',
          height: '88vh'
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header Draggable Zone */}
        <div 
          className="touch-none select-none shrink-0 bg-[#161616]"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, textarea, a, select')) return;
            startDrag(e.clientY, 'pointer', e.pointerId, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (dragMode.current === 'pointer') updateDrag(e.clientY);
          }}
          onPointerUp={(e) => {
            if (dragMode.current === 'pointer') endDrag(e.clientY);
          }}
          onPointerCancel={() => {
            if (dragMode.current === 'pointer') cancelDrag();
          }}
          onTouchStart={(e) => {
            if (dragMode.current === 'pointer') return;
            if ((e.target as HTMLElement).closest('button, input, textarea, a, select')) return;
            startDrag(e.touches[0].clientY, 'touch');
          }}
          onTouchMove={(e) => {
            if (dragMode.current === 'touch' && isDragging.current) {
              if (e.cancelable) e.preventDefault();
              updateDrag(e.touches[0].clientY);
            }
          }}
          onTouchEnd={(e) => {
            if (dragMode.current === 'touch') endDrag(e.changedTouches[0]?.clientY);
          }}
          onTouchCancel={() => {
            if (dragMode.current === 'touch') cancelDrag();
          }}
        >
          {/* Dedicated Top Drag Handle */}
          <div className="w-full pt-3 pb-2 flex items-center justify-center cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-white/30 rounded-full hover:bg-white/50 transition-colors" />
          </div>

          {/* Header Row with Title and Close Button */}
          <div className="px-4 pb-2.5 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-primary" />
              <h2 className="font-bold text-base text-foreground">
                {t('social.tab_friends', 'Jam & Друзья')}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-secondary hover:text-foreground transition-all"
              aria-label={t('common.close', 'Закрыть')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Bar Switcher */}
        <div className="px-4 py-2.5 shrink-0 border-b border-white/5 bg-[#161616]">
          <div className="flex bg-[#222222] p-1 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
                activeTab === 'friends'
                  ? 'bg-primary text-black shadow-md'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              <UsersRound size={16} />
              <span>{t('social.tab_friends_button', 'Друзья')}</span>
              {friends.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'friends' ? 'bg-black/20 text-black' : 'bg-white/10 text-secondary'
                }`}>
                  {friends.length}
                </span>
              )}
              {hasFriendNotifications && (
                <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#222222] animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('jam')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
                activeTab === 'jam'
                  ? 'bg-primary text-black shadow-md'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              <Radio size={16} />
              <span>{t('social.tab_jam', 'Jam-сессия')}</span>
              {roomId && (
                <span className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-[#222222] animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4 hide-scrollbar overscroll-y-contain"
          onTouchStart={(e) => {
            if (contentRef.current && contentRef.current.scrollTop <= 0) {
              contentStartY.current = e.touches[0].clientY;
              isContentDragging.current = false;
            } else {
              contentStartY.current = null;
            }
          }}
          onTouchMove={(e) => {
            if (contentStartY.current === null || !contentRef.current || !menuRef.current) return;
            if (contentRef.current.scrollTop <= 0) {
              const delta = e.touches[0].clientY - contentStartY.current;
              if (delta > 0) {
                if (e.cancelable) e.preventDefault();
                isContentDragging.current = true;
                menuRef.current.style.transition = 'none';
                menuRef.current.style.transform = `translateY(${delta}px)`;
              }
            }
          }}
          onTouchEnd={(e) => {
            if (!isContentDragging.current || contentStartY.current === null || !menuRef.current) {
              contentStartY.current = null;
              isContentDragging.current = false;
              return;
            }
            const finalY = e.changedTouches[0]?.clientY ?? contentStartY.current;
            const delta = finalY - contentStartY.current;
            contentStartY.current = null;
            isContentDragging.current = false;

            if (delta > 75) {
              handleClose();
            } else {
              menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
              menuRef.current.style.transform = 'translateY(0px)';
            }
          }}
          onTouchCancel={() => {
            if (isContentDragging.current && menuRef.current) {
              menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
              menuRef.current.style.transform = 'translateY(0px)';
            }
            contentStartY.current = null;
            isContentDragging.current = false;
          }}
        >
          {activeTab === 'friends' ? (
            <>
              {/* My Tag Card */}
              <div className="flex items-center justify-between p-3 bg-[#1e1e1e] border border-white/5 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0 ring-1 ring-primary/30">
                    {currentNick.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">{t('social.my_tag', 'Мой тег')}</span>
                    <span className="font-mono font-bold text-sm text-foreground truncate">{displayTag}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyTag}
                  className="p-2 px-3 rounded-xl bg-[#282828] hover:bg-[#323232] text-foreground transition-all flex items-center gap-1.5 text-xs font-semibold shrink-0 active:scale-95"
                  title={t('social.copy_tag', 'Скопировать тег')}
                >
                  {isTagCopied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                  <span>{isTagCopied ? t('social.tag_copied', 'Скопирован!') : t('social.copy_tag', 'Копировать')}</span>
                </button>
              </div>

              {/* Incoming Jam Invites */}
              {activeInvites.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary px-1 flex items-center gap-1">
                    <Radio size={12} /> {t('deeplink.invite_title', 'Приглашение в Jam-сессию')}
                  </span>
                  {activeInvites.map((inv) => (
                    <div key={inv.roomId} className="bg-[#1e1e1e] border border-primary/25 rounded-2xl p-3 shadow-md space-y-2.5">
                      <div className="flex items-center gap-3">
                        {inv.track?.coverArt ? (
                          <img
                            src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                            alt=""
                            className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-white/10"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                            <Radio size={20} />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs text-foreground truncate">
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
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => {
                            const joinNick = userName || authUser || usePlayerStore.getState().userName || 'User';
                            jamSocket.joinRoom(inv.roomId, joinNick);
                            removeInvite(inv.roomId);
                            setActiveTab('jam');
                          }}
                          className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1 active:scale-95 shadow-md"
                        >
                          <Check size={14} />
                          <span>{t('social.accept', 'Принять')}</span>
                        </button>
                        <button
                          onClick={() => removeInvite(inv.roomId)}
                          className="flex-1 py-2 bg-[#2a2a2a] hover:bg-[#333333] text-foreground font-semibold text-xs rounded-xl transition-colors active:scale-95"
                        >
                          {t('social.decline', 'Отклонить')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Incoming Friend Requests */}
              {pendingRequests.incoming.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                    {t('social.incoming_requests', 'Входящие заявки')} ({pendingRequests.incoming.length})
                  </span>
                  <div className="space-y-1.5">
                    {pendingRequests.incoming.map((req, idx) => (
                      <div key={req.fromUserId || idx} className="p-3 bg-[#1e1e1e] border border-white/5 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                            {(req.fromUsername || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-foreground truncate">{req.fromUsername}</span>
                            <span className="text-[10px] text-secondary font-mono">#{req.fromTag}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => respondFriendRequest(req.fromUserId || '', 'accept')}
                            className="p-1.5 px-3 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center gap-1 active:scale-95"
                          >
                            <Check size={13} />
                            <span>{t('social.accept', 'Принять')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => respondFriendRequest(req.fromUserId || '', 'decline')}
                            className="p-1.5 px-2.5 bg-[#2a2a2a] hover:bg-[#333333] text-secondary hover:text-foreground text-xs rounded-xl transition-colors"
                          >
                            {t('social.decline', 'Отклонить')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Friend Input & Live Search */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.add_friend', 'Добавить в друзья')}
                </span>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!friendSearchInput.trim()) return;
                    await sendFriendRequest(friendSearchInput.trim());
                    toast.success(t('social.sent_request', 'Запрос отправлен'));
                    setFriendSearchInput('');
                    clearSearchResults();
                  }}
                  className="relative flex items-center w-full bg-[#1e1e1e] border border-white/10 rounded-2xl px-3.5 transition-colors focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-transparent"
                >
                  <Search size={16} className="text-secondary pointer-events-none shrink-0 mr-2.5" />
                  <input
                    type="text"
                    placeholder={t('social.search_placeholder', 'Поиск по нику или Ник#Тег...')}
                    value={friendSearchInput}
                    onChange={(e) => setFriendSearchInput(e.target.value)}
                    className="flex-1 bg-transparent border-0 outline-none py-3 text-xs text-foreground placeholder:text-secondary min-w-0"
                  />
                  {friendSearchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setFriendSearchInput('');
                        clearSearchResults();
                      }}
                      className="p-1 text-secondary hover:text-foreground transition-colors shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </form>

                {/* Search Results Dropdown */}
                {friendSearchInput.trim().length > 0 && (
                  <div className="space-y-2 bg-[#1b1b1b] border border-white/10 rounded-2xl p-2 max-h-64 overflow-y-auto">
                    {isSearching ? (
                      <div className="flex items-center justify-center py-4 text-xs text-secondary gap-2">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        <span>{t('social.searching', 'Поиск...')}</span>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-4 text-xs text-secondary">
                        {t('social.no_users_found', 'Пользователи не найдены')}
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
                          <div key={user.user_id} className="p-2.5 bg-[#242424] rounded-xl space-y-2">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="relative shrink-0">
                                  {user.avatar_url ? (
                                    <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                                      {(user.username || 'U')[0].toUpperCase()}
                                    </div>
                                  )}
                                  {user.isOnline && (
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-[#242424]" />
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-baseline gap-1 min-w-0">
                                    <span className="font-semibold text-xs text-foreground truncate">{user.username}</span>
                                    <span className="text-[10px] text-secondary font-mono shrink-0">#{user.tag}</span>
                                  </div>
                                  <span className={`text-[10px] ${user.isOnline ? 'text-green-400 font-medium' : 'text-secondary'}`}>
                                    {user.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                                  </span>
                                </div>
                              </div>

                              {isFriend ? (
                                <span className="text-[10px] text-primary font-medium px-2 py-0.5 bg-primary/10 rounded-md flex items-center gap-1 shrink-0">
                                  <Check size={11} />
                                  <span>{t('social.already_friends', 'Уже в друзьях')}</span>
                                </span>
                              ) : isPendingOut ? (
                                <span className="text-[10px] text-secondary font-medium px-2 py-0.5 bg-white/5 rounded-md flex items-center gap-1 shrink-0">
                                  <Clock size={11} />
                                  <span>{t('social.sent_request', 'Запрос отправлен')}</span>
                                </span>
                              ) : null}
                            </div>

                            {/* Action Buttons Row */}
                            {(!isFriend && !isPendingOut) || (roomId && !userInJam) ? (
                              <div className="flex items-stretch gap-1.5 pt-1.5 border-t border-white/5">
                                {!isFriend && !isPendingOut && (
                                  isIncoming ? (
                                    <button
                                      type="button"
                                      onClick={() => respondFriendRequest(user.user_id, 'accept')}
                                      className="flex-1 py-2 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"
                                    >
                                      <Check size={13} />
                                      <span>{t('social.accept', 'Принять')}</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await sendFriendRequest(`${user.username}#${user.tag}`);
                                        toast.success(t('social.sent_request', 'Запрос отправлен'));
                                      }}
                                      className="flex-1 py-2 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                      <UserPlus size={13} />
                                      <span>{t('social.add_friend', 'Добавить в друзья')}</span>
                                    </button>
                                  )
                                )}

                                {roomId && !userInJam && (
                                  <button
                                    type="button"
                                    onClick={() => inviteFriendToJam(user.user_id, roomId, currentTrack)}
                                    className="flex-1 py-2 bg-[#303030] hover:bg-[#383838] text-foreground font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <Radio size={13} className="text-primary" />
                                    <span>{t('social.invite_to_jam', 'Позвать в Jam')}</span>
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

              {/* Friends List */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.tab_friends', 'Друзья')} ({friends.length})
                </span>

                {friends.length === 0 ? (
                  <div className="py-8 px-4 rounded-2xl bg-[#1e1e1e] border border-white/5 text-center flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-secondary mb-1">
                      <UsersRound size={24} />
                    </div>
                    <p className="text-sm font-bold text-foreground">{t('social.no_friends', 'У вас пока нет друзей')}</p>
                    <p className="text-xs text-secondary max-w-xs leading-relaxed">
                      {t('social.no_friends_desc', 'Добавьте друзей по их тегу, чтобы слушать музыку вместе!')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((friend) => {
                      const friendId = friend.user_id || friend.id || '';
                      const inJam = isUserInJam(friendId, friend.username, friend.tag);

                      return (
                        <div
                          key={friendId}
                          className="bg-[#1e1e1e] border border-white/5 hover:border-white/10 rounded-2xl p-3 transition-all flex items-center justify-between gap-3 shadow-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0">
                              <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center ring-1 ring-primary/30">
                                {friend.username?.charAt(0)?.toUpperCase() || 'U'}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-[#1e1e1e] ${
                                  friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
                                }`}
                                title={friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1">
                                <span className="font-bold text-sm text-foreground truncate">{friend.username}</span>
                                <span className="text-[11px] text-secondary font-mono">#{friend.tag}</span>
                              </div>
                              {friend.isOnline && friend.nowPlaying ? (
                                <p className="text-[11px] text-primary truncate flex items-center gap-1 font-medium mt-0.5">
                                  <Music size={11} className="shrink-0 animate-pulse" />
                                  <span className="truncate">
                                    {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
                                  </span>
                                </p>
                              ) : (
                                <p className="text-[11px] text-secondary mt-0.5">
                                  {friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {roomId && !inJam && (
                              <button
                                onClick={() => inviteFriendToJam(friendId, roomId, currentTrack)}
                                className="p-2 px-3 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors text-xs font-bold flex items-center gap-1 active:scale-95"
                                title={t('social.invite_to_jam', 'Позвать в Jam')}
                              >
                                <Radio size={14} />
                                <span>{t('social.invite_to_jam', 'Позвать')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Outgoing Requests */}
              {pendingRequests.outgoing.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                    {t('social.outgoing_requests', 'Исходящие заявки')} ({pendingRequests.outgoing.length})
                  </span>
                  <div className="space-y-1.5">
                    {pendingRequests.outgoing.map((req, idx) => (
                      <div key={req.toUserId || idx} className="p-2.5 px-3 bg-[#1e1e1e] border border-white/5 rounded-2xl flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-white/5 text-secondary font-bold flex items-center justify-center text-xs shrink-0">
                            {(req.toUsername || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-xs text-foreground truncate">{req.toUsername}</span>
                            <span className="text-[10px] text-secondary font-mono">#{req.toTag}</span>
                          </div>
                        </div>
                        <span className="text-[11px] text-secondary italic">
                          {t('social.sent_request', 'Запрос отправлен')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Jam Session Tab */
            <div className="space-y-4">
              {/* Audio Mode Selectors */}
              <div className="space-y-2 bg-[#1e1e1e] border border-white/5 rounded-2xl p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.mode_jam_playback', 'Режим воспроизведения Jam')}
                </span>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAudioMode('speaker_dj')}
                    className={`w-full p-3 rounded-xl text-left transition-all flex items-start gap-3 ${
                      audioMode === 'speaker_dj'
                        ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
                        : 'bg-[#262626] hover:bg-[#2c2c2c] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'speaker_dj' ? 'bg-primary text-black' : 'bg-white/5 text-secondary'}`}>
                      <Speaker size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_speaker', 'Режим колонки (DJ)')}
                        </span>
                        {audioMode === 'speaker_dj' && <Check size={14} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_speaker_desc', 'Звук играет у хоста, участники управляют треками')}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAudioMode('synced_audio')}
                    className={`w-full p-3 rounded-xl text-left transition-all flex items-start gap-3 ${
                      audioMode === 'synced_audio'
                        ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
                        : 'bg-[#262626] hover:bg-[#2c2c2c] text-secondary hover:text-foreground'
                    }`}
                  >
                    <div className={`p-2 rounded-xl shrink-0 ${audioMode === 'synced_audio' ? 'bg-primary text-black' : 'bg-white/5 text-secondary'}`}>
                      <Headphones size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'}`}>
                          {t('social.mode_headphones', 'Синхронное вещание')}
                        </span>
                        {audioMode === 'synced_audio' && <Check size={14} className="text-primary shrink-0" />}
                      </div>
                      <p className="text-[11px] text-secondary leading-snug mt-0.5">
                        {t('social.mode_headphones_desc', 'Звук синхронно играет у всех в наушниках')}
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Jam Session Controls */}
              <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-4">
                <JamSessionControl />
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
