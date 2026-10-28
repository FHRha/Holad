import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useAuthStore } from '../store/authStore';
import { fetchStarred, getCoverArtUrl } from '../api/subsonic';
import { fetchExclusions, syncSetExclusions } from '../api/exclusions';
import { syncHistoryWithServer } from '../api/history';
import { fetchPreferences } from '../api/preferences';
import { fetchIntegrations } from '../api/integrations';
import { fetchPlaybackState, savePlaybackState } from '../api/playbackState';
import { toCompactQueue } from '../store/slices/queueSlice';
import { useSettingsStore } from '../store/settingsStore';
import { jamSocket } from '../api/socket';
import { useHoladStore } from '../store/holadStore';
import { useSocialStore } from '../store/socialStore';
import { useDemoStore } from '../store/demoStore';
import type { Track } from '../types';

export function useAppInitialization() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const albumId = searchParams.get('album');
  
  const setLikedItems = usePlayerStore(state => state.setLikedItems);
  const setExcludedItems = usePlayerStore(state => state.setExcludedItems);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const isDemoMode = useDemoStore(state => state.isDemoMode);
  const guestUserId = useDemoStore(state => state.guestUserId);
  const isHoladConnectEnabled = useSettingsStore(state => state.isHoladConnectEnabled);
  const isJamRoute = location.pathname.startsWith('/jam');
  const queueFetched = useRef(false);

  useEffect(() => {
    // Only connect if authenticated OR if we are on a jam route
    if (!isAuthenticated && !isJamRoute) return;
    
    jamSocket.connect();
    
    if (isAuthenticated && typeof user === 'string' && isHoladConnectEnabled) {
      const targetRoom = (isDemoMode && guestUserId) ? guestUserId : user;
      useHoladStore.getState().connect(targetRoom);
      useSocialStore.getState().initSocial();
    } else {
      useHoladStore.getState().disconnect();
    }
    
    // Connection logic is now handled in JamLayout if needed
    // We only connect for global listeners if needed, but jam routing handles the join.

    if (isAuthenticated) {
      fetchStarred().then(data => {
        const trackIds = data.song?.map((t: any) => t.id) || [];
        const albumIds = data.album?.map((a: any) => a.id) || [];
        setLikedItems(trackIds, albumIds);
      }).catch(e => console.error("Failed to fetch starred items", e));

      fetchExclusions().then(exclusions => {
        if (exclusions) {
          const currentStore = usePlayerStore.getState();
          const localTrackIds = currentStore.excludedTrackIds || [];
          const localAlbumIds = currentStore.excludedAlbumIds || [];
          const localFingerprints = currentStore.excludedFingerprints || [];

          const mergedTrackIds = Array.from(new Set([...exclusions.excludedTrackIds, ...localTrackIds]));
          const mergedAlbumIds = Array.from(new Set([...exclusions.excludedAlbumIds, ...localAlbumIds]));
          const mergedFingerprints = Array.from(new Set([
            ...(exclusions.excludedFingerprints || []),
            ...localFingerprints
          ]));

          setExcludedItems(mergedTrackIds, mergedAlbumIds, mergedFingerprints);

          // If local had items not present on server, sync them to server
          const hasLocalOnlyTracks = localTrackIds.some(id => !exclusions.excludedTrackIds.includes(id));
          const hasLocalOnlyAlbums = localAlbumIds.some(id => !exclusions.excludedAlbumIds.includes(id));
          if (hasLocalOnlyTracks || hasLocalOnlyAlbums) {
            syncSetExclusions(mergedTrackIds, mergedAlbumIds).catch(err => {
              console.error('Failed to sync merged exclusions to server:', err);
            });
          }
        }
      }).catch(e => console.error("Failed to fetch exclusions", e));

      syncHistoryWithServer().catch(e => console.error("Failed to sync history with server", e));

      fetchPreferences().then(prefs => {
        if (prefs) {
          const { syncTheme, syncLanguage, setTheme, setAccentColor, setCustomColor, setLanguage } = useSettingsStore.getState();
          if (syncTheme) {
            if (prefs.theme && (prefs.theme === 'dark' || prefs.theme === 'light' || prefs.theme === 'system')) {
              setTheme(prefs.theme);
            }
            if (prefs.accent_color) {
              setAccentColor(prefs.accent_color);
            }
            if (prefs.custom_colors) {
              try {
                const colors = typeof prefs.custom_colors === 'string' ? JSON.parse(prefs.custom_colors) : prefs.custom_colors;
                if (Array.isArray(colors)) {
                  colors.forEach((col: string, idx: number) => {
                    if (idx < 3) setCustomColor(idx, col);
                  });
                }
              } catch {}
            }
          }
          if (syncLanguage && prefs.language) {
            setLanguage(prefs.language);
          }
        }
      }).catch(e => console.error("Failed to fetch preferences", e));

      fetchIntegrations().then(items => {
        if (Array.isArray(items)) {
          const { setLastFmKey, setUseLastFm, setYandexToken, setUseYandex } = useSettingsStore.getState();
          for (const item of items) {
            if (item.integration_name === 'lastfm') {
              if (item.token) {
                setLastFmKey(item.token);
                setUseLastFm(item.enabled !== false);
              }
            } else if (item.integration_name === 'yandex') {
              if (item.token) {
                setYandexToken(item.token);
                setUseYandex(item.enabled !== false);
              }
            }
          }
        }
      }).catch(e => console.error("Failed to fetch integrations", e));
    }

    // Do not load default play queue if on a Jam route or joining a room
    if (!isJamRoute && !roomToJoin && !queueFetched.current) {
      queueFetched.current = true;

      const currentStore = usePlayerStore.getState();
      const localQueue = currentStore.queue || [];
      const localIndex = currentStore.currentIndex;
      const localCurrentTrack = localIndex >= 0 && localIndex < localQueue.length ? localQueue[localIndex] : null;

      const savedTrack = localStorage.getItem('holad_track');
      const savedTime = localStorage.getItem('holad_time');
      
      let localPosMs = 0;
      if (savedTime && (!savedTrack || savedTrack === localCurrentTrack?.id)) {
        const parsed = parseFloat(savedTime) * 1000;
        if (!isNaN(parsed) && parsed > 0) {
          localPosMs = parsed;
        }
      }

      // Initial offline restoration from local cache if present
      if (localPosMs > 0 && currentStore.initialPosition === 0) {
        usePlayerStore.setState({ initialPosition: localPosMs });
        const trackDur = localCurrentTrack?.duration || 0;
        if (trackDur > 0) {
          useAudioStore.getState().setDuration(trackDur);
          useAudioStore.getState().setProgress(((localPosMs / 1000) / trackDur) * 100);
        }
      }

      fetchPlaybackState().then(serverState => {
        const holadState = useHoladStore.getState();
        // If Holad Connect socket is connected and already has an active room snapshot from the server,
        // drop the stale HTTP response so it doesn't overwrite the fresh realtime socket state
        if (holadState.roomId && holadState.snapshot && holadState.snapshot.version > 0) {
          return;
        }

        // If the device is in a Holad Connect room and is not the active device, don't overwrite playerStore
        if (holadState.roomId && holadState.activeDeviceId && holadState.activeDeviceId !== holadState.deviceId) {
          return;
        }

        const storeNow = usePlayerStore.getState();
        const activeLocalQueue = storeNow.queue || [];
        const activeLocalIndex = storeNow.currentIndex;
        const activeLocalTrack = activeLocalIndex >= 0 && activeLocalIndex < activeLocalQueue.length ? activeLocalQueue[activeLocalIndex] : null;
        const curSavedUpdatedStr = localStorage.getItem('holad_time_updated');
        const curLocalTimeUpdated = curSavedUpdatedStr ? parseInt(curSavedUpdatedStr, 10) : 0;
        const currentLocalUpdatedAt = Math.max(storeNow.playbackUpdatedAt || 0, curLocalTimeUpdated || 0);

        if (!serverState) {
          // Server has no state. If local has tracks, save local state to server
          if (activeLocalQueue.length > 0 && activeLocalTrack) {
            savePlaybackState({
              queue: toCompactQueue(activeLocalQueue),
              queueVersion: storeNow.queueVersion || '',
              currentIndex: activeLocalIndex >= 0 ? activeLocalIndex : 0,
              songId: activeLocalTrack.id,
              position: Math.round(localPosMs / 1000),
              isPlaying: false,
              isShuffled: storeNow.isShuffle,
              repeatMode: storeNow.repeatMode,
              updatedAt: currentLocalUpdatedAt || Date.now()
            }).catch(() => {});
          }
          return;
        }

        const serverUpdatedAt = serverState.updated_at || 0;

        // Last-Write-Wins (LWW)
        if (serverUpdatedAt > currentLocalUpdatedAt) {
          // Server is newer! Apply server state (queue, current track, position)
          if (Array.isArray(serverState.queue) && serverState.queue.length > 0) {
            const mappedTracks: Track[] = serverState.queue.map((t: any) => ({
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

            let targetIndex = typeof serverState.current_index === 'number' ? serverState.current_index : 0;
            if (serverState.song_id) {
              const foundIdx = mappedTracks.findIndex(t => t.id === serverState.song_id);
              if (foundIdx !== -1) targetIndex = foundIdx;
            }
            if (targetIndex < 0 || targetIndex >= mappedTracks.length) {
              targetIndex = 0;
            }

            const serverPosMs = Math.round((serverState.position || 0) * 1000);

            useHoladStore.getState().setIsApplyingRemoteState(true);
            usePlayerStore.setState({
              queue: mappedTracks,
              originalQueue: mappedTracks,
              currentIndex: targetIndex,
              isPlaying: false,
              initialPosition: serverPosMs,
              isShuffle: serverState.is_shuffled ?? storeNow.isShuffle,
              repeatMode: (serverState.repeat_mode as any) ?? storeNow.repeatMode,
              queueVersion: serverState.queue_version || '',
              playbackUpdatedAt: serverUpdatedAt
            });
            setTimeout(() => {
              useHoladStore.getState().setIsApplyingRemoteState(false);
            }, 50);

            const trackDur = mappedTracks[targetIndex]?.duration || 0;
            if (trackDur > 0) {
              useAudioStore.getState().setDuration(trackDur);
              if (serverPosMs > 0) {
                useAudioStore.getState().setProgress(((serverPosMs / 1000) / trackDur) * 100);
              }
            }
          }
        } else {
          // Local state is newer or equal (e.g. offline playback)
          if (activeLocalQueue.length > 0 && activeLocalTrack) {
            savePlaybackState({
              queue: toCompactQueue(activeLocalQueue),
              queueVersion: storeNow.queueVersion || '',
              currentIndex: activeLocalIndex >= 0 ? activeLocalIndex : 0,
              songId: activeLocalTrack.id,
              position: Math.round(localPosMs / 1000),
              isPlaying: false,
              isShuffled: storeNow.isShuffle,
              repeatMode: storeNow.repeatMode,
              updatedAt: currentLocalUpdatedAt || Date.now()
            }).catch(() => {});
          }
        }
      }).catch(e => console.error("Failed to fetch playback state", e));
    }
  }, [isAuthenticated, user, roomToJoin, trackId, albumId, setLikedItems, setExcludedItems, isJamRoute, isDemoMode, guestUserId, isHoladConnectEnabled]);

  // Online network listener for synchronizing pending changes
  useEffect(() => {
    const handleOnline = () => {
      // 1. Synchronize exclusions
      fetchExclusions().then(exclusions => {
        if (exclusions) {
          const currentStore = usePlayerStore.getState();
          const localTrackIds = currentStore.excludedTrackIds || [];
          const localAlbumIds = currentStore.excludedAlbumIds || [];
          const localFingerprints = currentStore.excludedFingerprints || [];

          const mergedTrackIds = Array.from(new Set([...exclusions.excludedTrackIds, ...localTrackIds]));
          const mergedAlbumIds = Array.from(new Set([...exclusions.excludedAlbumIds, ...localAlbumIds]));
          const mergedFingerprints = Array.from(new Set([
            ...(exclusions.excludedFingerprints || []),
            ...localFingerprints
          ]));

          currentStore.setExcludedItems(mergedTrackIds, mergedAlbumIds, mergedFingerprints);

          const hasLocalOnlyTracks = localTrackIds.some(id => !exclusions.excludedTrackIds.includes(id));
          const hasLocalOnlyAlbums = localAlbumIds.some(id => !exclusions.excludedAlbumIds.includes(id));
          if (hasLocalOnlyTracks || hasLocalOnlyAlbums) {
            syncSetExclusions(mergedTrackIds, mergedAlbumIds).catch(() => {});
          }
        }
      }).catch(() => {});

      // 2. Synchronize history
      syncHistoryWithServer().catch(() => {});

      // 3. Synchronize playback state (LWW)
      fetchPlaybackState().then(serverState => {
        if (!serverState) return;
        const holadState = useHoladStore.getState();
        // If Holad Connect socket is connected and already has an active room snapshot from the server,
        // drop the stale HTTP response so it doesn't overwrite the fresh realtime socket state
        if (holadState.roomId && holadState.snapshot && holadState.snapshot.version > 0) {
          return;
        }
        if (holadState.roomId && holadState.activeDeviceId && holadState.activeDeviceId !== holadState.deviceId) {
          return;
        }
        const currentStore = usePlayerStore.getState();
        const savedUpdatedStr = localStorage.getItem('holad_time_updated');
        const localTimeUpdated = savedUpdatedStr ? parseInt(savedUpdatedStr, 10) : 0;
        const localUpdatedAt = Math.max(currentStore.playbackUpdatedAt || 0, localTimeUpdated || 0);

        if (serverState.updated_at > localUpdatedAt) {
          if (Array.isArray(serverState.queue) && serverState.queue.length > 0) {
            const mappedTracks: Track[] = serverState.queue.map((t: any) => ({
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
            let targetIndex = typeof serverState.current_index === 'number' ? serverState.current_index : 0;
            if (serverState.song_id) {
              const foundIdx = mappedTracks.findIndex(t => t.id === serverState.song_id);
              if (foundIdx !== -1) targetIndex = foundIdx;
            }
            if (targetIndex < 0 || targetIndex >= mappedTracks.length) targetIndex = 0;
            const serverPosMs = Math.round((serverState.position || 0) * 1000);

            useHoladStore.getState().setIsApplyingRemoteState(true);
            usePlayerStore.setState({
              queue: mappedTracks,
              originalQueue: mappedTracks,
              currentIndex: targetIndex,
              isPlaying: false,
              initialPosition: serverPosMs,
              isShuffle: serverState.is_shuffled ?? currentStore.isShuffle,
              repeatMode: (serverState.repeat_mode as any) ?? currentStore.repeatMode,
              queueVersion: serverState.queue_version || '',
              playbackUpdatedAt: serverState.updated_at
            });
            setTimeout(() => {
              useHoladStore.getState().setIsApplyingRemoteState(false);
            }, 50);
          }
        } else if (localUpdatedAt > serverState.updated_at) {
          const curTrack = currentStore.queue[currentStore.currentIndex];
          if (curTrack && currentStore.queue.length > 0) {
            const savedTime = localStorage.getItem('holad_time');
            const pos = savedTime ? Math.round(parseFloat(savedTime)) : 0;
            savePlaybackState({
              queue: toCompactQueue(currentStore.queue),
              queueVersion: currentStore.queueVersion || '',
              currentIndex: currentStore.currentIndex >= 0 ? currentStore.currentIndex : 0,
              songId: curTrack.id,
              position: pos,
              isPlaying: false,
              isShuffled: currentStore.isShuffle,
              repeatMode: currentStore.repeatMode,
              updatedAt: localUpdatedAt
            }).catch(() => {});
          }
        }
      }).catch(() => {});
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    // When on /jam routes, JamLayout manages the room lifecycle, playback and layout directly
    if (location.pathname.startsWith('/jam')) {
      return;
    }

    const jamParam = searchParams.get('jam');
    const isJoinRoute = location.pathname.startsWith('/join');
    const roomParam = isJoinRoute ? searchParams.get('room') : (searchParams.get('room') || null);
    const targetRoom = jamParam || roomParam;

    if (targetRoom) {
      if (isAuthenticated) {
        const userName = !isDemoMode && typeof user === 'string' ? user : undefined;
        jamSocket.joinRoom(targetRoom, userName);
        navigate('/', { replace: true });
      } else if (!isJoinRoute) {
        navigate(`/jam/?room=${encodeURIComponent(targetRoom)}`, { replace: true });
      }
    }
  }, [isAuthenticated, searchParams, location.pathname, user, navigate, isDemoMode]);

  return { isAuthenticated, isJamRoute };
}
