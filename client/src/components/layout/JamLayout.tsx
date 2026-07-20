import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import JamSessionControl from '../jam/JamSessionControl';
import FullScreenPlayerUI from '../common/FullScreenPlayerUI';
import { getSong, getCoverArtUrl, getAlbumFull } from '../../api/subsonic';
import { Routes, Route, Navigate, Link, NavLink } from 'react-router-dom';
import MobileJamPlayerUI from '../player/MobileJamPlayerUI';
import TopBar from './TopBar';
import AlbumsView from '../views/AlbumsView';
import ArtistsView from '../views/ArtistsView';
import TracksView from '../views/TracksView';
import AlbumView from '../views/AlbumView';
import ArtistView from '../views/ArtistView';
import ContextMenu from '../common/ContextMenu';
import { ErrorBoundary } from '../common/ErrorBoundary';
import RightSidebar from './RightSidebar';
import { Disc, Music, Users, LogOut, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';

export default function JamLayout() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const albumId = searchParams.get('album');
  const { setQueueAndPlay, queue, currentIndex, jamError, role, userName, isMinimized, setIsMinimized, setUserName } = usePlayerStore();
  
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

  // Standalone Track/Album initialization
  useEffect(() => {
    let ignore = false;
    if (trackId && trackId.trim() !== '' && !roomToJoin) {
      usePlayerStore.setState({ queue: [], currentIndex: 0, isAutoDjEnabled: false });
      getSong(trackId).then(t => {
        if (ignore) return;
        if (t) {
          const { audioElement } = useAudioStore.getState();
          if (audioElement) audioElement.currentTime = 0;
          setQueueAndPlay([{
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            artistId: t.artistId,
            coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
            duration: t.duration
          }], 0);
        }
      }).catch(() => {});
    } else if (albumId && albumId.trim() !== '' && !roomToJoin) {
      usePlayerStore.setState({ queue: [], currentIndex: 0, isAutoDjEnabled: false });
      getAlbumFull(albumId).then(a => {
        if (ignore) return;
        if (a && a.song) {
          const { audioElement } = useAudioStore.getState();
          if (audioElement) audioElement.currentTime = 0;
          const songs = Array.isArray(a.song) ? a.song : [a.song];
          const tracks = songs.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId || a.id,
            artistId: t.artistId || a.artistId,
            coverArt: getCoverArtUrl(t.coverArt || a.coverArt || a.id, 300),
            duration: t.duration
          }));
          setQueueAndPlay(tracks, 0);
        }
      }).catch(() => {});
    }
    return () => { ignore = true; };
  }, [trackId, albumId, roomToJoin, setQueueAndPlay]);

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
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-center p-6">
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
          <a href="/" className="px-8 py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(29,185,84,0.3)]">
            {t('jam.go_home')}
          </a>
          <a href="/login" className="px-8 py-3 rounded-full bg-white/5 text-foreground font-medium hover:bg-white/10 transition-colors border border-white/10">
            {t('jam.login_account')}
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

  const hasTrack = !!queue[currentIndex];

  if (!hasTrack) {
    if (!trackId && !albumId) {
      // We already checked roomToJoin, so this might be unnecessary
    } else {
      return (
        <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background">
          <h2 className="text-2xl font-bold mb-4">{t('jam.temp_link')}</h2>
          <p className="text-secondary">{t('jam.loading_track')}</p>
        </div>
      );
    }
  }

  if (!roomToJoin && hasTrack) {
    return (
      <div className="w-full h-full relative overflow-hidden bg-background flex">
        <div className="hidden md:flex flex-1">
          <FullScreenPlayerUI />
        </div>
        <div className="md:hidden">
          <MobileJamPlayerUI onClose={() => {}} />
        </div>
      </div>
    );
  }

  if (!hasJoined.current && !userName && !jamError && (usePlayerStore.getState().role !== 'host')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-center p-6">
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
            className="w-full bg-white/10 border border-white/20 rounded-full px-6 py-3 outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
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

  const currentRoomId = usePlayerStore.getState().roomId;
  
  if (hasJoined.current && !currentRoomId && usePlayerStore.getState().role !== 'host') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background text-center p-6">
        <div className="w-24 h-24 mb-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
          <LogOut size={48} />
        </div>
        <h2 className="text-3xl font-bold mb-4">{t('jam.left_session')}</h2>
        <p className="text-secondary max-w-md mb-8">
          {t('jam.left_session_desc')}
        </p>
        <div className="flex flex-col gap-4">
          <a href="/login" className="px-8 py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(29,185,84,0.3)]">
            {t('jam.login_account')}
          </a>
          <button onClick={() => window.location.reload()} className="px-8 py-3 rounded-full bg-white/5 text-foreground font-medium hover:bg-white/10 transition-colors border border-white/10">
            {t('jam.rejoin')}
          </button>
        </div>
      </div>
    );
  }

  if (hasJoined.current || usePlayerStore.getState().role === 'host') {
    if (isMinimized) {
      return (
        <div className="flex-1 overflow-hidden relative h-full flex flex-row bg-background pb-[56px] md:pb-0">
          <div className="hidden md:flex w-24 bg-background flex-col items-center py-4 border-r border-white/5 relative z-10 space-y-6">
            <div className="text-foreground flex flex-col items-center justify-center gap-2 px-2 w-full mb-2">
              <img src={`${import.meta.env.BASE_URL}icons/favicon_tab.png`} alt="Holad" className="w-14 h-14 rounded-lg shadow-lg object-cover flex-shrink-0 cursor-default" />
            </div>
            <div className="flex-1 w-full flex flex-col gap-6 pt-4">
              <Link to={`/jam/albums?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                <div className="relative flex justify-center w-full">
                  <Disc size={22} />
                </div>
                <span className="text-[10px] font-bold leading-normal mt-1 px-1 text-center pb-0.5">{t('sidebar.albums')}</span>
              </Link>
              {(role === 'cohost' || role === 'host') && (
                <>
                  <Link to={`/jam/tracks?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                    <div className="relative flex justify-center w-full">
                      <Music size={22} />
                    </div>
                    <span className="text-[10px] font-bold leading-normal mt-1 px-1 text-center pb-0.5">{t('sidebar.tracks')}</span>
                  </Link>
                  <Link to={`/jam/artists?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                    <div className="relative flex justify-center w-full">
                      <Users size={22} />
                    </div>
                    <span className="text-[10px] font-bold leading-normal mt-1 px-1 text-center pb-0.5">{t('sidebar.artists')}</span>
                  </Link>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <div className="hidden md:block">
              <TopBar />
            </div>
            <div className="md:hidden px-4 pt-4 pb-2 sticky top-0 bg-background/95 backdrop-blur-xl z-20 border-b border-white/5">
              <div 
                className="flex items-center bg-[#282828] rounded-xl px-3 py-2.5 border border-white/5 cursor-text"
                onClick={() => useUIStore.getState().setSearchOpen(true)}
              >
                <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
                <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
                  {t('topbar.search')}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto relative hide-scrollbar">
              <Routes>
                <Route path="/" element={<Navigate to={`/jam/albums?room=${roomToJoin}`} replace />} />
                <Route path="/albums" element={<AlbumsView />} />
                <Route path="/artists" element={role === 'cohost' || role === 'host' ? <ArtistsView /> : <Navigate to={`/jam/albums?room=${roomToJoin}`} replace />} />
                <Route path="/tracks" element={role === 'cohost' || role === 'host' ? <TracksView /> : <Navigate to={`/jam/albums?room=${roomToJoin}`} replace />} />
                <Route path="/library/album/:id" element={<AlbumView />} />
                <Route path="/library/artist/:id" element={<ArtistView />} />
                <Route path="*" element={<Navigate to={`/jam/albums?room=${roomToJoin}`} replace />} />
              </Routes>
            </div>
            <ErrorBoundary>
              <ContextMenu />
            </ErrorBoundary>
          </div>
          <RightSidebar />
          <MobileJamNav roomToJoin={roomToJoin} role={role} />
        </div>
      );
    }
    
    return (
      <div className="w-full h-full relative overflow-hidden bg-background flex">
        <div className="hidden md:flex flex-1">
          <FullScreenPlayerUI extraControls={<JamSessionControl hideCreate={true} />} />
        </div>
        <div className="md:hidden">
          <MobileJamPlayerUI onClose={() => setIsMinimized(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-[100dvh] bg-background">
      <h2 className="text-2xl font-bold mb-4">{t('jam.login_progress')}</h2>
      <p className="text-secondary">{t('jam.connecting_jam')}</p>
    </div>
  );
}

function MobileJamNav({ roomToJoin, role }: { roomToJoin: string | null, role: string | null }) {
  const { t } = useTranslation();
  return (
    <div className="md:hidden flex items-center justify-around bg-[#121212]/70 backdrop-blur-2xl border-t border-white/10 h-[56px] pb-[env(safe-area-inset-bottom)] px-4 z-50 rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.4)] fixed bottom-0 left-0 right-0">
      <NavLink to={`/jam/albums?room=${roomToJoin}`} className={({isActive}) => `flex flex-col items-center gap-0.5 p-1 flex-1 transition-colors ${isActive ? 'text-primary' : 'text-secondary'}`}><Disc size={26}/><span className="text-[10px] font-bold">{t('sidebar.albums')}</span></NavLink>
      {(role === 'cohost' || role === 'host') && (
        <>
          <NavLink to={`/jam/tracks?room=${roomToJoin}`} className={({isActive}) => `flex flex-col items-center gap-0.5 p-1 flex-1 transition-colors ${isActive ? 'text-primary' : 'text-secondary'}`}><Music size={26}/><span className="text-[10px] font-bold">{t('sidebar.tracks')}</span></NavLink>
          <NavLink to={`/jam/artists?room=${roomToJoin}`} className={({isActive}) => `flex flex-col items-center gap-0.5 p-1 flex-1 transition-colors ${isActive ? 'text-primary' : 'text-secondary'}`}><Users size={26}/><span className="text-[10px] font-bold">{t('sidebar.artists')}</span></NavLink>
        </>
      )}
    </div>
  );
}
