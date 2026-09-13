import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { fetchStarred, getPlayQueue, savePlayQueue, getCoverArtUrl } from '../api/subsonic';
import { fetchExclusions } from '../api/exclusions';
import { syncHistoryWithServer } from '../api/history';
import { fetchPreferences } from '../api/preferences';
import { fetchIntegrations } from '../api/integrations';
import { fetchPlaybackState } from '../api/playback';
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
  const isJamRoute = location.pathname.startsWith('/jam');
  const queueFetched = useRef(false);

  useEffect(() => {
    // Only connect if authenticated OR if we are on a jam route
    if (!isAuthenticated && !isJamRoute) return;
    
    jamSocket.connect();
    
    if (isAuthenticated && typeof user === 'string') {
      const targetRoom = (isDemoMode && guestUserId) ? guestUserId : user;
      useHoladStore.getState().connect(targetRoom);
      useSocialStore.getState().initSocial();
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
          setExcludedItems(exclusions.excludedTrackIds, exclusions.excludedAlbumIds, exclusions.excludedFingerprints);
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
      getPlayQueue().then(queueData => {
        const currentStore = usePlayerStore.getState();
        const localQueue = currentStore.queue || [];
        const localIndex = currentStore.currentIndex;
        const localCurrentTrack = localIndex >= 0 && localIndex < localQueue.length ? localQueue[localIndex] : null;

        if (queueData && Array.isArray(queueData.entry) && queueData.entry.length > 0) {
          const mappedTracks: Track[] = queueData.entry.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            artistId: t.artistId,
            coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
            duration: t.duration,
            bitRate: t.bitRate,
            suffix: t.suffix
          }));
          
          // Reconcile current index:
          // 1. Check if queueData.current matches an id in mappedTracks
          let initialIndex = -1;
          if (queueData.current) {
            initialIndex = mappedTracks.findIndex(t => t.id === queueData.current);
          }
          // 2. If not found, check if localCurrentTrack id matches
          if (initialIndex === -1 && localCurrentTrack?.id) {
            initialIndex = mappedTracks.findIndex(t => t.id === localCurrentTrack.id);
          }
          // 3. If not found, check title + artist matching (in case Navidrome 0.64.0 migrated IDs!)
          if (initialIndex === -1 && localCurrentTrack?.title) {
            const locTitle = localCurrentTrack.title.toLowerCase().trim();
            const locArtist = (localCurrentTrack.artist || '').toLowerCase().trim();
            initialIndex = mappedTracks.findIndex(t => 
              t.title?.toLowerCase().trim() === locTitle && 
              (!locArtist || t.artist?.toLowerCase().trim() === locArtist)
            );
          }
          // 4. If still not found, preserve user's localIndex if valid
          if (initialIndex === -1 && localIndex >= 0 && localIndex < mappedTracks.length) {
            initialIndex = localIndex;
          }
          // 5. Fallback to 0 if nothing matched
          if (initialIndex === -1) {
            initialIndex = 0;
          }

          let pos = queueData.position || 0;
          if (pos === 0) {
            const savedTrack = localStorage.getItem('holad_track');
            const savedTime = localStorage.getItem('holad_time');
            const activeId = mappedTracks[initialIndex]?.id;
            if (savedTrack && (savedTrack === queueData.current || savedTrack === activeId) && savedTime) {
              pos = parseFloat(savedTime) * 1000;
            }
          }

          usePlayerStore.setState({
            queue: mappedTracks,
            originalQueue: mappedTracks,
            currentIndex: initialIndex,
            isPlaying: false, 
            initialPosition: pos
          });

          if (pos === 0) {
            fetchPlaybackState().then(pbState => {
              if (pbState && pbState.position && (pbState.song_id === queueData.current || pbState.song_id === mappedTracks[initialIndex]?.id)) {
                usePlayerStore.setState({ initialPosition: pbState.position * 1000 });
              }
            }).catch(() => {});
          }
        } else if (localQueue.length > 0) {
          // Server has no play queue, but user has an existing local queue in localStorage.
          // Preserve local queue and sync it to server so both stay in sync!
          const activeIndex = Math.max(0, Math.min(localQueue.length - 1, localIndex >= 0 ? localIndex : 0));
          const currentTrack = localQueue[activeIndex];
          const trackIds = localQueue.map(t => t.id);
          if (currentTrack) {
            savePlayQueue(trackIds, currentTrack.id, 0).catch(() => {});
          }
          usePlayerStore.setState({
            originalQueue: currentStore.originalQueue && currentStore.originalQueue.length > 0 ? currentStore.originalQueue : localQueue,
            currentIndex: activeIndex,
            isPlaying: false
          });
        }
      }).catch(e => console.error("Failed to fetch play queue", e));
    }
  }, [isAuthenticated, user, roomToJoin, trackId, albumId, setLikedItems, setExcludedItems, isJamRoute, isDemoMode, guestUserId]);

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
