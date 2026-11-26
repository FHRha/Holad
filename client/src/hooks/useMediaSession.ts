import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useDownloadStore } from '../store/downloadStore';
import { useIsActiveDevice } from './useIsActiveDevice';
import { useWindowVisibility, getIsWindowVisible } from './useWindowVisibility';
import { getCoverArtUrl } from '../api/subsonic';
import { getAudioEngine } from '../audio/AudioEngine';
import { isTauri, isTauriDesktop, isTauriMobile } from '../utils/platform';
import { invoke } from '@tauri-apps/api/core';

function isTrackStreaming(track: any): boolean {
  if (!track) return false;
  const audioEl = useAudioStore.getState().audioElement;
  const activeSrc = audioEl?.currentSrc || audioEl?.src || track.streamUrl || track.src || '';
  if (
    activeSrc.startsWith('file://') ||
    activeSrc.startsWith('blob:') ||
    activeSrc.includes('asset.localhost')
  ) {
    return false;
  }
  const downloads = useDownloadStore.getState().downloads;
  if (downloads[track.id]?.status === 'completed') {
    return false;
  }
  return true;
}

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
    const isCurrentlyPlaying = usePlayerStore.getState().isPlaying;

    try {
      if (isTauriMobile()) {
        const playerState = usePlayerStore.getState();
        const activeTrack = playerState.queue[playerState.currentIndex] || currentTrack;
        invoke('plugin:mediaSession|setPlaybackState', {
          isPlaying: isCurrentlyPlaying,
          position: safePosition,
          playbackRate: safeRate,
          isStreaming: isTrackStreaming(activeTrack)
        }).catch((err) => {
          console.warn('[MediaSession] plugin:mediaSession|setPlaybackState failed:', err);
        });
      } else if (isTauriDesktop()) {
        invoke('desktop_media_set_state', {
          isPlaying: isCurrentlyPlaying,
          position: safePosition,
          playbackRate: safeRate
        }).catch(() => {});
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
    const cur = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
    const duration = state.duration || (cur ? cur.duration : 0) || (currentTrack ? currentTrack.duration : 0) || 1;
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
      let coverUrl = getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 300);
      if (coverUrl && coverUrl.startsWith('/')) {
        try {
          if (typeof window !== 'undefined' && window.location && window.location.origin) {
            coverUrl = `${window.location.origin}${coverUrl}`;
          }
        } catch {}
      }
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

      if (isTauriMobile()) {
        const audioState = useAudioStore.getState();
        const effectiveDuration = currentTrack.duration || audioState.duration || 0;
        invoke('plugin:mediaSession|setMetadata', {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: effectiveDuration,
          artwork: coverUrl || null
        }).catch((err) => {
          console.warn('[MediaSession] plugin:mediaSession|setMetadata failed:', err);
        });
      } else if (isTauriDesktop()) {
        const audioState = useAudioStore.getState();
        const effectiveDuration = currentTrack.duration || audioState.duration || 0;
        invoke('desktop_media_set_metadata', {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: effectiveDuration,
          artwork: coverUrl || null
        }).catch(() => {});
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
      if (isTauriMobile()) {
        invoke('plugin:mediaSession|stop').catch(() => {});
      } else if (isTauriDesktop()) {
        invoke('desktop_media_set_state', {
          isPlaying: false,
          position: 0,
          playbackRate: 0
        }).catch(() => {});
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack, setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    let isSubscribed = true;

    let lastActionTime = 0;
    let lastActionType = '';

    // Direct DOM CustomEvent fallbacks emitted by native evaluateJavascript
    const onDirectPlay = () => {
      usePlayerStore.getState().setIsPlaying(true);
      const engine = getAudioEngine();
      if (engine) engine.resume().catch(() => {});
    };
    const onDirectPause = () => {
      usePlayerStore.getState().setIsPlaying(false);
      const engine = getAudioEngine();
      if (engine) engine.pause();
    };

    const handleAction = (payload: { action: string; seekTime?: number }) => {
      if (!payload || !payload.action) return;
      const now = Date.now();
      // Debounce duplicate events arriving within 250ms for the same action
      if (payload.action === lastActionType && now - lastActionTime < 250) {
        return;
      }
      lastActionTime = now;
      lastActionType = payload.action;

      switch (payload.action) {
        case 'play':
          onDirectPlay();
          break;
        case 'pause':
        case 'stop':
          onDirectPause();
          break;
        case 'toggle':
        case 'playpause': {
          const playing = usePlayerStore.getState().isPlaying;
          if (playing) {
            onDirectPause();
          } else {
            onDirectPlay();
          }
          break;
        }
        case 'previoustrack':
          usePlayerStore.getState().prevTrack();
          break;
        case 'nexttrack':
          usePlayerStore.getState().nextTrack();
          break;
        case 'seekto':
          if (typeof payload.seekTime === 'number' && !isNaN(payload.seekTime)) {
            handleSeek(payload.seekTime);
          }
          break;
        case 'duck': {
          const eng = getAudioEngine();
          if (eng && typeof (eng as any).setVolume === 'function') {
            (eng as any).setVolume(0.2);
          }
          break;
        }
        case 'unduck': {
          const eng = getAudioEngine();
          if (eng && typeof (eng as any).setVolume === 'function') {
            (eng as any).setVolume(1.0);
          }
          break;
        }
      }
    };

    const onDirectActionEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ action: string; seekTime?: number }>;
      if (customEvent && customEvent.detail) {
        handleAction(customEvent.detail);
      }
    };

    const onDirectNext = () => handleAction({ action: 'nexttrack' });
    const onDirectPrev = () => handleAction({ action: 'previoustrack' });

    window.addEventListener('holad:mediasession:action', onDirectActionEvent);
    window.addEventListener('holad:mediasession:play', onDirectPlay);
    window.addEventListener('holad:mediasession:pause', onDirectPause);
    window.addEventListener('holad:mediasession:nexttrack', onDirectNext);
    window.addEventListener('holad:mediasession:previoustrack', onDirectPrev);

    let unlistenTauriMedia: (() => void) | undefined;
    let unlistenTauriPluginMedia: (() => void) | undefined;
    if (isTauriMobile()) {
      import('@tauri-apps/api/core').then(({ Channel, invoke }) => {
        if (!isSubscribed) return;
        try {
          const channel = new Channel<{ action: string; seekTime?: number }>();
          channel.onmessage = (payload) => {
            if (isSubscribed) handleAction(payload);
          };
          invoke('plugin:mediaSession|registerMediaListener', { handler: channel }).catch(() => {
            invoke('plugin:mediaSession|registerListener', { event: 'mediaAction', handler: channel }).catch(() => {});
          });
        } catch (e) {
          console.warn('[MediaSession] channel registration error:', e);
        }
      }).catch(() => {});
    }

    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<{ action: string; seekTime?: number }>('mediaAction', (event) => {
          if (isSubscribed) handleAction(event.payload);
        }).then(unlisten => {
          if (!isSubscribed) unlisten();
          else unlistenTauriMedia = unlisten;
        }).catch(() => {});

        if (isTauriMobile()) {
          listen<{ action: string; seekTime?: number }>('mediaSession:mediaAction', (event) => {
            if (isSubscribed) handleAction(event.payload);
          }).then(unlisten => {
            if (!isSubscribed) unlisten();
            else unlistenTauriPluginMedia = unlisten;
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    return () => {
      isSubscribed = false;
      if (unlistenTauriMedia) unlistenTauriMedia();
      if (unlistenTauriPluginMedia) unlistenTauriPluginMedia();
      window.removeEventListener('holad:mediasession:action', onDirectActionEvent);
      window.removeEventListener('holad:mediasession:play', onDirectPlay);
      window.removeEventListener('holad:mediasession:pause', onDirectPause);
      window.removeEventListener('holad:mediasession:nexttrack', onDirectNext);
      window.removeEventListener('holad:mediasession:previoustrack', onDirectPrev);
    };
  }, [setIsPlaying, nextTrack, prevTrack]);




  const isActiveDevice = useIsActiveDevice();
  const isWindowVisible = useWindowVisibility();

  useEffect(() => {
    // Only report 'playing' if this device is the active audio engine, or if it is currently visible
    // When minimized/in tray on a remote device, always report 'paused' so wallpapers and SMTC stay idle
    const shouldReportPlaying = isPlaying && (isActiveDevice || isWindowVisible);
    const state = shouldReportPlaying ? 'playing' : 'paused';

    if (isTauriMobile()) {
      const audioState = useAudioStore.getState();
      const duration = audioState.duration || currentTrack?.duration || 0;
      const position = duration > 0 ? (audioState.progress / 100) * duration : 0;
      const rate = shouldReportPlaying ? 1.0 : 0.0;
      invoke('plugin:mediaSession|setPlaybackState', {
        isPlaying: shouldReportPlaying,
        position,
        playbackRate: rate,
        isStreaming: isTrackStreaming(currentTrack)
      }).catch((err) => {
        console.warn('[MediaSession] plugin:mediaSession|setPlaybackState failed:', err);
      });
    } else if (isTauriDesktop()) {
      const audioState = useAudioStore.getState();
      const duration = audioState.duration || currentTrack?.duration || 0;
      const position = duration > 0 ? (audioState.progress / 100) * duration : 0;
      const rate = shouldReportPlaying ? 1.0 : 0.0;
      invoke('desktop_media_set_state', {
        isPlaying: shouldReportPlaying,
        position,
        playbackRate: rate
      }).catch(() => {});
    } else if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }

    if (currentTrack && (isActiveDevice || isWindowVisible)) {
      const audioState = useAudioStore.getState();
      const duration = audioState.duration || currentTrack.duration || 0;
      if (duration > 0) {
        const position = (audioState.progress / 100) * duration;
        updatePositionState(position, duration, 1);
      }
    }
  }, [isPlaying, currentTrack, isActiveDevice, isWindowVisible]);

  useEffect(() => {
    let lastUpdate = 0;
    let lastPosition = -1;

    const unsubscribe = useAudioStore.subscribe((state) => {
      if (!currentTrack || state.isSeeking) return;
      // Do not emit OS media session position updates if we are just a remote control and minimized/in tray
      if (!isActiveDevice && !getIsWindowVisible()) return;

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
  }, [currentTrack, isActiveDevice]);
}
