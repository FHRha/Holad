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
import ArtistView from './components/views/ArtistView';
import ArtistsView from './components/views/ArtistsView';
import LoginView from './components/views/LoginView';
import RadioView from './components/views/RadioView';
import MobileSettingsView from './components/views/MobileSettingsView';
import SyncConflictModal from './components/common/SyncConflictModal';
import HistoryView from './components/views/HistoryView';
import TopBar from './components/layout/TopBar';
import NowPlayingModal from './components/common/NowPlayingModal';
import MobileSearchOverlay from './components/modals/MobileSearchOverlay';
import { GlobalDndProvider } from './components/common/dnd/GlobalDndProvider';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { useAppInitialization } from './hooks/useAppInitialization';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import SettingsModal from './components/modals/SettingsModal';
import { useSettingsStore } from './store/settingsStore';
import { useUIStore } from './store/uiStore';
import { useEffect, useState } from 'react';
import { isTauri, isCapacitor } from './utils/StorageManager';
import ServerConnectionView from './components/views/ServerConnectionView';

// Helper to convert hex to rgb string for Tailwind's opacity to work
function hexToRgb(hex: string) {
  let c = hex.substring(1);
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function AppContent() {
  const location = useLocation();
  const { isAuthenticated, isJamRoute } = useAppInitialization();
  const roomId = usePlayerStore(state => state.roomId);
  const { theme, accentColor, startPage } = useSettingsStore();
  const isSettingsOpen = useUIStore(state => state.isSettingsOpen);
  
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
      }
    }

    const colors: Record<string, string> = {
      green: '#1db954',
      blue: '#3b82f6',
      purple: '#a855f7',
      red: '#ef4444',
      orange: '#f97316',
      pink: '#ec4899',
      yellow: '#eab308'
    };
    
    const hexColor = colors[accentColor] || (accentColor.startsWith('#') ? accentColor : colors.green);
    const rgbStr = hexToRgb(hexColor); // e.g. "29, 185, 84"
    const rgbSpaceStr = rgbStr.replace(/,/g, ''); // "29 185 84"
    
    // Set all possible variations so it works regardless of which tailwind.config.js is currently cached in dev server
    root.style.setProperty('--color-primary', rgbSpaceStr); 
    root.style.setProperty('--color-primary-rgb', rgbStr);
  }, [theme, accentColor]);

  useDocumentTitle();

  const isLoginRoute = location.pathname === '/login';
  
  const searchParams = new URLSearchParams(location.search);
  const validStandalone = (searchParams.has('track') && !!searchParams.get('track')) || (searchParams.has('album') && !!searchParams.get('album'));

  const showBottomPlayer = !isLoginRoute && (
    (!isJamRoute && isAuthenticated) ||
    (isJamRoute && (!!roomId || validStandalone))
  );

  const showMobileNav = !isLoginRoute && !isJamRoute && isAuthenticated;

  return (
    <GlobalDndProvider>
      <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden font-sans relative">
        <MobileBackground />
        <div className="flex flex-1 overflow-hidden relative z-10">
          <Routes>
            <Route path="/" element={<Navigate to={startPage} replace />} />
            <Route path="/login" element={!isAuthenticated ? <LoginView /> : <Navigate to="/Holad" replace />} />
            
            <Route path="/Holad/*" element={
              isAuthenticated ? (
              <>
                <Sidebar />
                <div className="flex-1 overflow-hidden relative">
                  <div className="absolute inset-0 flex flex-col">
                    <div className="hidden md:block">
                      <TopBar />
                    </div>
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
                        <Route path="/history" element={<HistoryView />} />
                        <Route path="/radio" element={<RadioView />} />
                        <Route path="/settings" element={<MobileSettingsView />} />
                        <Route path="*" element={<MainContent />} />
                      </Routes>
                    </div>
                  </div>
                </div>
                <RightSidebar />
              </>
              ) : <Navigate to="/login" replace />
            } />
            
            <Route path="/jam/*" element={<JamLayout />} />
            <Route path="*" element={<Navigate to="/Holad" replace />} />
          </Routes>
          
          <NowPlayingModal />
          <SyncConflictModal />
          <MobileSearchOverlay />
          {isSettingsOpen && <SettingsModal />}
        </div>
        
        {showBottomPlayer && <BottomPlayer />}
        {showMobileNav && <MobileBottomNav />}
        
        <ErrorBoundary>
          <ContextMenu />
        </ErrorBoundary>
      </div>
    </GlobalDndProvider>
  );
}

function MobileBackground() {
  const { queue, currentIndex } = usePlayerStore();
  const currentTrack = queue[currentIndex];

  if (currentTrack?.coverArt) {
    return (
      <div className="md:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
        <div 
          className="absolute inset-0 bg-cover bg-center blur-[40px] opacity-60 saturate-150 scale-[1.15] transition-all duration-1000 transform-gpu will-change-transform"
          style={{ backgroundImage: `url(${currentTrack.coverArt})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black" />
      </div>
    );
  }

  return (
    <div className="md:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-[var(--color-primary)] opacity-40" />
    </div>
  );
}

// Global event listener for Tauri to prevent F5/Ctrl+R reload
if (isTauri()) {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
      e.preventDefault();
    }
  });
}

function App() {
  const [serverUrlSet, setServerUrlSet] = useState(!!localStorage.getItem('holadServerUrl'));
  const isNative = isTauri() || isCapacitor();
  
  if (isNative && !serverUrlSet) {
    return <ServerConnectionView onConnected={() => setServerUrlSet(true)} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
