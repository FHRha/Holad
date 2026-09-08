import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { getCoverArtUrl } from '../api/subsonic';

export function useMediaSession() {
  const currentTrack = usePlayerStore(state => state.queue[state.currentIndex]);
  const isPlaying = usePlayerStore(state => state.isPlaying);
  const setIsPlaying = usePlayerStore(state => state.setIsPlaying);
  const nextTrack = usePlayerStore(state => state.nextTrack);
  const prevTrack = usePlayerStore(state => state.prevTrack);

  const updatePositionState = (position: number, duration: number, playbackRate = 1) => {
    if (!isFinite(duration) || duration <= 0) return;
    const safePosition = Math.max(0, Math.min(position, duration));
    const safeRate = isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;

    try {
      if (Capacitor.isNativePlatform()) {
        MediaSession.setPositionState({
          duration,
          playbackRate: safeRate,
          position: safePosition
        });
      } else if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: safeRate,
          position: safePosition
        });
      }
    } catch {
      // Ignore errors from rapid updates or unsupported browsers
    }
  };

  const handleSeek = (targetSeconds: number) => {
    const state = useAudioStore.getState();
    const duration = state.duration || (currentTrack ? currentTrack.duration : 0) || 1;
    const clampedTime = Math.max(0, Math.min(duration, targetSeconds));
    const newVal = duration > 0 ? clampedTime / duration : 0;

    state.setProgress(newVal * 100);
    state.handleSeekEnd(newVal);
    updatePositionState(clampedTime, duration);
  };

  const handleSeekOffset = (offset: number) => {
    const state = useAudioStore.getState();
    const duration = state.duration || (currentTrack ? currentTrack.duration : 0) || 1;
    const currentTime = (state.progress / 100) * duration;
    handleSeek(currentTime + offset);
  };

  useEffect(() => {
    if (currentTrack) {
      const coverUrl = getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 300);
      const metadata = {
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Unknown Album',
        artwork: coverUrl ? [
          { src: coverUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: coverUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: coverUrl, sizes: '512x512', type: 'image/jpeg' },
        ] : []
      };

      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata(metadata);
        
        MediaSession.setActionHandler({ action: 'play' }, () => setIsPlaying(true));
        MediaSession.setActionHandler({ action: 'pause' }, () => setIsPlaying(false));
        MediaSession.setActionHandler({ action: 'previoustrack' }, () => prevTrack());
        MediaSession.setActionHandler({ action: 'nexttrack' }, () => nextTrack());
        MediaSession.setActionHandler({ action: 'seekbackward' }, () => handleSeekOffset(-30));
        MediaSession.setActionHandler({ action: 'seekforward' }, () => handleSeekOffset(30));
        MediaSession.setActionHandler({ action: 'seekto' }, (details) => {
          if (details && typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
            handleSeek(details.seekTime);
          }
        });
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
        navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
        navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
        navigator.mediaSession.setActionHandler('seekbackward', () => handleSeekOffset(-30));
        navigator.mediaSession.setActionHandler('seekforward', () => handleSeekOffset(30));
        try {
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details && typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
              handleSeek(details.seekTime);
            }
          });
        } catch {
          // 'seekto' may not be supported by some older browsers
        }
      }
    } else {
      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata({ title: '', artist: '', album: '' });
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack, setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    const state = isPlaying ? 'playing' : 'paused';

    if (Capacitor.isNativePlatform()) {
      MediaSession.setPlaybackState({ playbackState: state });
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }

    if (currentTrack) {
      const audioState = useAudioStore.getState();
      const duration = audioState.duration || currentTrack.duration || 0;
      if (duration > 0) {
        const position = (audioState.progress / 100) * duration;
        updatePositionState(position, duration, 1);
      }
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    let lastUpdate = 0;
    let lastPosition = -1;

    const unsubscribe = useAudioStore.subscribe((state) => {
      if (!currentTrack || state.isSeeking) return;

      const duration = state.duration || currentTrack.duration || 0;
      if (duration <= 0) return;

      const position = (state.progress / 100) * duration;
      const now = Date.now();

      // Throttle bridge updates to at most once every 1000ms,
      // but update immediately if position jumped significantly (e.g. seek)
      if (now - lastUpdate >= 1000 || Math.abs(position - lastPosition) > 2) {
        lastUpdate = now;
        lastPosition = position;
        updatePositionState(position, duration, 1);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentTrack]);
}
