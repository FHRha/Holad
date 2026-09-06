import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import { getAudioEngine } from '../../audio/AudioEngine';
import { getSong, getCoverArtUrl, getAlbumFull } from '../../api/subsonic';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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

export default function JamLayout() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const albumId = searchParams.get('album');
  const playlistId = searchParams.get('playlist');
  const { setQueueAndPlay, jamError, userName, setUserName } = usePlayerStore();
  const role = usePlayerStore(state => state.role);
  const navigate = useNavigate();
  
  const [localName, setLocalName] = useState('');
  const hasJoined = useRef(false);

  useEffect(() => {
    // If it's a room and we have a username or we are the host, connect
    const currentRole = usePlayerStore.getState().role;
    if (roomToJoin && (userName || currentRole === 'host') && !hasJoined.current) {
      jamSocket.connect();
      jamSocket.joinRoom(roomToJoin, userName);
      hasJoined.current = true;
    }
  }, [roomToJoin, userName]);

  // Force fullscreen player open for listeners
  useEffect(() => {
      if (role === 'listener') {
          usePlayerStore.getState().setIsMinimized(false);
      }
  }, [role]);

  // Standalone Track/Album initialization
  useEffect(() => {
    let ignore = false;

    if (roomToJoin) {
      if (albumId) {
        navigate(`/jam/library/album/${albumId}?room=${roomToJoin}`, { replace: true });
      } else if (playlistId) {
        navigate(`/jam/library/playlist/${playlistId}?room=${roomToJoin}`, { replace: true });
      } else if (trackId && trackId.trim() !== '') {
        getSong(trackId).then(t => {
          if (ignore) return;
          if (t && t.albumId) {
            navigate(`/jam/library/album/${t.albumId}?room=${roomToJoin}`, { replace: true });
          }
        });
      }
      return () => { ignore = true; };
    }

    if (trackId && trackId.trim() !== '') {
      usePlayerStore.setState({ queue: [], currentIndex: 0, isAutoDjEnabled: false });
      getSong(trackId).then(t => {
        if (ignore) return;
        if (t) {
          getAudioEngine().seek(0);
          setQueueAndPlay([{
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
          }], 0);
        }
      });
    } else if (albumId) {
      getAlbumFull(albumId).then(a => {
        if (ignore) return;
        if (a && a.song) {
          getAudioEngine().seek(0);
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
      }).catch(() => {});
    }
    return () => { ignore = true; };
  }, [trackId, albumId, playlistId, roomToJoin, setQueueAndPlay, navigate]);

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

  const isValidStandaloneTrack = trackId && trackId.trim() !== '';
  const isValidStandaloneAlbum = albumId && albumId.trim() !== '';

  if (!roomToJoin && !isValidStandaloneTrack && !isValidStandaloneAlbum) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background">
        <h2 className="text-2xl font-bold mb-4">{t('jam.invalid_link')}</h2>
        <p className="text-secondary">{t('jam.invalid_link_desc')}</p>
      </div>
    );
  }

  if (!hasJoined.current && !userName && !jamError && (usePlayerStore.getState().role !== 'host')) {
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

  if (hasJoined.current || usePlayerStore.getState().role === 'host') {
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
                <Route path="/" element={<Navigate to={`/jam/albums?room=${roomToJoin}`} replace />} />
                <Route path="/albums" element={<AlbumsView />} />
                <Route path="/artists" element={<ArtistsView />} />
                <Route path="/artist/:id" element={<ArtistView />} />
                <Route path="/tracks" element={<TracksView />} />
                <Route path="/album/:id" element={<AlbumView />} />
                <Route path="/playlist/:id" element={<PlaylistDetailView />} />
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


