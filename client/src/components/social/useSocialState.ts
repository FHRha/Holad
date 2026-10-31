import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSocialStore } from '../../store/socialStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useDemoStore } from '../../store/demoStore';

export function useSocialState(debounceMs = 300) {
  const { t } = useTranslation();
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [isTagCopied, setIsTagCopied] = useState(false);

  const socialStore = useSocialStore();
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
    removeInvite,
  } = socialStore;

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

  const isUserInJam = useCallback(
    (targetUserId?: string, targetUsername?: string, targetTag?: string) => {
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
    },
    [roomId, isDemoMode, currentNick, userName, authUser, participants]
  );

  const handleCopyTag = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(displayTag);
      setIsTagCopied(true);
      toast.success(t('social.tag_copied', 'Тег скопирован!'));
      setTimeout(() => setIsTagCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, [displayTag, t]);

  useEffect(() => {
    if (!friendSearchInput.trim()) {
      clearSearchResults();
      return;
    }
    const timer = setTimeout(() => {
      searchUsers(friendSearchInput.trim());
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [friendSearchInput, searchUsers, clearSearchResults, debounceMs]);

  const hasNotifications = pendingRequests.incoming.length > 0 || activeInvites.length > 0;

  return {
    t,
    currentNick,
    displayTag,
    isTagCopied,
    handleCopyTag,
    friendSearchInput,
    setFriendSearchInput,
    isUserInJam,
    hasNotifications,
    // Store states & actions
    friends,
    pendingRequests,
    activeInvites,
    audioMode,
    searchResults,
    isSearching,
    roomId,
    currentTrack,
    participants,
    setAudioMode,
    sendFriendRequest,
    respondFriendRequest,
    inviteFriendToJam,
    removeInvite,
    clearSearchResults,
  };
}
