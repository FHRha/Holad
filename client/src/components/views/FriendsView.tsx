import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  UsersRound, Radio, Copy, Check, Search, X, Loader2, 
  UserPlus, Clock, Music, Speaker, Headphones, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSocialStore } from '../../store/socialStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';
import { jamSocket } from '../../api/socket';
import { toast } from 'sonner';
import { getCoverArtUrl } from '../../api/subsonic';
import JamSessionControl from '../jam/JamSessionControl';

export default function FriendsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'friends' | 'jam'>('friends');
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

  return (
    <div className="flex-1 overflow-y-auto bg-transparent md:bg-background custom-scrollbar pb-32 md:pb-12">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 md:px-8 md:pt-8 md:pb-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="md:hidden p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-foreground tracking-tight">
              {t('social.tab_friends', 'Jam & Друзья')}
            </h1>
            <p className="text-xs md:text-sm text-secondary">
              {t('social.friends_listen_together', 'Слушайте музыку вместе с друзьями в реальном времени')}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex max-w-md bg-card border border-border p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'friends'
                ? 'bg-primary text-black shadow-md'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            <UsersRound size={16} />
            <span>{t('social.tab_friends_button', 'Друзья')}</span>
            {friends.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'friends' ? 'bg-black/20 text-black' : 'bg-foreground/10 text-secondary'
              }`}>
                {friends.length}
              </span>
            )}
            {hasFriendNotifications && (
              <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-card animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('jam')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
              activeTab === 'jam'
                ? 'bg-primary text-black shadow-md'
                : 'text-secondary hover:text-foreground'
            }`}
          >
            <Radio size={16} />
            <span>{t('social.tab_jam', 'Jam-сессия')}</span>
            {roomId && (
              <span className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-card animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="px-4 md:px-8 max-w-3xl space-y-4 pt-2">
        {activeTab === 'friends' ? (
          <>
            {/* My Tag Card */}
            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-2xl shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-base shrink-0 ring-1 ring-primary/30">
                  {currentNick.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">{t('social.my_tag', 'Мой тег')}</span>
                  <span className="font-mono font-bold text-sm md:text-base text-foreground truncate">{displayTag}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyTag}
                className="p-2.5 px-4 rounded-xl bg-foreground/10 hover:bg-foreground/15 text-foreground transition-all flex items-center gap-2 text-xs font-bold shrink-0 active:scale-95 shadow-sm"
                title={t('social.copy_tag', 'Скопировать тег')}
              >
                {isTagCopied ? <Check size={16} className="text-primary" /> : <Copy size={16} />}
                <span>{isTagCopied ? t('social.tag_copied', 'Скопирован!') : t('social.copy_tag', 'Копировать')}</span>
              </button>
            </div>

            {/* Incoming Jam Invites */}
            {activeInvites.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary px-1 flex items-center gap-1.5">
                  <Radio size={14} /> {t('deeplink.invite_title', 'Приглашение в Jam-сессию')}
                </span>
                {activeInvites.map((inv) => (
                  <div key={inv.roomId} className="bg-card border border-primary/30 rounded-2xl p-3.5 shadow-md space-y-3">
                    <div className="flex items-center gap-3">
                      {inv.track?.coverArt ? (
                        <img
                          src={getCoverArtUrl(inv.track.coverArt || inv.track.albumId || inv.track.id, 80)}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover shrink-0 shadow-sm ring-1 ring-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0 ring-1 ring-primary/30">
                          <Radio size={22} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-foreground truncate">
                          {inv.fromUser} <span className="text-secondary font-mono text-xs">#{inv.fromTag}</span>
                        </div>
                        <div className="text-xs text-secondary truncate">
                          {t('social.invited_to_jam_toast', { name: inv.fromUser })}
                        </div>
                        {inv.track?.title && (
                          <div className="text-xs text-primary truncate font-semibold flex items-center gap-1 mt-0.5">
                            <Music size={12} className="shrink-0" />
                            <span className="truncate">{inv.track.title}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const joinNick = userName || authUser || usePlayerStore.getState().userName || 'User';
                          jamSocket.joinRoom(inv.roomId, joinNick);
                          removeInvite(inv.roomId);
                          setActiveTab('jam');
                        }}
                        className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 active:scale-95 shadow-md"
                      >
                        <Check size={15} />
                        <span>{t('social.accept', 'Принять')}</span>
                      </button>
                      <button
                        onClick={() => removeInvite(inv.roomId)}
                        className="flex-1 py-2 bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold text-xs rounded-xl transition-colors active:scale-95"
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
                <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.incoming_requests', 'Входящие заявки')} ({pendingRequests.incoming.length})
                </span>
                <div className="space-y-2">
                  {pendingRequests.incoming.map((req, idx) => (
                    <div key={req.fromUserId || idx} className="p-3 bg-card border border-border rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-sm shrink-0">
                          {(req.fromUsername || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm text-foreground truncate">{req.fromUsername}</span>
                          <span className="text-xs text-secondary font-mono">#{req.fromTag}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => respondFriendRequest(req.fromUserId || '', 'accept')}
                          className="p-2 px-3.5 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 flex items-center gap-1.5 active:scale-95 shadow-sm"
                        >
                          <Check size={14} />
                          <span>{t('social.accept', 'Принять')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => respondFriendRequest(req.fromUserId || '', 'decline')}
                          className="p-2 px-3 bg-foreground/10 hover:bg-foreground/15 text-secondary hover:text-foreground text-xs font-semibold rounded-xl transition-colors"
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
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
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
                className="relative flex items-center w-full bg-card border border-border rounded-2xl px-4 transition-colors focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-transparent shadow-sm"
              >
                <Search size={18} className="text-secondary pointer-events-none shrink-0 mr-3" />
                <input
                  type="text"
                  placeholder={t('social.search_placeholder', 'Поиск по нику или Ник#Тег...')}
                  value={friendSearchInput}
                  onChange={(e) => setFriendSearchInput(e.target.value)}
                  className="flex-1 bg-transparent border-0 outline-none py-3.5 text-sm text-foreground placeholder:text-secondary min-w-0"
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
                    <X size={16} />
                  </button>
                )}
              </form>

              {/* Search Results Dropdown */}
              {friendSearchInput.trim().length > 0 && (
                <div className="space-y-2 bg-card border border-border rounded-2xl p-3 max-h-72 overflow-y-auto shadow-xl">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-6 text-sm text-secondary gap-2">
                      <Loader2 size={18} className="animate-spin text-primary" />
                      <span>{t('social.searching', 'Поиск...')}</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-6 text-sm text-secondary">
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
                        <div key={user.user_id} className="p-3 bg-foreground/5 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative shrink-0">
                                {user.avatar_url ? (
                                  <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                                ) : (
                                  <div className="w-9 h-9 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-xs">
                                    {(user.username || 'U')[0].toUpperCase()}
                                  </div>
                                )}
                                {user.isOnline && (
                                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 ring-2 ring-card" />
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-baseline gap-1 min-w-0">
                                  <span className="font-bold text-sm text-foreground truncate">{user.username}</span>
                                  <span className="text-xs text-secondary font-mono shrink-0">#{user.tag}</span>
                                </div>
                                <span className={`text-xs ${user.isOnline ? 'text-green-400 font-semibold' : 'text-secondary'}`}>
                                  {user.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                                </span>
                              </div>
                            </div>

                            {isFriend ? (
                              <span className="text-xs text-primary font-semibold px-2.5 py-1 bg-primary/10 rounded-lg flex items-center gap-1 shrink-0">
                                <Check size={13} />
                                <span>{t('social.already_friends', 'Уже в друзьях')}</span>
                              </span>
                            ) : isPendingOut ? (
                              <span className="text-xs text-secondary font-semibold px-2.5 py-1 bg-foreground/10 rounded-lg flex items-center gap-1 shrink-0">
                                <Clock size={13} />
                                <span>{t('social.sent_request', 'Запрос отправлен')}</span>
                              </span>
                            ) : null}
                          </div>

                          {(!isFriend && !isPendingOut) || (roomId && !userInJam) ? (
                            <div className="flex items-stretch gap-2 pt-2 border-t border-border">
                              {!isFriend && !isPendingOut && (
                                isIncoming ? (
                                  <button
                                    type="button"
                                    onClick={() => respondFriendRequest(user.user_id, 'accept')}
                                    className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 flex items-center justify-center gap-1.5"
                                  >
                                    <Check size={14} />
                                    <span>{t('social.accept', 'Принять')}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await sendFriendRequest(`${user.username}#${user.tag}`);
                                      toast.success(t('social.sent_request', 'Запрос отправлен'));
                                    }}
                                    className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 flex items-center justify-center gap-1.5 shadow-sm"
                                  >
                                    <UserPlus size={14} />
                                    <span>{t('social.add_friend', 'Добавить в друзья')}</span>
                                  </button>
                                )
                              )}

                              {roomId && !userInJam && (
                                <button
                                  type="button"
                                  onClick={() => inviteFriendToJam(user.user_id, roomId, currentTrack)}
                                  className="flex-1 py-2 bg-foreground/10 hover:bg-foreground/20 text-foreground font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Radio size={14} className="text-primary" />
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
            <div className="space-y-2 pt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
                {t('social.tab_friends', 'Друзья')} ({friends.length})
              </span>

              {friends.length === 0 ? (
                <div className="py-12 px-4 rounded-2xl bg-card border border-border text-center flex flex-col items-center justify-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-foreground/5 flex items-center justify-center text-secondary mb-1">
                    <UsersRound size={28} />
                  </div>
                  <p className="text-base font-bold text-foreground">{t('social.no_friends', 'У вас пока нет друзей')}</p>
                  <p className="text-xs text-secondary max-w-sm leading-relaxed">
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
                        className="bg-card border border-border hover:border-foreground/20 rounded-2xl p-3.5 transition-all flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-11 h-11 rounded-full bg-primary/20 text-primary font-bold text-sm flex items-center justify-center ring-1 ring-primary/30">
                              {friend.username?.charAt(0)?.toUpperCase() || 'U'}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-card ${
                                friend.isOnline ? 'bg-green-500' : 'bg-secondary/40'
                              }`}
                              title={friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-bold text-sm text-foreground truncate">{friend.username}</span>
                              <span className="text-xs text-secondary font-mono">#{friend.tag}</span>
                            </div>
                            {friend.isOnline && friend.nowPlaying ? (
                              <p className="text-xs text-primary truncate flex items-center gap-1 font-semibold mt-0.5">
                                <Music size={12} className="shrink-0 animate-pulse" />
                                <span className="truncate">
                                  {friend.nowPlaying.title}{friend.nowPlaying.artist ? ` • ${friend.nowPlaying.artist}` : ''}
                                </span>
                              </p>
                            ) : (
                              <p className="text-xs text-secondary mt-0.5">
                                {friend.isOnline ? t('social.status_online', 'В сети') : t('social.status_offline', 'Не в сети')}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {roomId && !inJam && (
                            <button
                              onClick={() => inviteFriendToJam(friendId, roomId, currentTrack)}
                              className="p-2 px-3.5 bg-primary/15 hover:bg-primary/25 text-primary rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 active:scale-95"
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
              <div className="space-y-2 pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.outgoing_requests', 'Исходящие заявки')} ({pendingRequests.outgoing.length})
                </span>
                <div className="space-y-2">
                  {pendingRequests.outgoing.map((req, idx) => (
                    <div key={req.toUserId || idx} className="p-3 bg-card border border-border rounded-2xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-foreground/5 text-secondary font-bold flex items-center justify-center text-xs shrink-0">
                          {(req.toUsername || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-sm text-foreground truncate">{req.toUsername}</span>
                          <span className="text-xs text-secondary font-mono">#{req.toTag}</span>
                        </div>
                      </div>
                      <span className="text-xs text-secondary italic">
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
            <div className="space-y-3 bg-card border border-border rounded-2xl p-4 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
                {t('social.mode_jam_playback', 'Режим воспроизведения Jam')}
              </span>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setAudioMode('speaker_dj')}
                  className={`w-full p-3.5 rounded-xl text-left transition-all flex items-start gap-3 ${
                    audioMode === 'speaker_dj'
                      ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
                      : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${audioMode === 'speaker_dj' ? 'bg-primary text-black' : 'bg-foreground/5 text-secondary'}`}>
                    <Speaker size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${audioMode === 'speaker_dj' ? 'text-primary' : 'text-foreground'}`}>
                        {t('social.mode_speaker', 'Режим колонки (DJ)')}
                      </span>
                      {audioMode === 'speaker_dj' && <Check size={16} className="text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-secondary leading-snug mt-1">
                      {t('social.mode_speaker_desc', 'Звук играет у хоста, участники управляют треками')}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setAudioMode('synced_audio')}
                  className={`w-full p-3.5 rounded-xl text-left transition-all flex items-start gap-3 ${
                    audioMode === 'synced_audio'
                      ? 'bg-primary/20 text-foreground ring-1 ring-primary/40 font-semibold'
                      : 'bg-foreground/5 hover:bg-foreground/10 text-secondary hover:text-foreground'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${audioMode === 'synced_audio' ? 'bg-primary text-black' : 'bg-foreground/5 text-secondary'}`}>
                    <Headphones size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${audioMode === 'synced_audio' ? 'text-primary' : 'text-foreground'}`}>
                        {t('social.mode_headphones', 'Синхронное вещание')}
                      </span>
                      {audioMode === 'synced_audio' && <Check size={16} className="text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-secondary leading-snug mt-1">
                      {t('social.mode_headphones_desc', 'Звук синхронно играет у всех в наушниках')}
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Jam Session Controls */}
            <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
              <JamSessionControl />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
