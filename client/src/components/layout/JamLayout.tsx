import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { jamSocket } from '../../api/socket';
import { usePlayerStore } from '../../store/playerStore';
import JamSessionControl from '../jam/JamSessionControl';
import FullScreenPlayerUI from '../common/FullScreenPlayerUI';
import { getSong, getCoverArtUrl } from '../../api/subsonic';
import { useState } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import TopBar from './TopBar';
import AlbumsView from '../views/AlbumsView';
import ArtistsView from '../views/ArtistsView';
import TracksView from '../views/TracksView';
import AlbumView from '../views/AlbumView';
import ArtistView from '../views/ArtistView';
import ContextMenu from '../common/ContextMenu';
import RightSidebar from './RightSidebar';
import { Menu, Disc, Music, Users, LogOut } from 'lucide-react';

export default function JamLayout() {
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const trackId = searchParams.get('track');
  const { setQueueAndPlay, queue, currentIndex, jamError, role, userName, isMinimized, setUserName } = usePlayerStore();
  
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

  // Standalone Track initialization
  useEffect(() => {
    if (trackId && !roomToJoin) {
      getSong(trackId).then(t => {
        if (t) {
          setQueueAndPlay([{
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            albumId: t.albumId,
            coverArt: getCoverArtUrl(t.coverArt || t.id, 600),
            duration: t.duration
          }], 0);
        }
      });
    }
  }, [trackId, roomToJoin, setQueueAndPlay]);

  if (jamError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background text-center p-6">
        <div className="w-24 h-24 mb-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-3xl font-bold mb-4">{jamError === 'Room not found' ? 'Комната не найдена' : 'Ошибка сессии'}</h2>
        <p className="text-secondary max-w-md mb-8">
          {jamError === 'Room not found' 
            ? 'Похоже, эта сессия была завершена хостом, либо вы перешли по недействительной ссылке.' 
            : jamError}
        </p>
        
        <div className="flex flex-col gap-4">
          <a href="/" className="px-8 py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(29,185,84,0.3)]">
            На главную
          </a>
          <a href="/login" className="px-8 py-3 rounded-full bg-white/5 text-foreground font-medium hover:bg-white/10 transition-colors border border-white/10">
            Войти в свой аккаунт
          </a>
        </div>
      </div>
    );
  }

  if (!roomToJoin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background">
        <h2 className="text-2xl font-bold mb-4">Неверная ссылка</h2>
        <p className="text-secondary">Эта ссылка для Jam-сессии недействительна.</p>
      </div>
    );
  }

  const hasTrack = !!queue[currentIndex];

  if (!hasTrack) {
    if (!trackId) {
      // We already checked roomToJoin, so this might be unnecessary, but leaving for safety if trackId was expected
    } else {
      return (
        <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background">
          <h2 className="text-2xl font-bold mb-4">Временная ссылка</h2>
          <p className="text-secondary">Загрузка трека...</p>
        </div>
      );
    }
  }

  if (!hasJoined.current && !userName && !jamError && (usePlayerStore.getState().role !== 'host')) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background text-center p-6">
        <h2 className="text-3xl font-bold mb-8">Присоединиться к джэму</h2>
        <p className="text-secondary mb-8">Введите свое имя, чтобы слушать музыку вместе</p>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          if (localName.trim()) setUserName(localName.trim());
        }} className="flex flex-col gap-4 w-full max-w-sm">
          <input 
            type="text" 
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="Ваш никнейм" 
            className="w-full bg-white/10 border border-white/20 rounded-full px-6 py-3 outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
            required
            maxLength={20}
          />
          <button type="submit" className="w-full py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform">
            Войти
          </button>
        </form>
      </div>
    );
  }

  const currentRoomId = usePlayerStore.getState().roomId;
  
  if (hasJoined.current && !currentRoomId && usePlayerStore.getState().role !== 'host') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background text-center p-6">
        <div className="w-24 h-24 mb-6 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
          <LogOut size={48} />
        </div>
        <h2 className="text-3xl font-bold mb-4">Вы вышли из сессии</h2>
        <p className="text-secondary max-w-md mb-8">
          Чтобы продолжить слушать музыку, войдите в свой аккаунт или присоединитесь к сессии снова.
        </p>
        <div className="flex flex-col gap-4">
          <a href="/login" className="px-8 py-3 rounded-full bg-primary text-background font-bold hover:scale-105 transition-transform shadow-[0_0_20px_rgba(29,185,84,0.3)]">
            Войти в аккаунт
          </a>
          <button onClick={() => window.location.reload()} className="px-8 py-3 rounded-full bg-white/5 text-foreground font-medium hover:bg-white/10 transition-colors border border-white/10">
            Присоединиться снова
          </button>
        </div>
      </div>
    );
  }

  if (hasJoined.current || usePlayerStore.getState().role === 'host') {
    if (isMinimized) {
      return (
        <div className="flex-1 overflow-hidden relative h-full flex flex-row bg-background">
          <div className="hidden md:flex w-24 bg-background flex-col items-center py-4 border-r border-white/5 relative z-10 space-y-6">
            <button className="text-secondary hover:text-foreground flex flex-col items-center gap-1 transition-colors">
              <Menu size={24} />
              <span className="text-[10px] font-bold uppercase tracking-wider mt-1">Меню</span>
            </button>
            <div className="flex-1 w-full flex flex-col gap-6 pt-4">
              <Link to={`/jam/albums?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                <div className="relative flex justify-center w-full">
                  <Disc size={22} />
                </div>
                <span className="text-[10px] font-bold leading-none mt-1 px-1 text-center">Альбомы</span>
              </Link>
              {(role === 'cohost' || role === 'host') && (
                <>
                  <Link to={`/jam/tracks?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                    <div className="relative flex justify-center w-full">
                      <Music size={22} />
                    </div>
                    <span className="text-[10px] font-bold leading-none mt-1 px-1 text-center">Треки</span>
                  </Link>
                  <Link to={`/jam/artists?room=${roomToJoin}`} className="w-full flex flex-col items-center gap-1 transition-colors group text-secondary hover:text-foreground">
                    <div className="relative flex justify-center w-full">
                      <Users size={22} />
                    </div>
                    <span className="text-[10px] font-bold leading-none mt-1 px-1 text-center">Артисты</span>
                  </Link>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <TopBar />
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
            <ContextMenu />
          </div>
          <RightSidebar />
        </div>
      );
    }
    
    return (
      <div className="w-full h-full relative overflow-hidden bg-background flex">
        <div className="flex-1">
          <FullScreenPlayerUI extraControls={<JamSessionControl hideCreate={true} />} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center h-screen bg-background">
      <h2 className="text-2xl font-bold mb-4">Вход...</h2>
      <p className="text-secondary">Подключаемся к джэму...</p>
    </div>
  );
}
