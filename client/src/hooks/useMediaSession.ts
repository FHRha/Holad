import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { usePlayerStore } from '../store/playerStore';
import { getCoverArtUrl } from '../api/subsonic';

export function useMediaSession() {
  const currentTrack = usePlayerStore(state => state.queue[state.currentIndex]);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);
  const nextTrack = usePlayerStore(state => state.nextTrack);
  const prevTrack = usePlayerStore(state => state.prevTrack);

  useEffect(() => {
    if (currentTrack) {
      const metadata = {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Unknown Album',
        artwork: [
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 96), sizes: '96x96', type: 'image/jpeg' },
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 128), sizes: '128x128', type: 'image/jpeg' },
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 192), sizes: '192x192', type: 'image/jpeg' },
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 256), sizes: '256x256', type: 'image/jpeg' },
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 384), sizes: '384x384', type: 'image/jpeg' },
          { src: getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 512), sizes: '512x512', type: 'image/jpeg' },
        ]
      };

      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata(metadata);
        
        MediaSession.setActionHandler({ action: 'play' }, () => setIsPlaying(true));
        MediaSession.setActionHandler({ action: 'pause' }, () => setIsPlaying(false));
        MediaSession.setActionHandler({ action: 'previoustrack' }, () => prevTrack());
        MediaSession.setActionHandler({ action: 'nexttrack' }, () => nextTrack());

        const doSeek = (offset: number) => {
          import('../store/audioStore').then(({ useAudioStore }) => {
            const state = useAudioStore.getState();
            const duration = state.duration || 1;
            const currentTime = (state.progress / 100) * duration;
            const newVal = Math.max(0, Math.min(1, (currentTime + offset) / duration));
            state.handleSeekEnd(newVal);
          });
        };

        MediaSession.setActionHandler({ action: 'seekbackward' }, () => doSeek(-30));
        MediaSession.setActionHandler({ action: 'seekforward' }, () => doSeek(30));
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());

        const doSeek = (offset: number) => {
          import('../store/audioStore').then(({ useAudioStore }) => {
            const state = useAudioStore.getState();
            const duration = state.duration || 1;
            const currentTime = (state.progress / 100) * duration;
            const newVal = Math.max(0, Math.min(1, (currentTime + offset) / duration));
            state.handleSeekEnd(newVal);
          });
        };

        navigator.mediaSession.setActionHandler('seekbackward', () => doSeek(-30));
        navigator.mediaSession.setActionHandler('seekforward', () => doSeek(30));
      }
    } else {
      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata({ title: '', artist: '', album: '' });
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    }
    
    return () => {};
  }, [currentTrack, setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    const state = isPlaying ? 'playing' : 'paused';

    if (Capacitor.isNativePlatform()) {
      MediaSession.setPlaybackState({ playbackState: state });
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }, [isPlaying]);
}
