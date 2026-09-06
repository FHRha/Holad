import { create } from 'zustand';
import { isTauri, isCapacitor } from '../utils/StorageManager';
import { jamSocket } from '../api/socket';
import { useAuthStore } from './authStore';
import { toast } from 'sonner';
import i18n from '../i18n';

export type JamAudioMode = 'speaker_dj' | 'synced_audio';

export interface FriendNowPlaying {
  id?: string;
  trackId?: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
}

export interface Friend {
  user_id: string;
  id?: string;
  username: string;
  tag: string;
  avatarUrl?: string;
  isOnline: boolean;
  nowPlaying?: FriendNowPlaying | null;
}

export interface FriendRequest {
  fromUserId?: string;
  fromUsername?: string;
  fromTag?: string;
  toUserId?: string;
  toUsername?: string;
  toTag?: string;
  created_at?: string;
  [key: string]: any;
}

export interface JamInvite {
  fromUser: string;
  fromTag: string;
  fromUserId: string;
  roomId: string;
  track?: any;
}

export interface SearchUserResult {
  user_id: string;
  username: string;
  tag: string;
  avatar_url?: string | null;
  isOnline?: boolean;
}

export interface SocialState {
  userName: string | null;
  userTag: string | null;
  friends: Friend[];
  pendingRequests: {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  };
  activeInvites: JamInvite[];
  audioMode: JamAudioMode;
  searchResults: SearchUserResult[];
  isSearching: boolean;

  initSocial: () => void;
  setAudioMode: (mode: JamAudioMode) => void;
  sendFriendRequest: (target: string) => Promise<void>;
  respondFriendRequest: (requesterId: string, action: 'accept' | 'decline') => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  inviteFriendToJam: (friendId: string, roomId: string, track?: any) => Promise<void>;
  searchUsers: (query: string) => Promise<void>;
  clearSearchResults: () => void;

  // State setters
  setUserData: (username: string | null, tag: string | null) => void;
  setUserTag: (tag: string | null) => void;
  setFriends: (friends: Friend[]) => void;
  updateFriendPresence: (userId: string, isOnline: boolean, nowPlaying?: FriendNowPlaying | null) => void;
  addFriend: (friend: Friend) => void;
  removeFriendFromList: (friendId: string) => void;
  setPendingRequests: (pending: { incoming: FriendRequest[]; outgoing: FriendRequest[] }) => void;
  addIncomingRequest: (request: FriendRequest) => void;
  removeIncomingRequest: (requesterId: string) => void;
  addInvite: (invite: JamInvite) => void;
  removeInvite: (roomId: string) => void;
}

export const getInitialJamAudioMode = (): JamAudioMode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('holad_jam_audio_mode');
    if (saved === 'speaker_dj' || saved === 'synced_audio') {
      return saved;
    }
    const isMobile = !isTauri() && (isCapacitor() || (typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)));
    return isMobile ? 'speaker_dj' : 'synced_audio';
  }
  return 'synced_audio';
};

export const useSocialStore = create<SocialState>((set, get) => ({
  userName: null,
  userTag: null,
  friends: [],
  pendingRequests: {
    incoming: [],
    outgoing: []
  },
  activeInvites: [],
  audioMode: getInitialJamAudioMode(),
  searchResults: [],
  isSearching: false,

  initSocial: () => {
    const { user, token, salt, url, isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated && user && token && salt && url) {
      jamSocket.connect();
      jamSocket.emit('social_init', { user, token, salt, url });
    }
  },

  setAudioMode: (mode: JamAudioMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('holad_jam_audio_mode', mode);
    }
    set({ audioMode: mode });
    jamSocket.updateAudioMode(mode);
  },

  sendFriendRequest: async (target: string) => {
    if (!target.trim()) return;
    jamSocket.emit('social_sendFriendRequest', { target: target.trim() });
  },

  respondFriendRequest: async (requesterId: string, action: 'accept' | 'decline') => {
    const backendAction = action === 'decline' ? 'reject' : 'accept';
    jamSocket.emit('social_respondFriendRequest', { requesterId, action: backendAction });
    get().removeIncomingRequest(requesterId);
  },

  removeFriend: async (friendId: string) => {
    jamSocket.emit('social_removeFriend', { friendId });
    get().removeFriendFromList(friendId);
  },

  inviteFriendToJam: async (friendId: string, roomId: string, track?: any) => {
    jamSocket.emit('jam_inviteFriend', { friendId, roomId, track });
    toast.success(i18n.t('social.sent_request'));
  },

  searchUsers: async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true });
    try {
      const results = await jamSocket.searchUsers(trimmed);
      set({ searchResults: results || [], isSearching: false });
    } catch {
      set({ searchResults: [], isSearching: false });
    }
  },

  clearSearchResults: () => {
    set({ searchResults: [], isSearching: false });
  },

  setUserData: (username: string | null, tag: string | null) => set({ userName: username, userTag: tag }),

  setUserTag: (tag: string | null) => set({ userTag: tag }),

  setFriends: (friends: Friend[]) => set({ friends }),

  updateFriendPresence: (userId: string, isOnline: boolean, nowPlaying?: FriendNowPlaying | null) => {
    set((state) => {
      const updated = state.friends.map((f) => {
        const idMatch = (f.user_id && f.user_id === userId) || (f.id && f.id === userId);
        if (idMatch) {
          return {
            ...f,
            isOnline,
            nowPlaying: nowPlaying !== undefined ? nowPlaying : f.nowPlaying
          };
        }
        return f;
      });
      return { friends: updated };
    });
  },

  addFriend: (friend: Friend) => {
    set((state) => {
      const exists = state.friends.some(
        (f) => (f.user_id && f.user_id === friend.user_id) || (f.id && f.id === friend.id)
      );
      if (exists) {
        return {
          friends: state.friends.map((f) =>
            (f.user_id && f.user_id === friend.user_id) || (f.id && f.id === friend.id) ? { ...f, ...friend } : f
          )
        };
      }
      return { friends: [...state.friends, friend] };
    });
  },

  removeFriendFromList: (friendId: string) => {
    set((state) => ({
      friends: state.friends.filter(
        (f) => f.user_id !== friendId && f.id !== friendId
      )
    }));
  },

  setPendingRequests: (pending) => set({ pendingRequests: pending }),

  addIncomingRequest: (request: FriendRequest) => {
    set((state) => {
      const incoming = [...state.pendingRequests.incoming];
      const exists = incoming.some(
        (r) => r.fromUserId && r.fromUserId === request.fromUserId
      );
      if (!exists) {
        incoming.push(request);
      }
      return {
        pendingRequests: {
          ...state.pendingRequests,
          incoming
        }
      };
    });
  },

  removeIncomingRequest: (requesterId: string) => {
    set((state) => ({
      pendingRequests: {
        ...state.pendingRequests,
        incoming: state.pendingRequests.incoming.filter(
          (r) => r.fromUserId !== requesterId
        )
      }
    }));
  },

  addInvite: (invite: JamInvite) => {
    set((state) => {
      const filtered = state.activeInvites.filter((i) => i.roomId !== invite.roomId);
      return { activeInvites: [...filtered, invite] };
    });
  },

  removeInvite: (roomId: string) => {
    try {
      toast.dismiss(`jam-invite-${roomId}`);
    } catch (e) {
      // ignore
    }
    set((state) => ({
      activeInvites: state.activeInvites.filter((i) => i.roomId !== roomId)
    }));
  }
}));
