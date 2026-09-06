import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import FullScreenPlayerUI from './FullScreenPlayerUI';
import MobilePlayerUI from '../player/MobilePlayerUI';

export default function NowPlayingModal() {
  const isNowPlayingOpen = useUIStore(state => state.isNowPlayingOpen);
  const setNowPlayingOpen = useUIStore(state => state.setNowPlayingOpen);
  const isMinimized = usePlayerStore(state => state.isMinimized);
  const role = usePlayerStore(state => state.role);
  const roomId = usePlayerStore(state => state.roomId);

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
      <div className="hidden md:block">
        <FullScreenPlayerUI onClose={desktopOnClose} />
      </div>
      <div className="block md:hidden">
        <MobilePlayerUI onClose={handleClose} />
      </div>
    </>
  );
}
