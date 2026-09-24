import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import Sidebar from './components/layout/Sidebar';
import MainContent from './components/layout/MainContent';
import MobileBottomNav from './components/layout/MobileBottomNav';
import BottomPlayer from './components/player/BottomPlayer';
import RightSidebar from './components/layout/RightSidebar';
import { usePlayerStore } from './store/playerStore';
import ContextMenu from './components/common/ContextMenu';
import LoginView from './components/views/LoginView';
import TopBar from './components/layout/TopBar';
import { GlobalDndProvider } from './components/common/dnd/GlobalDndProvider';
import { ErrorBoundary } from './components/common/ErrorBoundary';

import { useAppInitialization } from './hooks/useAppInitialization';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { useTaskbarControls } from './hooks/useTaskbarControls';
import { useTrayIntegration } from './hooks/useTrayIntegration';
import { useWindowVisibility } from './hooks/useWindowVisibility';
import OfflineModeModal from './components/modals/OfflineModeModal';
import { motion, AnimatePresence } from 'framer-motion';
import { preloadAndDecodeImage } from './utils/assetPreloader';
import { getCachedImageUrl } from './utils/imageCache';
import TrayMenu from './components/player/TrayMenu';
import { useSettingsStore } from './store/settingsStore';
import { useUIStore } from './store/uiStore';
import { useDemoStore } from './store/demoStore';
import { useEffect, useState, lazy, Suspense } from 'react';
import { isTauri, isCapacitor, StorageManager } from './utils/StorageManager';
import { getCoverArtUrl } from './api/subsonic';
import { applyAppIcon } from './utils/appIconHelper';
import ServerConnectionView from './components/views/ServerConnectionView';
import { useDownloadStore } from './store/downloadStore';
import { Toaster } from 'sonner';
import { getBasePath, isJamPath } from './utils/basePath';

// Dynamic lazy imports for views
const AlbumsView = lazy(() => import('./components/views/AlbumsView'));
const ArtistView = lazy(() => import('./components/views/ArtistView'));
const ArtistsView = lazy(() => import('./components/views/ArtistsView'));
const TracksView = lazy(() => import('./components/views/TracksView'));
const AlbumView = lazy(() => import('./components/views/AlbumView'));
const PlaylistsView = lazy(() => import('./components/views/PlaylistsView'));
const PlaylistDetailView = lazy(() => import('./components/views/PlaylistDetailView'));
const FavoritesView = lazy(() => import('./components/views/FavoritesView'));
const HistoryView = lazy(() => import('./components/views/HistoryView'));
const DownloadsView = lazy(() => import('./components/views/DownloadsView'));
const RadioView = lazy(() => import('./components/views/RadioView'));
const FriendsView = lazy(() => import('./components/views/FriendsView'));
const MobileSettingsView = lazy(() => import('./components/views/MobileSettingsView'));
const JamLayout = lazy(() => import('./components/layout/JamLayout'));
const LibraryView = lazy(() => import('./components/layout/LibraryView'));

// Dynamic lazy imports for modals and overlays
const SettingsModal = lazy(() => import('./components/modals/SettingsModal'));
const NowPlayingModal = lazy(() => import('./components/common/NowPlayingModal'));
const MobileSearchOverlay = lazy(() => import('./components/modals/MobileSearchOverlay'));
const UpdateModal = lazy(() => import('./components/modals/UpdateModal'));
const UnignoreTrackModal = lazy(() => import('./components/modals/UnignoreTrackModal'));
const JamJoinDialog = lazy(() => import('./components/modals/JamJoinDialog'));
const DemoCapacityView = lazy(() => import('./components/views/DemoCapacityView'));

export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  if (isTauri()) return false;
  return isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
};

function LegacyHoladRedirect() {
  const loc = useLocation();
  const target = loc.pathname.replace(/^\/Holad(\/|$)/i, '/') + loc.search;
  return <Navigate to={target || '/'} replace />;
}

