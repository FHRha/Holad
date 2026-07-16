import { useUIStore } from '../../store/uiStore';
import FullScreenPlayerUI from './FullScreenPlayerUI';
import MobilePlayerUI from '../player/MobilePlayerUI';

export default function NowPlayingModal() {
  const { isNowPlayingOpen, setNowPlayingOpen } = useUIStore();

  if (!isNowPlayingOpen) return null;

  return (
    <>
      <div className="hidden md:block">
        <FullScreenPlayerUI onClose={() => setNowPlayingOpen(false)} />
      </div>
      <div className="block md:hidden">
        <MobilePlayerUI onClose={() => setNowPlayingOpen(false)} />
      </div>
    </>
  );
}
