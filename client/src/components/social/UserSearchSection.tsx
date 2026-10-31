import { useTranslation } from 'react-i18next';
import { Search, X, Loader2, Check, Clock, UserPlus, Radio } from 'lucide-react';

export interface SearchUserResult {
  user_id: string;
  username: string;
  tag: string;
  avatar_url?: string | null;
  isOnline?: boolean;
}

export interface UserSearchSectionProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  isSearching: boolean;
  searchResults: SearchUserResult[];
  friends: Array<{ user_id?: string; id?: string; username: string; tag: string }>;
  pendingRequests: {
    incoming: Array<{ fromUserId?: string; fromUsername?: string; fromTag?: string }>;
    outgoing: Array<{ toUserId?: string; toUsername?: string; toTag?: string }>;
  };
  roomId?: string | null;
  isUserInJam: (userId?: string, username?: string, tag?: string) => boolean;
  onSendFriendRequest: (tagOrQuery: string) => void;
  onAcceptFriendRequest: (userId: string) => void;
  onInviteToJam: (userId: string) => void;
  variant?: 'sidebar' | 'view' | 'modal';
}

export default function UserSearchSection({
  searchInput,
  onSearchChange,
  onClearSearch,
  isSearching,
  searchResults,
  friends,
  pendingRequests,
  roomId,
  isUserInJam,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onInviteToJam,
  variant = 'view',
}: UserSearchSectionProps) {
  const { t } = useTranslation();

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    onSendFriendRequest(searchInput.trim());
    onSearchChange('');
    onClearSearch();
  };

  if (variant === 'sidebar') {
    return (
      <div className="space-y-2">
        <form
          onSubmit={handleFormSubmit}
          className="relative flex items-center w-full bg-neutral-100 dark:bg-[#161616] hover:bg-neutral-200/60 dark:hover:bg-[#1c1c1c] rounded-xl px-3 transition-colors focus-within:ring-1 focus-within:ring-primary/40 focus-within:bg-neutral-200/80 dark:focus-within:bg-[#1a1a1a]"
        >
          <Search size={14} className="text-secondary pointer-events-none shrink-0 mr-2.5" />
          <input
            type="text"
            placeholder={t('social.search_placeholder')}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none shadow-none py-2 text-xs text-foreground placeholder:text-secondary focus:outline-none focus:ring-0 min-w-0"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onClearSearch();
              }}
              className="p-0.5 text-secondary hover:text-foreground transition-colors shrink-0 ml-1.5"
            >
              <X size={13} />
            </button>
          )}
        </form>

        {searchInput.trim().length > 0 && (
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
                  (f) =>
                    (f.user_id && f.user_id === user.user_id) ||
                    (f.id && f.id === user.user_id) ||
                    (f.username === user.username && f.tag === user.tag)
                );
                const isPendingOut = pendingRequests.outgoing.some(
                  (r) => r.toUserId === user.user_id || (r.toUsername === user.username && r.toTag === user.tag)
                );
                const isIncoming = pendingRequests.incoming.some(
                  (r) => r.fromUserId === user.user_id || (r.fromUsername === user.username && r.fromTag === user.tag)
                );
                const userInJam = isUserInJam(user.user_id, user.username, user.tag);

                return (
                  <div key={user.user_id} className="p-2.5 bg-neutral-100 dark:bg-[#141414] rounded-xl space-y-2">
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

                    {(!isFriend && !isPendingOut) || (roomId && !userInJam) ? (
                      <div className="flex items-stretch gap-1.5 pt-1.5 border-t border-neutral-200 dark:border-white/5">
                        {!isFriend && !isPendingOut && (
                          isIncoming ? (
                            <button
                              type="button"
                              onClick={() => onAcceptFriendRequest(user.user_id)}
                              className="flex-1 h-9 px-2.5 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 whitespace-nowrap"
                            >
                              <Check size={13} />
                              <span>{t('social.accept')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSendFriendRequest(`${user.username}#${user.tag}`)}
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
                            onClick={() => onInviteToJam(user.user_id)}
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
    );
  }

  if (variant === 'modal') {
    return (
      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
          {t('social.add_friend', 'Добавить в друзья')}
        </span>
        <form
          onSubmit={handleFormSubmit}
          className="relative flex items-center w-full bg-[#1e1e1e] border border-white/10 rounded-2xl px-3.5 transition-colors focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-transparent"
        >
          <Search size={16} className="text-secondary pointer-events-none shrink-0 mr-2.5" />
          <input
            type="text"
            placeholder={t('social.search_placeholder', 'Поиск по нику или Ник#Тег...')}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent border-0 outline-none py-3 text-xs text-foreground placeholder:text-secondary min-w-0"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onClearSearch();
              }}
              className="p-1 text-secondary hover:text-foreground transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </form>

        {searchInput.trim().length > 0 && (
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
                  (f) =>
                    (f.user_id && f.user_id === user.user_id) ||
                    (f.id && f.id === user.user_id) ||
                    (f.username === user.username && f.tag === user.tag)
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

                    {(!isFriend && !isPendingOut) || (roomId && !userInJam) ? (
                      <div className="flex items-stretch gap-1.5 pt-1.5 border-t border-white/5">
                        {!isFriend && !isPendingOut && (
                          isIncoming ? (
                            <button
                              type="button"
                              onClick={() => onAcceptFriendRequest(user.user_id)}
                              className="flex-1 py-2 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 flex items-center justify-center gap-1.5"
                            >
                              <Check size={13} />
                              <span>{t('social.accept', 'Принять')}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSendFriendRequest(`${user.username}#${user.tag}`)}
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
                            onClick={() => onInviteToJam(user.user_id)}
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
    );
  }

  // variant === 'view'
  return (
    <div className="space-y-2">
      <span className="text-xs font-bold uppercase tracking-wider text-secondary px-1">
        {t('social.add_friend', 'Добавить в друзья')}
      </span>
      <form
        onSubmit={handleFormSubmit}
        className="relative flex items-center w-full bg-card border border-border rounded-2xl px-4 transition-colors focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-transparent shadow-sm"
      >
        <Search size={18} className="text-secondary pointer-events-none shrink-0 mr-3" />
        <input
          type="text"
          placeholder={t('social.search_placeholder', 'Поиск по нику или Ник#Тег...')}
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 bg-transparent border-0 outline-none py-3.5 text-sm text-foreground placeholder:text-secondary min-w-0"
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => {
              onSearchChange('');
              onClearSearch();
            }}
            className="p-1 text-secondary hover:text-foreground transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </form>

      {searchInput.trim().length > 0 && (
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
                (f) =>
                  (f.user_id && f.user_id === user.user_id) ||
                  (f.id && f.id === user.user_id) ||
                  (f.username === user.username && f.tag === user.tag)
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
                            onClick={() => onAcceptFriendRequest(user.user_id)}
                            className="flex-1 py-2 bg-primary text-black font-bold text-xs rounded-xl hover:opacity-90 flex items-center justify-center gap-1.5"
                          >
                            <Check size={14} />
                            <span>{t('social.accept', 'Принять')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSendFriendRequest(`${user.username}#${user.tag}`)}
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
                          onClick={() => onInviteToJam(user.user_id)}
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
  );
}