// Helper to convert hex to rgb string for Tailwind's opacity to work
function hexToRgb(hex: string) {
  let c = hex.substring(1);
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
}

function AppContent() {
  const isTrayMenu = window.location.hash === '#tray';

  if (isTrayMenu) {
    return <TrayMenu />;
  }

  // oxlint-disable-next-line
  useAppLifecycle();

  // oxlint-disable-next-line
  const location = useLocation();
  // oxlint-disable-next-line
  const { isAuthenticated, isJamRoute } = useAppInitialization();
  // oxlint-disable-next-line
  const roomId = usePlayerStore(state => state.roomId);
  // oxlint-disable-next-line
  const { startPage } = useSettingsStore();
  // oxlint-disable-next-line
  const { isSettingsOpen, isOfflineModalOpen, setOfflineModalOpen } = useUIStore();
  const { isDemoMode, isPoolExhausted, checkDemoSession } = useDemoStore();

  useEffect(() => {
    checkDemoSession();
  }, [checkDemoSession]);
  
  // oxlint-disable-next-line
  useTaskbarControls();
  // oxlint-disable-next-line
  useTrayIntegration();
  // oxlint-disable-next-line
  useWindowVisibility();
  
  // oxlint-disable-next-line
  useEffect(() => {
    if ('__TAURI_INTERNALS__' in window) {
      const initTauri = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          
          const settings = useSettingsStore.getState();
          
          // Apply closeToTray setting
          await invoke('set_close_to_tray', { enabled: settings.closeToTray ?? true });
          
          // Handle visibility on autostart
          const isAutostart = await invoke<boolean>('is_autostart_launch');
          if (isAutostart && settings.startMinimized === false) {
            await invoke('show_main_window');
          }

          // Sync autostart state with OS registration
          try {
            const { isEnabled, enable, disable } = await import('@tauri-apps/plugin-autostart');
            const osEnabled = await isEnabled();
            if (settings.runOnStartup && !osEnabled) {
              await enable();
            } else if (!settings.runOnStartup && osEnabled) {
              await disable();
            }
          } catch (autostartErr) {
            console.error("Failed to sync autostart with OS:", autostartErr);
          }
        } catch (err) {
          console.error("Tauri initialization error:", err);
        }
      };
      initTauri();
    }
  }, []);

  // oxlint-disable-next-line
  useEffect(() => {
    // Reset any downloads that were stuck in 'downloading' state from a previous crash
    useDownloadStore.getState().resetStuckDownloads();
    
    // Verify that downloaded files still exist on disk
    import('./store/downloadStore').then(({ verifyDownloads }) => {
      verifyDownloads().catch(console.error);
    });
  }, []);



  // oxlint-disable-next-line
  useDocumentTitle();

  const isLoginRoute = location.pathname === '/login';

  const [isMobile, setIsMobile] = useState(isMobileDevice);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileDevice());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const theme = useSettingsStore(state => state.theme);
  const accentColor = useSettingsStore(state => state.accentColor);
  const appIcon = useSettingsStore(state => state.appIcon);

  useEffect(() => {
    applyAppIcon(appIcon);
  }, [appIcon]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      if (isMobile && !isLoginRoute) {
        root.classList.add('dark');
        root.classList.remove('light');
        return;
      }

      if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else if (theme === 'light') {
        root.classList.remove('dark');
        root.classList.add('light');
      } else {
        if (mediaQuery.matches) {
          root.classList.add('dark');
          root.classList.remove('light');
        } else {
          root.classList.remove('dark');
          root.classList.add('light');
        }
      }
    };

    applyTheme();

    if (!isMobile || isLoginRoute) {
      if (theme === 'system' || !theme) {
        const handleChange = () => applyTheme();
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      }
    }
  }, [theme, isMobile, isLoginRoute]);

  useEffect(() => {
    const root = document.documentElement;
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
    const rgbStr = hexToRgb(hexColor);
    const rgbSpaceStr = rgbStr.replace(/,/g, '');
    
    root.style.setProperty('--color-primary', rgbSpaceStr); 
    root.style.setProperty('--color-primary-rgb', rgbStr);
  }, [accentColor]);

  const searchParams = new URLSearchParams(location.search);
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist')) ||
                            (searchParams.has('queue') && !!searchParams.get('queue'));
  const isStandalonePath = location.pathname.startsWith('/jam/track/') ||
                           location.pathname.startsWith('/jam/album/') ||
                           location.pathname.startsWith('/jam/playlist/');
  const validStandalone = isStandaloneQuery || isStandalonePath;

  const showBottomPlayer = !isLoginRoute && (
    (!isJamRoute && isAuthenticated) ||
    (isJamRoute && (!!roomId || validStandalone))
  );

  const showMobileNav = !isLoginRoute && !isJamRoute && isAuthenticated;

  const effectiveToastTheme = isMobile && !isLoginRoute ? 'dark' : (theme === 'dark' ? 'dark' : 'light');

  const isJamUrl = location.pathname.startsWith('/jam') ||
                   location.pathname.startsWith('/join') ||
                   Boolean(searchParams.get('room')) ||
                   Boolean(searchParams.get('jam'));

  if (isPoolExhausted && !isJamUrl) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden font-sans relative">
        <Suspense fallback={<div className="flex-1 bg-background" />}>
          <DemoCapacityView />
        </Suspense>
      </div>
    );
  }

  return (
    <GlobalDndProvider>
      <Toaster theme={effectiveToastTheme} position="bottom-center" richColors />
      <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden font-sans relative">
        <MobileBackground />
        <div className="flex flex-1 overflow-hidden relative z-10">
          <Suspense fallback={<div className="flex-1 bg-background" />}>
            <Routes>
              <Route path="/login" element={isDemoMode ? <Navigate to="/" replace /> : (!isAuthenticated ? <LoginView /> : <Navigate to="/" replace />)} />
              <Route path="/jam/*" element={<JamLayout />} />
              <Route path="/join" element={<JamJoinDialog />} />
              
              {/* Backward compatibility redirects for legacy /Holad/* URLs */}
              <Route path="/Holad" element={<Navigate to="/" replace />} />
              <Route path="/Holad/*" element={<LegacyHoladRedirect />} />
              
              <Route path="/*" element={
                isAuthenticated ? (
                <>
                  <Sidebar />
                  <div className="flex-1 overflow-hidden relative">
                    <div className="absolute inset-0 flex flex-col">
                      <div className="hidden md:block">
                        <TopBar />
                      </div>
                      <main className="flex-1 overflow-hidden flex flex-col relative hide-scrollbar">
                        <Suspense fallback={<div className="flex-1 bg-background" />}>
                          <Routes>
                            <Route path="/" element={startPage && startPage !== '/' ? <Navigate to={startPage} replace /> : <MainContent />} />
                            <Route path="/library/*" element={<LibraryView />} />
                            <Route path="/albums" element={<AlbumsView />} />
                            <Route path="/artists" element={<ArtistsView />} />
                            <Route path="/artist/:id" element={<ArtistView />} />
                            <Route path="/tracks" element={<TracksView />} />
                            <Route path="/album/:id" element={<AlbumView />} />
                            <Route path="/playlists" element={<PlaylistsView />} />
                            <Route path="/playlist/:id" element={<PlaylistDetailView />} />
                            <Route path="/favorites" element={<FavoritesView />} />
                            <Route path="/history" element={<HistoryView />} />
                            <Route path="/downloads" element={<DownloadsView />} />
                            <Route path="/radio" element={<RadioView />} />
                            <Route path="/friends" element={<FriendsView />} />
                            <Route path="/settings" element={<MobileSettingsView />} />
                            <Route path="*" element={<MainContent />} />
                          </Routes>
                        </Suspense>
                      </main>
                    </div>
                  </div>
                  <RightSidebar />
                </>
                ) : (isDemoMode ? (
                  <div className="flex flex-col h-full w-full items-center justify-center bg-background text-foreground">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <Navigate to="/login" replace />
                ))
              } />
            </Routes>
            
            <NowPlayingModal />
            <MobileSearchOverlay />
            {isSettingsOpen && <SettingsModal />}
            {isOfflineModalOpen && <OfflineModeModal isOpen={isOfflineModalOpen} onClose={() => setOfflineModalOpen(false)} />}
            <UpdateModal />
            <UnignoreTrackModal />
          </Suspense>
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
  const [bgUrl, setBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (!currentTrack) {
      setBgUrl('');
      return;
    }

    const resolveBg = async () => {
      // 1. Check local downloaded cover if available
      try {
        const localUri = await StorageManager.getLocalCoverUri(currentTrack.id);
        if (localUri && isMounted) {
          await preloadAndDecodeImage(localUri);
          if (isMounted) setBgUrl(localUri);
          return;
        }
      } catch {}

      // 2. Resolve via getCoverArtUrl
      const coverId = currentTrack.coverArt || currentTrack.albumId || currentTrack.id;
      if (coverId) {
        const rawUrl = getCoverArtUrl(coverId, 160);
        if (rawUrl) {
          try {
            const cachedUrl = await getCachedImageUrl(rawUrl);
            await preloadAndDecodeImage(cachedUrl);
            if (isMounted) setBgUrl(cachedUrl);
          } catch {
            await preloadAndDecodeImage(rawUrl);
            if (isMounted) setBgUrl(rawUrl);
          }
        }
      } else if (isMounted) {
        setBgUrl('');
      }
    };

    resolveBg();
    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);

  return (
    <div className="md:hidden absolute inset-0 z-0 overflow-hidden pointer-events-none bg-black">
      <AnimatePresence mode="popLayout">
        {bgUrl ? (
          <motion.div 
            key={bgUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 bg-cover bg-center blur-[40px] saturate-150 scale-[1.15] transform-gpu will-change-transform"
            style={{ backgroundImage: `url("${bgUrl}")` }}
          />
        ) : (
          <motion.div
            key="empty-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="absolute inset-0 bg-gradient-to-b from-black via-black/90 to-[var(--color-primary)]"
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black pointer-events-none" />
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
  useEffect(() => {
    const handleTouchEnd = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const buttonOrLink = target.closest('button') || target.closest('a');
      if (buttonOrLink) {
        setTimeout(() => {
          if (document.activeElement === buttonOrLink) {
            buttonOrLink.blur();
          }
        }, 150);
      }
    };
    
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
      return () => document.removeEventListener('touchend', handleTouchEnd);
    }
  }, []);
  const [serverUrlSet, setServerUrlSet] = useState(!!localStorage.getItem('holadServerUrl'));
  const isHostedOnBackend = 
    (!isTauri() && !isCapacitor()) ||
    window.location.pathname.toLowerCase().includes('/holad') || 
    isJamPath();
  const needsServerUrl = !serverUrlSet && !isHostedOnBackend;
  const theme = useSettingsStore(state => state.theme);
  const accentColor = useSettingsStore(state => state.accentColor);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      if (theme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else if (theme === 'light') {
        root.classList.remove('dark');
        root.classList.add('light');
      } else {
        if (mediaQuery.matches) {
          root.classList.add('dark');
          root.classList.remove('light');
        } else {
          root.classList.remove('dark');
          root.classList.add('light');
        }
      }
    };

    applyTheme();

    if (theme === 'system' || !theme) {
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
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
  
  const isJamRouteGlobal = isJamPath();
  
  if (needsServerUrl && !isJamRouteGlobal) {
    return <ServerConnectionView onConnected={() => setServerUrlSet(true)} />;
  }

  return (
    <Router basename={getBasePath()}>
      <Routes>
        <Route path="/*" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
