import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import FullScreenPlayerUI from './FullScreenPlayerUI';
import MobilePlayerUI from '../player/MobilePlayerUI';
import { isTauri, isCapacitor } from '../../utils/StorageManager';
import { getBasePath, isJamPath } from '../../utils/basePath';

const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  if (isTauri()) return false;
  return isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
};

export default function NowPlayingModal() {
  const isNowPlayingOpen = useUIStore(state => state.isNowPlayingOpen);
  const setNowPlayingOpen = useUIStore(state => state.setNowPlayingOpen);
  const isMinimized = usePlayerStore(state => state.isMinimized);
  const role = usePlayerStore(state => state.role);
  const roomId = usePlayerStore(state => state.roomId);

  const [isMobile, setIsMobile] = useState(isMobileDevice);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isJamRoute = isJamPath();
  const searchParams = new URLSearchParams(window.location.search);
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const base = getBasePath();
  const normPath = base && window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname;
  const isStandalonePath = normPath.startsWith('/jam/track/') ||
                           normPath.startsWith('/jam/album/') ||
                           normPath.startsWith('/jam/playlist/');
  const validStandalone = isStandaloneQuery || isStandalonePath;

  const isControlledByMinimization = isJamRoute && role !== 'host' && (!!roomId || validStandalone);
  const showPlayer = isControlledByMinimization ? !isMinimized : isNowPlayingOpen;

  if (!showPlayer) return null;

  const handleClose = () => {
    if (isControlledByMinimization) {
      usePlayerStore.getState().setIsMinimized(true);
    } else {
      setNowPlayingOpen(false);
    }
  };

  const desktopOnClose = role === 'listener' ? undefined : handleClose;

  return (
    <>
      {!isMobile ? (
        <FullScreenPlayerUI onClose={desktopOnClose} />
      ) : (
        <MobilePlayerUI onClose={handleClose} />
      )}
    </>
  );
}
