import { useState, useEffect } from 'react';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import FullScreenPlayerUI from './FullScreenPlayerUI';
import MobilePlayerUI from '../player/MobilePlayerUI';
import { isTauri, isCapacitor } from '../../utils/StorageManager';

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

  const isJamRoute = window.location.pathname.startsWith('/jam');
  const searchParams = new URLSearchParams(window.location.search);
  const validStandalone = (searchParams.has('track') && !!searchParams.get('track')) || (searchParams.has('album') && !!searchParams.get('album'));

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
