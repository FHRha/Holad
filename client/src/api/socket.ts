import React from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { usePlayerStore } from '../store/playerStore';
import { useHoladStore } from '../store/holadStore';
import { useAudioStore } from '../store/audioStore';
import { useSocialStore } from '../store/socialStore';
import { useAuthStore } from '../store/authStore';
import i18n from '../i18n';
import { useSettingsStore } from '../store/settingsStore';
import { useDemoStore } from '../store/demoStore';

import { getSocketUrl, getSocketPath } from '../utils/serverConfig';
import { getBasePath, isJamPath } from '../utils/basePath';
import { getAudioEngine } from '../audio/AudioEngine';
import { sanitizeTracks } from '../store/slices/queueSlice';
import { getCoverArtUrl } from './subsonic';

class JamSocketService {
  private socket: Socket | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private isApplyingRemoteState = false;
  private latestStateVersion: number = 0;
  private lastTrackEndedId: string | null = null;
  private lastTrackEndedTime: number = 0;

  connect() {
    if (this.socket) return;
    
    this.socket = io(getSocketUrl(), {
      path: getSocketPath(),
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Jam Server');
      const { roomId, userName } = usePlayerStore.getState();
      if (roomId) {
        // Automatically rejoin the room if we get disconnected (e.g. app went to background)
        this.joinRoom(roomId, userName);
      }
      const { user, token, salt, url, isAuthenticated } = useAuthStore.getState();
      if (isAuthenticated && user && token && salt && url) {
        const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
        this.socket?.emit('social_init', { user, token, salt, url, demoSessionId });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Jam Server');
    });

    this.socket.on('roomCreated', ({ roomId, role }) => {
      usePlayerStore.getState().setRoomInfo(roomId, role);
      this.startHostSync();
    });

    this.socket.on('roomJoined', ({ roomId, role, state }) => {
      usePlayerStore.getState().setRoomInfo(roomId, role);
      this.stopHostSync(); // Listeners don't sync state outwards
      // Immediately apply host's state
      this.applySyncState(state);
    });

    this.socket.on('syncStateVersion', (version) => {
      if (version > this.latestStateVersion) {
        this.latestStateVersion = version;
      }
    });

    this.socket.on('syncState', (state) => {
      if (state.version !== undefined) {
        this.latestStateVersion = state.version;
      }
      this.applySyncState(state);
    });

    this.socket.on('syncQueue', ({ queue, currentIndex, version }) => {
      if (version !== undefined) {
        this.latestStateVersion = version;
      }
      const currentStore = usePlayerStore.getState();
      const sanitized = queue ? sanitizeTracks(queue) : queue;
      const isSameQueue = currentStore.queue && sanitized && currentStore.queue.length === sanitized.length && currentStore.queue.every((t, i) => t.id === sanitized[i]?.id);
      if (!isSameQueue || currentIndex !== currentStore.currentIndex) {
        this.isApplyingRemoteState = true;
        usePlayerStore.setState({ queue: sanitized, currentIndex });
        setTimeout(() => { this.isApplyingRemoteState = false; }, 100);
      }
    });

    this.socket.on('participants', (participants) => {
      usePlayerStore.getState().setParticipants(participants);
    });

    // Fallback for older server code in case it wasn't restarted
    this.socket.on('participantsUpdated', (participants) => {
      usePlayerStore.getState().setParticipants(participants);
    });

    this.socket.on('roleChanged', (role) => {
      usePlayerStore.setState({ role });
      if (role === 'cohost') {
        this.startHostSync(); // start syncing outwards
      } else if (role === 'listener') {
        this.stopHostSync();
      }
    });

    this.socket.on('kicked', () => {
      usePlayerStore.getState().setJamError(i18n.t('jam.kicked'));
      usePlayerStore.getState().setRoomInfo(null, null);
      this.stopHostSync();
      const base = getBasePath();
      const jamHome = base ? `${base}/jam/` : '/jam/';
      if (isJamPath() && window.location.pathname !== jamHome && window.location.pathname !== jamHome.slice(0, -1)) {
        window.location.href = jamHome;
      }
    });

    this.socket.on('error', (msg) => {
      usePlayerStore.getState().setJamError(msg);
      usePlayerStore.getState().setRoomInfo(null, null);
      this.stopHostSync();
      const base = getBasePath();
      const jamHome = base ? `${base}/jam/` : '/jam/';
      if (isJamPath() && window.location.pathname !== jamHome && window.location.pathname !== jamHome.slice(0, -1)) {
        window.location.href = jamHome;
      }
    });

    this.socket.on('social_init_success', (data: any) => {
      if (data) {
        const { isDemoMode, slotId } = useDemoStore.getState();
        const guestNick = slotId ? `${i18n.t('demo.guest', 'Гость')} #${slotId}` : i18n.t('demo.guest', 'Гость');
        const fallbackName = isDemoMode ? guestNick : (useAuthStore.getState().user || 'User');
        const authUser = useAuthStore.getState().user;
        const username = (isDemoMode && authUser && data.username?.toLowerCase() === authUser.toLowerCase())
          ? fallbackName
          : (data.username || fallbackName);
        useSocialStore.getState().setUserData(username, data.tag || null);
        if (data.friends) useSocialStore.getState().setFriends(data.friends);
        if (data.pendingRequests) useSocialStore.getState().setPendingRequests(data.pendingRequests);
      }
    });

    this.socket.on('social_error', (msg: any) => {
      if (typeof msg === 'string') {
        toast.error(msg);
      }
    });

    this.socket.on('social_friendsList', (friends: any) => {
      if (Array.isArray(friends)) {
        useSocialStore.getState().setFriends(friends);
      }
    });

    this.socket.on('social_friendRequestReceived', (data: any) => {
      if (data) {
        const name = data.fromUsername || data.fromTag || 'User';
        toast.info(`${i18n.t('social.friend_requests')}: ${name}`);
        useSocialStore.getState().addIncomingRequest(data);
      }
    });

    this.socket.on('social_friendPresence', (data: any) => {
      if (data && data.userId) {
        useSocialStore.getState().updateFriendPresence(data.userId, data.isOnline, data.nowPlaying);
      }
    });

    this.socket.on('social_friendAccepted', (data: any) => {
      if (data && data.friend) {
        useSocialStore.getState().addFriend(data.friend);
        toast.success(i18n.t('social.friend_added'));
      }
    });

    this.socket.on('social_friendRemoved', (data: any) => {
      if (data && data.friendId) {
        useSocialStore.getState().removeFriendFromList(data.friendId);
      }
    });

    this.socket.on('jam_inviteReceived', (data: any) => {
      if (!data || !data.roomId) return;
      useSocialStore.getState().addInvite(data);

      toast.custom(
        (t) =>
          React.createElement('div', { className: 'bg-card border border-border rounded-xl shadow-2xl p-4 flex items-center gap-3.5 w-full max-w-sm text-foreground' },
            data.track?.coverArt
              ? React.createElement('img', {
                  src: getCoverArtUrl(data.track.coverArt || data.track.albumId || data.track.id, 100),
                  alt: '',
                  className: 'w-12 h-12 rounded-lg object-cover flex-shrink-0'
                })
              : React.createElement('div', { className: 'w-12 h-12 rounded-lg bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 font-bold text-lg' }, 'J'),
            React.createElement('div', { className: 'flex-1 min-w-0' },
              React.createElement('div', { className: 'font-semibold text-sm truncate text-foreground' },
                data.fromUser,
                data.fromTag ? React.createElement('span', { className: 'text-secondary text-xs font-normal ml-1' }, `#${data.fromTag}`) : null
              ),
              React.createElement('div', { className: 'text-xs text-secondary truncate mt-0.5' },
                i18n.t('social.invited_to_jam_toast', { name: data.fromUser })
              ),
              data.track?.title ? React.createElement('div', { className: 'text-[11px] text-primary truncate font-medium mt-0.5' },
                `${data.track.title}${data.track.artist ? ` - ${data.track.artist}` : ''}`
              ) : null,
              React.createElement('div', { className: 'flex gap-2 mt-2' },
                React.createElement('button', {
                  onClick: () => {
                    const userName = useAuthStore.getState().user || usePlayerStore.getState().userName;
                    this.joinRoom(data.roomId, userName);
                    useSocialStore.getState().removeInvite(data.roomId);
                    toast.dismiss(t);
                  },
                  className: 'px-3 py-1 bg-primary text-black font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity'
                }, i18n.t('social.accept')),
                React.createElement('button', {
                  onClick: () => {
                    useSocialStore.getState().removeInvite(data.roomId);
                    toast.dismiss(t);
                  },
                  className: 'px-3 py-1 bg-foreground/10 hover:bg-foreground/20 text-foreground font-semibold text-xs rounded-lg transition-colors'
                }, i18n.t('social.decline'))
              )
            )
          ),
        { id: `jam-invite-${data.roomId}`, duration: 15000 }
      );
    });
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  initSocial(payload: { user: string; token?: string; salt?: string; url?: string; demoSessionId?: string }) {
    const demoSessionId = payload.demoSessionId || (typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined);
    this.socket?.emit('social_init', { ...payload, demoSessionId });
  }

  sendFriendRequest(target: string) {
    const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
    this.socket?.emit('social_sendFriendRequest', { target, demoSessionId });
  }

  respondFriendRequest(requesterId: string, action: 'accept' | 'reject') {
    const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
    this.socket?.emit('social_respondFriendRequest', { requesterId, action, demoSessionId });
  }

  removeFriend(friendId: string) {
    const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
    this.socket?.emit('social_removeFriend', { friendId, demoSessionId });
  }

  inviteFriendToJam(friendId: string, roomId: string, track?: any) {
    const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
    this.socket?.emit('jam_inviteFriend', { friendId, roomId, track, demoSessionId });
  }

  searchUsers(query: string): Promise<any[]> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve([]);
        return;
      }
      const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
      this.socket.emit('social_searchUsers', { query, demoSessionId }, (res: any) => {
        if (Array.isArray(res)) {
          resolve(res);
        } else if (res && Array.isArray(res.results)) {
          resolve(res.results);
        } else {
          resolve([]);
        }
      });
      this.socket.once('social_searchResults', (results: any) => {
        if (Array.isArray(results)) {
          resolve(results);
        }
      });
    });
  }

  createRoom(name?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.connect();
      if (!this.socket) {
        return reject(new Error('Failed to initialize socket'));
      }

      const onCreated = ({ roomId }: { roomId: string }) => {
        cleanup();
        resolve(roomId);
      };

      const onError = (err: any) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout creating room'));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timer);
        this.socket?.off('roomCreated', onCreated);
        this.socket?.off('error', onError);
      };

      this.socket.once('roomCreated', onCreated);
      this.socket.once('error', onError);

      const emitCreate = () => {
        const { isDemoMode, slotId } = useDemoStore.getState();
        const guestNick = slotId ? `${i18n.t('demo.guest', 'Гость')} #${slotId}` : i18n.t('demo.guest', 'Гость');
        const defaultNick = isDemoMode ? guestNick : (useAuthStore.getState().user || usePlayerStore.getState().userName || 'Host');
        const userName = isDemoMode ? guestNick : (name || defaultNick);
        const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
        this.socket?.emit('createRoom', { name: userName, sessionId: this.getSessionId(), demoSessionId });
      };

      if (this.socket.connected) {
        emitCreate();
      } else {
        this.socket.once('connect', emitCreate);
      }
    });
  }

  private getSessionId() {
    if (typeof window === 'undefined') return 'server';
    let sid = sessionStorage.getItem('jam_session_id');
    if (!sid) {
      sid = typeof crypto.randomUUID === 'function' 
        ? crypto.randomUUID() 
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      sessionStorage.setItem('jam_session_id', sid);
    }
    return sid;
  }

  joinRoom(roomId: string, name?: string) {
    const { isDemoMode, slotId } = useDemoStore.getState();
    const guestNick = slotId ? `${i18n.t('demo.guest', 'Гость')} #${slotId}` : i18n.t('demo.guest', 'Гость');
    const defaultNick = isDemoMode ? guestNick : (useAuthStore.getState().user || usePlayerStore.getState().userName || 'Guest');
    const userName = isDemoMode ? guestNick : (name || defaultNick);
    const demoSessionId = typeof window !== 'undefined' ? (sessionStorage.getItem('holad_demo_session_id') || undefined) : undefined;
    const { user, token, salt, url } = useAuthStore.getState();
    this.socket?.emit('joinRoom', { 
      roomId, 
      name: userName, 
      sessionId: this.getSessionId(),
      demoSessionId,
      auth: { user, token, salt, url }
    });
  }

  grantRole(userId: string, role: 'host' | 'cohost' | 'listener') {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('grantRole', { roomId, userId, role });
    }
  }

  kickParticipant(userId: string) {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('kickParticipant', { roomId, userId });
    }
  }

  syncSeek(currentTime: number) {
    const state = usePlayerStore.getState();
    if (!state.roomId || (state.role !== 'host' && state.role !== 'cohost')) return;
    const currentTrack = state.queue[state.currentIndex];
    if (!currentTrack) return;

    const settings = useSettingsStore.getState();
    this.latestStateVersion += 1;
    this.socket?.emit('syncState', {
      roomId: state.roomId,
      trackId: currentTrack.id,
      currentTime,
      isPlaying: state.isPlaying,
      currentIndex: state.currentIndex,
      isAutoDjEnabled: state.isAutoDjEnabled,
      version: this.latestStateVersion,
      isCrossfadeEnabled: settings.isCrossfadeEnabled,
      crossfadeDuration: settings.crossfadeDuration,
      crossfadeCurve: settings.crossfadeCurve,
      isGaplessEnabled: settings.isGaplessEnabled,
      isSeek: true
    });
  }

  trackEnded(trackId?: string, currentIndex?: number, repeatMode?: 'none' | 'all' | 'one') {
    const state = usePlayerStore.getState();
    if (!state.roomId || (state.role !== 'host' && state.role !== 'cohost')) return;

    const now = Date.now();
    const trackKey = trackId || `${currentIndex ?? state.currentIndex}`;
    if (this.lastTrackEndedId === trackKey && (now - this.lastTrackEndedTime < 3000)) {
      return; // deduplicate within 3 seconds
    }
    this.lastTrackEndedId = trackKey;
    this.lastTrackEndedTime = now;

    this.socket?.emit('jam_trackEnded', {
      roomId: state.roomId,
      trackId: trackId || (state.queue[state.currentIndex]?.id),
      currentIndex: currentIndex ?? state.currentIndex,
      repeatMode: repeatMode ?? state.repeatMode
    });
  }

  updateAudioMode(mode: 'speaker_dj' | 'synced_audio') {
    const state = usePlayerStore.getState();
    if (!state.roomId || state.role !== 'host') return;
    const currentTrack = state.queue[state.currentIndex];
    const settings = useSettingsStore.getState();
    this.socket?.emit('syncState', {
      roomId: state.roomId,
      trackId: currentTrack?.id || '',
      currentTime: (useAudioStore.getState().progress / 100) * (currentTrack?.duration || 0),
      isPlaying: state.isPlaying,
      currentIndex: state.currentIndex,
      isAutoDjEnabled: state.isAutoDjEnabled,
      isCrossfadeEnabled: settings.isCrossfadeEnabled,
      crossfadeDuration: settings.crossfadeDuration,
      crossfadeCurve: settings.crossfadeCurve,
      isGaplessEnabled: settings.isGaplessEnabled,
      hostAudioMode: mode
    });
  }

  leaveRoom() {
    const { roomId } = usePlayerStore.getState();
    if (roomId) {
      this.socket?.emit('leaveRoom', roomId); // Optional implement on server
    }
    usePlayerStore.getState().setRoomInfo(null, null);
    this.stopHostSync();
  }

  private startHostSync() {
    this.stopHostSync();
    
    // Send initial queue
    const state = usePlayerStore.getState();
    if (state.roomId && state.queue.length > 0 && state.role === 'host') {
      this.socket?.emit('syncQueue', { roomId: state.roomId, queue: state.queue, currentIndex: state.currentIndex });
    }

    if (state.role === 'host' || state.role === 'cohost') {
      this.syncInterval = setInterval(() => {
        const state = usePlayerStore.getState();
        if (state.roomId && state.queue.length > 0 && state.currentIndex >= 0 && state.currentIndex < state.queue.length && (state.role === 'host' || state.role === 'cohost')) {
          const isSpeakerDj = useSocialStore.getState().audioMode === 'speaker_dj';
          // Remote control device does not output audio locally, so it must not broadcast local engine time
          if (isSpeakerDj) return;

          // If this is cohost, only broadcast time if host is in speaker_dj (remote control)
          if (state.role === 'cohost' && state.hostAudioMode !== 'speaker_dj') return;

          const currentTrack = state.queue[state.currentIndex];
          
          let currentTime = 0;
          
          const holadState = useHoladStore.getState();
          const isDeviceActive = holadState.roomId === null || holadState.activeDeviceId === holadState.deviceId || holadState.activeDeviceId === null;
          
          if (isDeviceActive) {
            const engine = getAudioEngine();
            if (engine) {
              currentTime = engine.getCurrentTime();
            }
          } else {
            currentTime = (useAudioStore.getState().progress / 100) * (currentTrack.duration || 0);
          }

          const settings = useSettingsStore.getState();
          const hostAudioMode = state.role === 'host' ? useSocialStore.getState().audioMode : undefined;
          this.socket?.emit('syncState', {
            roomId: state.roomId,
            trackId: currentTrack.id,
            currentTime,
            isPlaying: state.isPlaying,
            currentIndex: state.currentIndex,
            isAutoDjEnabled: state.isAutoDjEnabled,
            version: this.latestStateVersion,
            isCrossfadeEnabled: settings.isCrossfadeEnabled,
            crossfadeDuration: settings.crossfadeDuration,
            crossfadeCurve: settings.crossfadeCurve,
            isGaplessEnabled: settings.isGaplessEnabled,
            hostAudioMode
          });
        }
      }, 2000); // Send sync ping every 2 seconds
    }

    this.unsubscribeStore = usePlayerStore.subscribe((newState, prevState) => {
      if (this.isApplyingRemoteState) return;
      
      if (newState.roomId && (newState.role === 'host' || newState.role === 'cohost')) {
        const queueChanged = newState.queue !== prevState.queue;
        const indexChanged = newState.currentIndex !== prevState.currentIndex;

        if (queueChanged || indexChanged) {
          this.socket?.emit('syncQueue', { roomId: newState.roomId, queue: newState.queue, currentIndex: newState.currentIndex });
        }
        if (newState.isPlaying !== prevState.isPlaying || queueChanged || indexChanged) {
          const currentTrack = newState.queue[newState.currentIndex];
          if (currentTrack) {
            const prevTrackId = prevState.queue[prevState.currentIndex]?.id;
            const trackChanged = currentTrack.id !== prevTrackId;
            const isSpeakerDj = useSocialStore.getState().audioMode === 'speaker_dj';
            
            let currentTime = 0;
            const holadState = useHoladStore.getState();
            const isDeviceActive = holadState.roomId === null || holadState.activeDeviceId === holadState.deviceId || holadState.activeDeviceId === null;

            if (trackChanged) {
              currentTime = 0;
            } else if (isSpeakerDj) {
              currentTime = (useAudioStore.getState().progress / 100) * (currentTrack.duration || 0);
            } else if (isDeviceActive) {
              const engine = getAudioEngine();
              if (engine) {
                currentTime = engine.getCurrentTime();
              }
            } else {
              currentTime = (useAudioStore.getState().progress / 100) * (currentTrack.duration || 0);
            }
            
            const settings = useSettingsStore.getState();
            const hostAudioMode = newState.role === 'host' ? useSocialStore.getState().audioMode : undefined;
            this.socket?.emit('syncState', {
              roomId: newState.roomId,
              trackId: currentTrack.id,
              currentTime,
              isPlaying: newState.isPlaying,
              currentIndex: newState.currentIndex,
              isAutoDjEnabled: newState.isAutoDjEnabled,
              isCrossfadeEnabled: settings.isCrossfadeEnabled,
              crossfadeDuration: settings.crossfadeDuration,
              crossfadeCurve: settings.crossfadeCurve,
              isGaplessEnabled: settings.isGaplessEnabled,
              hostAudioMode
            });
          }
        }
      }
    });
  }

  private stopHostSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
  }

  private applySyncState(state: any) {
    this.isApplyingRemoteState = true;
    try {
      const { currentTime, isPlaying, currentIndex, queue, isAutoDjEnabled, isCrossfadeEnabled, crossfadeDuration, crossfadeCurve, isGaplessEnabled, isSeek } = state;
      const store = usePlayerStore.getState();

      if (isCrossfadeEnabled !== undefined) {
        usePlayerStore.getState().setHostSettings({
          isCrossfadeEnabled,
          crossfadeDuration,
          crossfadeCurve,
          isGaplessEnabled
        });
      }

      if (state.hostAudioMode !== undefined) {
        usePlayerStore.getState().setHostAudioMode(state.hostAudioMode);
      }

      // trackChanged removed
      
      const sanitizedQueue = queue ? sanitizeTracks(queue) : queue;
      const isQueueDifferent = () => {
        if (!sanitizedQueue || sanitizedQueue.length === 0) return false;
        if (!store.queue || sanitizedQueue.length !== store.queue.length) return true;
        for (let i = 0; i < sanitizedQueue.length; i++) {
          if (sanitizedQueue[i].id !== store.queue[i].id) return true;
        }
        return false;
      };

      const currentTrackId = store.queue && store.queue[store.currentIndex]?.id;
      const newQueue = sanitizedQueue || store.queue;
      const newIndex = currentIndex !== undefined ? currentIndex : store.currentIndex;
      const newTrackId = newQueue && newQueue[newIndex]?.id;
      const actualTrackChanged = currentTrackId !== newTrackId;

      // Apply queue if present (initial join or real change)
      if (isQueueDifferent()) {
        usePlayerStore.setState({ queue: sanitizedQueue, currentIndex: currentIndex !== undefined ? currentIndex : 0 });
      } else if (currentIndex !== undefined && currentIndex !== store.currentIndex) {
        usePlayerStore.setState({ currentIndex });
      }

      if (actualTrackChanged && currentTime > 0) {
        usePlayerStore.getState().setInitialPosition(currentTime * 1000);
      }

      if (isAutoDjEnabled !== undefined && isAutoDjEnabled !== store.isAutoDjEnabled) {
        usePlayerStore.setState({ isAutoDjEnabled });
      }

      const engine = getAudioEngine();
      const isSpeakerDj = store.roomId !== null && useSocialStore.getState().audioMode === 'speaker_dj';
      
      if (engine) {
        if (isSpeakerDj) {
          engine.pause();
          store.setIsPlaying(isPlaying);
          if (!useAudioStore.getState().isSeeking) {
            const trackDur = (newQueue && newQueue[newIndex]?.duration) || 0;
            if (trackDur > 0) {
              useAudioStore.getState().setProgress((currentTime / trackDur) * 100);
            }
          }
          return;
        }

        if (isPlaying && engine.getState() !== 'playing') {
          engine.resume().catch((e: any) => console.error("Playback prevented", e));
          store.setIsPlaying(true);
        } else if (!isPlaying && engine.getState() === 'playing') {
          engine.pause();
          store.setIsPlaying(false);
          engine.setPlaybackRate(1.0); // Reset rate on pause
        }

        if (isPlaying || isSeek) {
          const isEngineOnTargetTrack = engine.getActiveTrackId() === newTrackId;
          if (!isEngineOnTargetTrack) {
            console.log('Skipping sync: AudioEngine is still transitioning to the target track');
            return;
          }

          // Compensate for network latency (~150ms) if playing, no compensation if paused
          const targetTime = isPlaying ? (currentTime + 0.15) : currentTime;
          const drift = targetTime - engine.getCurrentTime();
          
          // Dynamic hard sync threshold: be aggressive at the start of a track or on explicit seek
          const isEarlyInTrack = engine.getCurrentTime() < 5;
          const hardSyncThreshold = (isSeek || isEarlyInTrack) ? 0.3 : 2.0;

          if (isSeek || Math.abs(drift) > hardSyncThreshold) {
            console.log(`Seek or large drift detected (${Math.abs(drift).toFixed(2)}s), hard seeking to match`);
            engine.seek(targetTime);
            engine.setPlaybackRate(1.0);
            if (!isPlaying) {
              const dur = engine.getDuration() || (newQueue && newQueue[newIndex]?.duration) || 0;
              if (dur > 0) {
                useAudioStore.getState().setProgress((targetTime / dur) * 100);
              }
            }
          } else if (isPlaying && drift > 0.15) {
            // We are behind the host, speed up
            engine.setPlaybackRate(1.05);
            console.log(`Soft sync: Catching up (+${drift.toFixed(2)}s)`);
          } else if (isPlaying && drift < -0.15) {
            // We are ahead of the host, slow down
            engine.setPlaybackRate(0.95);
            console.log(`Soft sync: Waiting (-${Math.abs(drift).toFixed(2)}s)`);
          } else if (isPlaying) {
            // Perfect sync
            engine.setPlaybackRate(1.0);
            console.log("Soft sync: Perfectly in sync");
          }
        }
      }
    } finally {
      setTimeout(() => { this.isApplyingRemoteState = false; }, 100);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export const jamSocket = new JamSocketService();
