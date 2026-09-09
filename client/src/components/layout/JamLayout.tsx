import { Routes, Route, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import { getSong, getCoverArtUrl, getAlbumFull } from '../../api/subsonic';
import { getPlaylist } from '../../api/subsonic/playlists';
import { usePlaylistStore } from '../../store/playlistStore';
import { getOfflineTracks } from '../../store/downloadStore';
import { getHoladServerUrl } from '../../utils/serverConfig';
import TopBar from './TopBar';
import AlbumsView from '../views/AlbumsView';
import ArtistsView from '../views/ArtistsView';
import TracksView from '../views/TracksView';
import AlbumView from '../views/AlbumView';
import ArtistView from '../views/ArtistView';
import PlaylistDetailView from '../views/PlaylistDetailView';
import RightSidebar from './RightSidebar';
import Sidebar from './Sidebar';
import MainContent from './MainContent';
import { useTranslation } from 'react-i18next';
import ThemeSelector from '../common/ThemeSelector';
import LanguageSelector from '../common/LanguageSelector';
import { useDemoStore } from '../../store/demoStore';

async function resolveTracksFromIds(trackIds: string[]) {
  const offlineTracks = getOfflineTracks();
  const resolvedEntries = [];
  for (const tid of trackIds) {
    let track = offlineTracks.find(t => t.id === tid);
    if (!track) {
      try {
        track = await getSong(tid);
      } catch (e) {
        console.error('Failed to fetch song for custom playlist', e);
      }
    }
    if (track) {
      resolvedEntries.push(track);
    }
  }
  return resolvedEntries.map((t: any) => ({
    id: t.id,
    title: t.title || t.name,
    artist: t.artist,
    album: t.album,
    albumId: t.albumId,
    artistId: t.artistId,
    coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
    duration: t.duration,
    bitRate: t.bitRate,
    suffix: t.suffix
  }));
}

export default function JamLayout() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const searchRoom = searchParams.get('room');
  const searchTrack = searchParams.get('track');
  const searchAlbum = searchParams.get('album');
  const searchPlaylist = searchParams.get('playlist');
  const searchQueue = searchParams.get('queue');

  const matchTrack = location.pathname.match(/\/jam\/track\/([^/?#]+)/i);
  const matchAlbum = location.pathname.match(/\/jam\/(?:library\/)?album\/([^/?#]+)/i);
  const matchPlaylist = location.pathname.match(/\/jam\/(?:library\/)?playlist\/([^/?#]+)/i);

  const roomToJoin = searchRoom;
  const trackId = searchTrack || (matchTrack ? matchTrack[1] : null);
  const albumId = searchAlbum || (matchAlbum ? matchAlbum[1] : null);
  const playlistId = searchPlaylist || (matchPlaylist ? matchPlaylist[1] : null);

  const queueIds = searchQueue
    ? searchQueue
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 200)
    : [];

  const isValidStandaloneTrack = Boolean(trackId && trackId.trim() !== '');
  const isValidStandaloneAlbum = Boolean(albumId && albumId.trim() !== '');
  const isValidStandalonePlaylist = Boolean(playlistId && playlistId.trim() !== '');
  const isValidStandaloneQueue = Boolean(searchQueue && searchQueue.trim() !== '');
  const isStandalone = !roomToJoin && (isValidStandaloneTrack || isValidStandaloneAlbum || isValidStandalonePlaylist || isValidStandaloneQueue);

  const { setQueueAndPlay, jamError, userName, setUserName } = usePlayerStore();
  const role = usePlayerStore(state => state.role);
  const { isDemoMode, isCheckingDemo, slotId } = useDemoStore();
  
  const effectiveUserName = (isDemoMode && slotId)
    ? `${t('demo.guest', 'Гость')} #${slotId}`
    : (userName || (isDemoMode ? t('demo.guest', 'Гость') : ''));
  
  const [localName, setLocalName] = useState('');
  const hasJoined = useRef(false);
  const loadedTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (isCheckingDemo) return;

    // If it's a room and we have a username or we are the host, connect
    const currentRole = usePlayerStore.getState().role;
    if (roomToJoin && (effectiveUserName || currentRole === 'host') && !hasJoined.current) {
      if (effectiveUserName && effectiveUserName !== userName) {
        usePlayerStore.setState({ userName: effectiveUserName });
      }
      jamSocket.connect();
      jamSocket.joinRoom(roomToJoin, effectiveUserName);
      hasJoined.current = true;
    }
  }, [roomToJoin, effectiveUserName, userName, isCheckingDemo]);

  // Force fullscreen player open for listeners and standalone users
  useEffect(() => {
    if (role === 'listener' || isStandalone) {
      usePlayerStore.getState().setIsMinimized(false);
    }
  }, [role, isStandalone]);

  // Standalone Track/Album/Playlist initialization
  useEffect(() => {
    if (isCheckingDemo) return;

    if (roomToJoin) {
      if (albumId && !location.pathname.includes(`/album/${albumId}`)) {
        navigate(`/jam/album/${albumId}?room=${roomToJoin}`, { replace: true });
      } else if (playlistId && !location.pathname.includes(`/playlist/${playlistId}`)) {
        navigate(`/jam/playlist/${playlistId}?room=${roomToJoin}`, { replace: true });
      } else if (trackId && trackId.trim() !== '') {
        if (!location.pathname.includes(`/track/${trackId}`)) {
          navigate(`/jam/track/${trackId}?room=${roomToJoin}`, { replace: true });
        }
      }
      return;
    }

    if (trackId && trackId.trim() !== '') {
      const targetKey = `track:${trackId}`;
      if (loadedTargetRef.current !== targetKey) {
        loadedTargetRef.current = targetKey;
        usePlayerStore.setState({ queue: [], currentIndex: 0, isAutoDjEnabled: false });
        getSong(trackId).then((t) => {
          if (loadedTargetRef.current !== targetKey) return;
          if (t) {
            const singleTrack = {
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
            };
            setQueueAndPlay([singleTrack], 0);
            if (!location.pathname.includes(`/track/${trackId}`)) {
              navigate(`/jam/track/${trackId}`, { replace: true });
            }
          }
        }).catch((err) => {
          loadedTargetRef.current = null;
          console.error('Failed to load standalone track:', err);
        });
      }
    } else if (albumId && albumId.trim() !== '') {
      const targetKey = `album:${albumId}`;
      if (loadedTargetRef.current !== targetKey) {
        loadedTargetRef.current = targetKey;
        getAlbumFull(albumId).then(a => {
          if (loadedTargetRef.current !== targetKey) return;
          if (a && a.song) {
            const songs = Array.isArray(a.song) ? a.song : [a.song];
            const tracks = songs.map((t: any) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              album: t.album,
              albumId: t.albumId || a.id,
              artistId: t.artistId || a.artistId,
              coverArt: getCoverArtUrl(t.coverArt || a.coverArt || a.id, 300),
              duration: t.duration,
              bitRate: t.bitRate,
              suffix: t.suffix
            }));
            setQueueAndPlay(tracks, 0);
          }
        }).catch((err) => {
          loadedTargetRef.current = null;
          console.error('Failed to load standalone album:', err);
        });
        if (!location.pathname.includes(`/album/${albumId}`)) {
          navigate(`/jam/album/${albumId}`, { replace: true });
        }
      }
    } else if (playlistId && playlistId.trim() !== '') {
      const targetKey = `playlist:${playlistId}`;
      if (loadedTargetRef.current !== targetKey) {
        loadedTargetRef.current = targetKey;
        (async () => {
          const customPlaylists = usePlaylistStore.getState().playlists;
          const custom = customPlaylists.find(p => p.id === playlistId);
          if (custom) {
            const tracks = await resolveTracksFromIds(custom.trackIds);
            if (loadedTargetRef.current !== targetKey) return;
            if (tracks.length > 0) {
              setQueueAndPlay(tracks, 0);
            }
            if (!location.pathname.includes(`/playlist/${playlistId}`)) {
              navigate(`/jam/playlist/${playlistId}`, { replace: true });
            }
            return;
          }

          // If not found locally, try fetching from server
          try {
            const baseUrl = getHoladServerUrl();
            const res = await fetch(`${baseUrl}/api/custom-playlists/${encodeURIComponent(playlistId)}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.playlist) {
                let tracks: any[] = [];
                if (Array.isArray(data.playlist.tracks) && data.playlist.tracks.length > 0) {
                  tracks = data.playlist.tracks;
                } else if (Array.isArray(data.playlist.trackIds)) {
                  tracks = await resolveTracksFromIds(data.playlist.trackIds);
                }
                if (loadedTargetRef.current !== targetKey) return;
                if (tracks.length > 0) {
                  setQueueAndPlay(tracks, 0);
                }
                const curPlaylists = usePlaylistStore.getState().playlists;
                if (!curPlaylists.some(p => p.id === data.playlist.id)) {
                  usePlaylistStore.setState({
                    playlists: [
                      ...curPlaylists,
                      {
                        id: data.playlist.id,
                        name: data.playlist.name,
                        description: data.playlist.description || '',
                        trackIds: data.playlist.trackIds || tracks.map(t => t.id),
                        tracks: data.playlist.tracks
                      }
                    ]
                  });
                }
                if (!location.pathname.includes(`/playlist/${playlistId}`)) {
                  navigate(`/jam/playlist/${playlistId}`, { replace: true });
                }
                return;
              }
            }
          } catch (e) {
            console.warn('Failed to fetch custom playlist from server, falling back to Subsonic:', e);
          }

          // Fall back to Subsonic getPlaylist
          try {
            const p = await getPlaylist(playlistId);
            if (loadedTargetRef.current !== targetKey) return;
            if (p && p.entry) {
              const songs = Array.isArray(p.entry) ? p.entry : [p.entry];
              const tracks = songs.map((t: any) => ({
                id: t.id,
                title: t.title || t.name,
                artist: t.artist,
                album: t.album,
                albumId: t.albumId,
                artistId: t.artistId,
                coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
                duration: t.duration,
                bitRate: t.bitRate,
                suffix: t.suffix
              }));
              setQueueAndPlay(tracks, 0);
            }
          } catch (err) {
            console.error('Failed to load standalone playlist:', err);
          }
          if (!location.pathname.includes(`/playlist/${playlistId}`)) {
            navigate(`/jam/playlist/${playlistId}`, { replace: true });
          }
        })();
      }
    } else if (isValidStandaloneQueue && searchQueue) {
      const targetKey = `queue:${searchQueue}`;
      if (loadedTargetRef.current !== targetKey) {
        loadedTargetRef.current = targetKey;
        (async () => {
          try {
            // 1. Check if it's a short ID saved on server
            const baseUrl = getHoladServerUrl();
            const res = await fetch(`${baseUrl}/api/custom-playlists/${encodeURIComponent(searchQueue)}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.playlist) {
                let tracks: any[] = [];
                if (Array.isArray(data.playlist.tracks) && data.playlist.tracks.length > 0) {
                  tracks = data.playlist.tracks;
                } else if (Array.isArray(data.playlist.trackIds)) {
                  tracks = await resolveTracksFromIds(data.playlist.trackIds);
                }
                if (loadedTargetRef.current !== targetKey) return;
                if (tracks.length > 0) {
                  setQueueAndPlay(tracks, 0);
                  return;
                }
              }
            }
          } catch (err) {
            console.warn('Failed to fetch queue by short ID from server, trying comma-separated fallback:', err);
          }

          // 2. Fallback: comma-separated list of IDs
          if (queueIds.length > 0) {
            try {
              const tracks = await resolveTracksFromIds(queueIds);
              if (loadedTargetRef.current !== targetKey) return;
              if (tracks.length > 0) {
                setQueueAndPlay(tracks, 0);
              }
            } catch (err) {
              console.error('Failed to load standalone queue from IDs:', err);
            }
          }
        })();
      }
    }
  }, [trackId, albumId, playlistId, searchQueue, roomToJoin, setQueueAndPlay, navigate, location.pathname]);

  // Handle unmounting of JamLayout (leaving /jam/ routes entirely)
  useEffect(() => {
    return () => {
      const state = usePlayerStore.getState();
      if (state.role !== 'host') {
        (usePlayerStore as any).persist?.rehydrate();
      }
    };
  }, []);

  if (jamError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-center p-6 relative">
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <ThemeSelector />
          <LanguageSelector />
        </div>
        <div className="w-24 h-24 mb-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-3xl font-bold mb-4">{jamError === 'Room not found' ? t('jam.room_not_found') : t('jam.jam_error')}</h2>
        <p className="text-secondary max-w-md mb-8">
          {jamError === 'Room not found' 
            ? t('jam.jam_error_desc') 
            : jamError}
        </p>
        
        <div className="flex flex-col gap-4">
          <a href="/" className="px-8 py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(var(--color-primary-rgb),0.3)]">
            {t('jam.go_home')}
          </a>
        </div>
      </div>
    );
  }

  if (isCheckingDemo && (roomToJoin || isStandalone)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-secondary">{t('jam.connecting_jam', 'Подключение к Jam...')}</p>
      </div>
    );
  }

  if (!roomToJoin && !isValidStandaloneTrack && !isValidStandaloneAlbum && !isValidStandalonePlaylist && !isValidStandaloneQueue) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background">
        <h2 className="text-2xl font-bold mb-4">{t('jam.invalid_link')}</h2>
        <p className="text-secondary">{t('jam.invalid_link_desc')}</p>
      </div>
    );
  }

  if (!isStandalone && !hasJoined.current && !effectiveUserName && !jamError && (usePlayerStore.getState().role !== 'host')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-center p-6 relative">
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
          <ThemeSelector />
          <LanguageSelector />
        </div>
        <h2 className="text-3xl font-bold mb-8">{t('jam.join_jam')}</h2>
        <p className="text-secondary mb-8">{t('jam.join_jam_desc')}</p>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          if (localName.trim()) {
            try {
              if (!(window as any)._globalAudioContext) {
                (window as any)._globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
              } else if ((window as any)._globalAudioContext.state === 'suspended') {
                (window as any)._globalAudioContext.resume();
              }
            } catch (e) {
              console.error(e);
            }
            setUserName(localName.trim());
          }
        }} className="flex flex-col gap-4 w-full max-w-sm">
          <input 
            type="text" 
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder={t('jam.your_nickname')} 
            className="w-full bg-foreground/10 border border-white/20 rounded-full px-6 py-3 outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
            required
            maxLength={20}
          />
          <button type="submit" className="w-full py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform">
            {t('jam.enter')}
          </button>
        </form>
      </div>
    );
  }

  if (isStandalone || hasJoined.current || usePlayerStore.getState().role === 'host') {
    return (
      <>
        <Sidebar />
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 flex flex-col">
            <div className="hidden md:block">
              <TopBar />
            </div>
            <div className="flex-1 overflow-hidden flex flex-col relative hide-scrollbar">
              <Routes>
                <Route path="/" element={<Navigate to={isStandalone ? (isValidStandaloneTrack ? `/jam/track/${trackId}` : isValidStandaloneAlbum ? `/jam/album/${albumId}` : isValidStandalonePlaylist ? `/jam/playlist/${playlistId}` : '/jam/albums') : `/jam/albums?room=${roomToJoin}`} replace />} />
                <Route path="/albums" element={<AlbumsView />} />
                <Route path="/artists" element={<ArtistsView />} />
                <Route path="/artist/:id" element={<ArtistView />} />
                <Route path="/library/artist/:id" element={<ArtistView />} />
                <Route path="/tracks" element={<TracksView />} />
                <Route path="/track/:id" element={<TracksView />} />
                <Route path="/library/track/:id" element={<TracksView />} />
                <Route path="/album/:id" element={<AlbumView />} />
                <Route path="/library/album/:id" element={<AlbumView />} />
                <Route path="/playlist/:id" element={<PlaylistDetailView />} />
                <Route path="/library/playlist/:id" element={<PlaylistDetailView />} />
                <Route path="*" element={<MainContent />} />
              </Routes>
            </div>
          </div>
        </div>
        <RightSidebar />
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background">
      <h2 className="text-2xl font-bold mb-4">{t('jam.login_progress')}</h2>
      <p className="text-secondary">{t('jam.connecting_jam')}</p>
    </div>
  );
}


