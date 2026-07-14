import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
import MobileBottomNav from './components/layout/MobileBottomNav';
import AlbumsView from './components/views/AlbumsView';
import FavoritesView from './components/views/FavoritesView';
import LibraryView from './components/layout/LibraryView';
import BottomPlayer from './components/player/BottomPlayer';
import RightSidebar from './components/layout/RightSidebar';
import JamLayout from './components/layout/JamLayout';
import { usePlayerStore } from './store/playerStore';
import ContextMenu from './components/common/ContextMenu';
import AlbumView from './components/views/AlbumView';
import TracksView from './components/views/TracksView';
import ArtistsView from './components/views/ArtistsView';
import ArtistView from './components/views/ArtistView';
import LoginView from './components/views/LoginView';
import TopBar from './components/layout/TopBar';
import NowPlayingModal from './components/common/NowPlayingModal';

import { useAppInitialization } from './hooks/useAppInitialization';
import { useDocumentTitle } from './hooks/useDocumentTitle';

function AppContent() {
  const location = useLocation();
  const { isAuthenticated, isJamRoute } = useAppInitialization();
  const role = usePlayerStore(state => state.role);
  
  useDocumentTitle();

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
