import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

export function useDocumentTitle() {
  const { queue, currentIndex, isPlaying } = usePlayerStore();
  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (currentTrack && isPlaying) {
      document.title = `${currentTrack.title} - ${currentTrack.artist}`;
    } else {
      document.title = 'Holad';
    }
  }, [currentTrack, isPlaying]);
}
