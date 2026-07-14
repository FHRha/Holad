import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

export function useDocumentTitle() {
  const { queue, currentIndex, isPlaying } = usePlayerStore();
  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (currentTrack) {
      const playState = isPlaying ? '▶ ' : '';
      document.title = `${playState}${currentTrack.title} - ${currentTrack.artist} | StreamNavi`;
    } else {
      document.title = 'StreamNavi';
    }
  }, [currentTrack, isPlaying]);
}
