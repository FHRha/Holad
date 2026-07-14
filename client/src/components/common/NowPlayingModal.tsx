import { useUIStore } from '../../store/uiStore';
import FullScreenPlayerUI from './FullScreenPlayerUI';

export default function NowPlayingModal() {
  const { isNowPlayingOpen, setNowPlayingOpen } = useUIStore();

  if (!isNowPlayingOpen) return null;

  return (
    <FullScreenPlayerUI 
      onClose={() => setNowPlayingOpen(false)} 
    />
  );
}
