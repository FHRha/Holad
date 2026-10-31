import { UsersRound } from 'lucide-react';
import { jamSocket } from '../../api/socket';
import { toast } from 'sonner';
import { useSocialState } from './useSocialState';
import UserProfileHeader from './UserProfileHeader';
import FriendListItem from './FriendListItem';
import JamInviteList from './JamInviteList';
import FriendRequestList from './FriendRequestList';
import UserSearchSection from './UserSearchSection';

export interface SocialPanelProps {
  variant?: 'sidebar' | 'view' | 'modal';
  onAcceptJamInvite?: (roomId: string) => void;
}

export default function SocialPanel({
  variant = 'view',
  onAcceptJamInvite,
}: SocialPanelProps) {
  const {
    t,
    currentNick,
    displayTag,
    isTagCopied,
    handleCopyTag,
    friendSearchInput,
    setFriendSearchInput,
    isUserInJam,
    friends,
    pendingRequests,
    activeInvites,
    searchResults,
    isSearching,
    roomId,
    currentTrack,
    sendFriendRequest,
    respondFriendRequest,
    inviteFriendToJam,
    removeInvite,
    clearSearchResults,
  } = useSocialState(variant === 'sidebar' ? 250 : 300);

  const handleAcceptInvite = (inviteRoomId: string) => {
    jamSocket.joinRoom(inviteRoomId, currentNick);
    removeInvite(inviteRoomId);
    if (onAcceptJamInvite) {
      onAcceptJamInvite(inviteRoomId);
    }
  };

  const handleDeclineInvite = (inviteRoomId: string) => {
    removeInvite(inviteRoomId);
  };

  const handleSendFriendRequest = async (target: string) => {
    await sendFriendRequest(target);
    toast.success(t('social.sent_request', 'Запрос отправлен'));
  };

  const handleAcceptRequest = (userId: string) => {
    respondFriendRequest(userId, 'accept');
  };

  const handleDeclineRequest = (userId: string) => {
    respondFriendRequest(userId, 'decline');
  };

  const handleInviteFriendToJam = (friendId: string) => {
    if (roomId) {
      inviteFriendToJam(friendId, roomId, currentTrack);
    }
  };

  if (variant === 'sidebar') {
    return (
      <div className="space-y-4">
        <JamInviteList
          activeInvites={activeInvites}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
          variant="sidebar"
        />

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
                return (
                  <FriendListItem
                    key={friendId}
                    friend={friend}
                    isInJam={isUserInJam(friendId, friend.username, friend.tag)}
                    canInviteToJam={Boolean(roomId)}
                    onInviteToJam={() => handleInviteFriendToJam(friendId)}
                    variant="sidebar"
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-white/5">
          <UserProfileHeader
            currentNick={currentNick}
            displayTag={displayTag}
            isTagCopied={isTagCopied}
            onCopyTag={handleCopyTag}
            variant="sidebar"
          />

          <UserSearchSection
            searchInput={friendSearchInput}
            onSearchChange={setFriendSearchInput}
            onClearSearch={clearSearchResults}
            isSearching={isSearching}
            searchResults={searchResults}
            friends={friends}
            pendingRequests={pendingRequests}
            roomId={roomId}
            isUserInJam={isUserInJam}
            onSendFriendRequest={handleSendFriendRequest}
            onAcceptFriendRequest={handleAcceptRequest}
            onInviteToJam={handleInviteFriendToJam}
            variant="sidebar"
          />

          <FriendRequestList
            incomingRequests={pendingRequests.incoming}
            onAccept={handleAcceptRequest}
            onDecline={handleDeclineRequest}
            variant="sidebar"
            type="incoming"
          />
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <>
        <UserProfileHeader
          currentNick={currentNick}
          displayTag={displayTag}
          isTagCopied={isTagCopied}
          onCopyTag={handleCopyTag}
          variant="modal"
        />

        <JamInviteList
          activeInvites={activeInvites}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
          variant="modal"
        />

        <FriendRequestList
          incomingRequests={pendingRequests.incoming}
          onAccept={handleAcceptRequest}
          onDecline={handleDeclineRequest}
          variant="modal"
          type="incoming"
        />

        <UserSearchSection
          searchInput={friendSearchInput}
          onSearchChange={setFriendSearchInput}
          onClearSearch={clearSearchResults}
          isSearching={isSearching}
          searchResults={searchResults}
          friends={friends}
          pendingRequests={pendingRequests}
          roomId={roomId}
          isUserInJam={isUserInJam}
          onSendFriendRequest={handleSendFriendRequest}
          onAcceptFriendRequest={handleAcceptRequest}
          onInviteToJam={handleInviteFriendToJam}
          variant="modal"
        />

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
                return (
                  <FriendListItem
                    key={friendId}
                    friend={friend}
                    isInJam={isUserInJam(friendId, friend.username, friend.tag)}
                    canInviteToJam={Boolean(roomId)}
                    onInviteToJam={() => handleInviteFriendToJam(friendId)}
                    variant="modal"
                  />
                );
              })}
            </div>
          )}
        </div>

        <FriendRequestList
          outgoingRequests={pendingRequests.outgoing}
          variant="modal"
          type="outgoing"
        />
      </>
    );
  }

  // variant === 'view'
  return (
    <>
      <UserProfileHeader
        currentNick={currentNick}
        displayTag={displayTag}
        isTagCopied={isTagCopied}
        onCopyTag={handleCopyTag}
        variant="view"
      />

      <JamInviteList
        activeInvites={activeInvites}
        onAccept={handleAcceptInvite}
        onDecline={handleDeclineInvite}
        variant="view"
      />

      <FriendRequestList
        incomingRequests={pendingRequests.incoming}
        onAccept={handleAcceptRequest}
        onDecline={handleDeclineRequest}
        variant="view"
        type="incoming"
      />

      <UserSearchSection
        searchInput={friendSearchInput}
        onSearchChange={setFriendSearchInput}
        onClearSearch={clearSearchResults}
        isSearching={isSearching}
        searchResults={searchResults}
        friends={friends}
        pendingRequests={pendingRequests}
        roomId={roomId}
        isUserInJam={isUserInJam}
        onSendFriendRequest={handleSendFriendRequest}
        onAcceptFriendRequest={handleAcceptRequest}
        onInviteToJam={handleInviteFriendToJam}
        variant="view"
      />

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
              return (
                <FriendListItem
                  key={friendId}
                  friend={friend}
                  isInJam={isUserInJam(friendId, friend.username, friend.tag)}
                  canInviteToJam={Boolean(roomId)}
                  onInviteToJam={() => handleInviteFriendToJam(friendId)}
                  variant="view"
                />
              );
            })}
          </div>
        )}
      </div>

      <FriendRequestList
        outgoingRequests={pendingRequests.outgoing}
        variant="view"
        type="outgoing"
      />
    </>
  );
}
