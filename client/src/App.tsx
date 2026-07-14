import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useSearchParams, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
import MobileBottomNav from './components/layout/MobileBottomNav';
import AlbumsView from './components/views/AlbumsView';
import FavoritesView from './components/views/FavoritesView';
import LibraryView from './components/layout/LibraryView';
import BottomPlayer from './components/player/BottomPlayer';
import RightSidebar from './components/layout/RightSidebar';
import JamLayout from './components/layout/JamLayout';
import { fetchStarred, getPlayQueue, getCoverArtUrl } from './api/subsonic';
import { usePlayerStore } from './store/playerStore';
import type { Track } from './store/playerStore';
import ContextMenu from './components/common/ContextMenu';
import AlbumView from './components/views/AlbumView';
import TracksView from './components/views/TracksView';
import ArtistsView from './components/views/ArtistsView';
import ArtistView from './components/views/ArtistView';
import LoginView from './components/views/LoginView';
import TopBar from './components/layout/TopBar';
import { jamSocket } from './api/socket';
import { useAuthStore } from './store/authStore';
import NowPlayingModal from './components/common/NowPlayingModal';

function AppContent() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const roomToJoin = searchParams.get('room');
  const role = usePlayerStore(state => state.role);
  const setLikedItems = usePlayerStore(state => state.setLikedItems);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const isJamRoute = location.pathname.startsWith('/jam');
  // Removed backupQueue and restoreQueue logic to prevent ghost playlists

  useEffect(() => {
    // Only connect if authenticated OR if we are on a jam route
    if (!isAuthenticated && !isJamRoute) return;
    
    jamSocket.connect();
    
    // Connection logic is now handled in JamLayout if needed
    // We only connect for global listeners if needed, but jam routing handles the join.

    if (isAuthenticated) {
      fetchStarred().then(data => {
        const trackIds = data.song?.map((t: any) => t.id) || [];
        const albumIds = data.album?.map((a: any) => a.id) || [];
        setLikedItems(trackIds, albumIds);
      }).catch(e => console.error("Failed to fetch starred items", e));
    }

    if (!isJamRoute || !roomToJoin) {
      getPlayQueue().then(queueData => {
        if (queueData && queueData.entry) {
          const mappedTracks: Track[] = queueData.entry.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
            duration: t.duration
          }));
          
          let initialIndex = 0;
          if (queueData.current) {
            const idx = mappedTracks.findIndex(t => t.id === queueData.current);
            if (idx !== -1) initialIndex = idx;
          }

          usePlayerStore.setState({
            queue: mappedTracks,
            currentIndex: initialIndex,
            isPlaying: false, 
            initialPosition: queueData.position || 0
          });
        }
      }).catch(e => console.error("Failed to fetch play queue", e));
    }
  }, [isAuthenticated, roomToJoin, role, setLikedItems, isJamRoute]);

  const isLoginRoute = location.pathname === '/login';

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <div className="flex flex-1 overflow-hidden relative">
        <Routes>
          <Route path="/" element={<Navigate to="/Holad" replace />} />
          <Route path="/login" element={!isAuthenticated ? <LoginView /> : <Navigate to="/Holad" replace />} />
          
          <Route path="/Holad/*" element={
            isAuthenticated ? (
            <>
              <Sidebar />
              <div className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 flex flex-col">
                  <TopBar />
                  <div className="flex-1 overflow-y-auto relative hide-scrollbar">
                    <Routes>
                      <Route path="/" element={<MainContent />} />
                      <Route path="/library/*" element={<LibraryView />} />
                      <Route path="/albums" element={<AlbumsView />} />
                      <Route path="/artists" element={<ArtistsView />} />
                      <Route path="/artist/:id" element={<ArtistView />} />
                      <Route path="/tracks" element={<TracksView />} />
                      <Route path="/album/:id" element={<AlbumView />} />
                      <Route path="/favorites" element={<FavoritesView />} />
                      <Route path="*" element={<MainContent />} />
                    </Routes>
                  </div>
                </div>
                <ContextMenu />
              </div>
              <RightSidebar />
            </>
            ) : <Navigate to="/login" replace />
          } />
          
          <Route path="/jam/*" element={<JamLayout />} />
          <Route path="*" element={<Navigate to="/Holad" replace />} />
        </Routes>
        
        <NowPlayingModal />
      </div>
      
      {!isLoginRoute && (isAuthenticated || (isJamRoute && role)) && (
        <>
          <BottomPlayer />
          <MobileBottomNav />
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
