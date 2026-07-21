import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { getCoverArtUrl } from '../api/subsonic';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';

export function useMediaSession() {
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack } = usePlayerStore();
  const currentTrack = queue[currentIndex];

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

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

      if (isNative) {
        MediaSession.setMetadata(metadata);
        
        const setupListeners = async () => {
           await MediaSession.setActionHandler({ action: 'play' }, () => setIsPlaying(true));
           await MediaSession.setActionHandler({ action: 'pause' }, () => setIsPlaying(false));
           await MediaSession.setActionHandler({ action: 'previoustrack' }, () => prevTrack());
           await MediaSession.setActionHandler({ action: 'nexttrack' }, () => nextTrack());
           
           const doSeek = (offset: number) => {
             import('../store/audioStore').then(({ useAudioStore }) => {
               const state = useAudioStore.getState();
               const duration = state.duration || 1;
               const currentTime = (state.progress / 100) * duration;
               const newVal = Math.max(0, Math.min(1, (currentTime + offset) / duration));
               state.handleSeekEnd(newVal);
             });
           };

           await MediaSession.setActionHandler({ action: 'seekbackward' }, () => doSeek(-30));
           await MediaSession.setActionHandler({ action: 'seekforward' }, () => doSeek(30));
        };
        setupListeners();
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
      if (isNative) {
        MediaSession.setMetadata({});
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    }
    
    return () => {
      const cleanupListeners = async () => {
        if (Capacitor.isNativePlatform()) {
          await MediaSession.setActionHandler({ action: 'play' }, null);
          await MediaSession.setActionHandler({ action: 'pause' }, null);
          await MediaSession.setActionHandler({ action: 'previoustrack' }, null);
          await MediaSession.setActionHandler({ action: 'nexttrack' }, null);
        }
      };
      cleanupListeners();
    };
  }, [currentTrack, setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    const state = isPlaying ? 'playing' : 'paused';

    if (isNative) {
      MediaSession.setPlaybackState({ playbackState: state });
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }, [isPlaying]);
}
