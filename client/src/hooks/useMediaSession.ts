import { useEffect } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { MediaSession } from '@capgo/capacitor-media-session';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useIsActiveDevice } from './useIsActiveDevice';
import { useWindowVisibility, getIsWindowVisible } from './useWindowVisibility';
import { getCoverArtUrl } from '../api/subsonic';
import { getAudioEngine } from '../audio/AudioEngine';
import { isTauri } from '../utils/StorageManager';
import { invoke } from '@tauri-apps/api/core';

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
      if (isTauri()) {
        invoke('plugin:mediaSession|setPlaybackState', {
          isPlaying: isCurrentlyPlaying,
          position: safePosition,
          playbackRate: safeRate
        }).catch((err) => {
          console.warn('[MediaSession] plugin:mediaSession|setPlaybackState failed:', err);
        });
        invoke('desktop_media_set_state', {
          isPlaying: isCurrentlyPlaying,
          position: safePosition,
          playbackRate: safeRate
        }).catch(() => {});
      }
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

      if (isTauri()) {
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
        invoke('desktop_media_set_metadata', {
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: effectiveDuration,
          artwork: coverUrl || null
        }).catch(() => {});
      }

      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata(metadata);
        
        MediaSession.setActionHandler({ action: 'play' }, () => {
          setIsPlaying(true);
          const engine = getAudioEngine();
          if (engine) engine.resume().catch(() => {});
        });
        MediaSession.setActionHandler({ action: 'pause' }, () => {
          setIsPlaying(false);
          const engine = getAudioEngine();
          if (engine) engine.pause();
        });
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
      if (isTauri()) {
        invoke('plugin:mediaSession|stop').catch(() => {});
        invoke('desktop_media_set_state', {
          isPlaying: false,
          position: 0,
          playbackRate: 0
        }).catch(() => {});
      }
      if (Capacitor.isNativePlatform()) {
        MediaSession.setMetadata({ title: '', artist: '', album: '' });
      } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack, setIsPlaying, nextTrack, prevTrack]);

  useEffect(() => {
    let isSubscribed = true;
    const handles: PluginListenerHandle[] = [];

    // Direct DOM CustomEvent fallbacks emitted by native evaluateJavascript
    const onDirectPlay = () => {
      setIsPlaying(true);
      const engine = getAudioEngine();
      if (engine) engine.resume().catch(() => {});
    };
    const onDirectPause = () => {
      setIsPlaying(false);
      const engine = getAudioEngine();
      if (engine) engine.pause();
    };
    window.addEventListener('holad:mediasession:play', onDirectPlay);
    window.addEventListener('holad:mediasession:pause', onDirectPause);

    let unlistenTauriMedia: (() => void) | undefined;
    let unlistenTauriPluginMedia: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        const handleAction = (payload: { action: string; seekTime?: number }) => {
          if (!payload) return;
          switch (payload.action) {
            case 'play':
              onDirectPlay();
              break;
            case 'pause':
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
              prevTrack();
              break;
            case 'nexttrack':
              nextTrack();
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

        listen<{ action: string; seekTime?: number }>('mediaAction', (event) => {
          handleAction(event.payload);
        }).then(unlisten => {
          if (!isSubscribed) unlisten();
          else unlistenTauriMedia = unlisten;
        }).catch(() => {});

        listen<{ action: string; seekTime?: number }>('mediaSession:mediaAction', (event) => {
          handleAction(event.payload);
        }).then(unlisten => {
          if (!isSubscribed) unlisten();
          else unlistenTauriPluginMedia = unlisten;
        }).catch(() => {});
      }).catch(() => {});
    }

    if (Capacitor.isNativePlatform()) {
      const setupListeners = async () => {
        try {
          const events: Array<{ event: string; handler: () => void }> = [
            { event: 'play', handler: () => { setIsPlaying(true); const engine = getAudioEngine(); if (engine) engine.resume().catch(() => {}); } },
            { event: 'pause', handler: () => { setIsPlaying(false); const engine = getAudioEngine(); if (engine) engine.pause(); } },
            { event: 'playpause', handler: () => { const playing = !usePlayerStore.getState().isPlaying; setIsPlaying(playing); const engine = getAudioEngine(); if (engine) { if (playing) engine.resume().catch(() => {}); else engine.pause(); } } },
            { event: 'nexttrack', handler: () => nextTrack() },
            { event: 'previoustrack', handler: () => prevTrack() },
          ];

          for (const { event, handler } of events) {
            if (typeof (MediaSession as any).addListener === 'function') {
              const handle = await (MediaSession as any).addListener(event, handler);
              if (!isSubscribed) {
                if (handle && typeof handle.remove === 'function') handle.remove();
              } else {
                handles.push(handle);
              }
            }
          }
        } catch (err) {
          console.warn('[MediaSession] Failed to attach native listeners:', err);
        }
      };

      setupListeners();
    }

    return () => {
      isSubscribed = false;
      if (unlistenTauriMedia) unlistenTauriMedia();
      if (unlistenTauriPluginMedia) unlistenTauriPluginMedia();
      window.removeEventListener('holad:mediasession:play', onDirectPlay);
      window.removeEventListener('holad:mediasession:pause', onDirectPause);
      handles.forEach((handle) => {
        try {
          if (handle && typeof handle.remove === 'function') {
            handle.remove();
          }
        } catch {}
      });
    };
  }, [setIsPlaying, nextTrack, prevTrack]);




  const isActiveDevice = useIsActiveDevice();
  const isWindowVisible = useWindowVisibility();

  useEffect(() => {
    // Only report 'playing' if this device is the active audio engine, or if it is currently visible
    // When minimized/in tray on a remote device, always report 'paused' so wallpapers and SMTC stay idle
    const shouldReportPlaying = isPlaying && (isActiveDevice || isWindowVisible);
    const state = shouldReportPlaying ? 'playing' : 'paused';

    if (isTauri()) {
      const audioState = useAudioStore.getState();
      const duration = audioState.duration || currentTrack?.duration || 0;
      const position = duration > 0 ? (audioState.progress / 100) * duration : 0;
      const rate = shouldReportPlaying ? 1.0 : 0.0;
      invoke('plugin:mediaSession|setPlaybackState', {
        isPlaying: shouldReportPlaying,
        position,
        playbackRate: rate
      }).catch((err) => {
        console.warn('[MediaSession] plugin:mediaSession|setPlaybackState failed:', err);
      });
      invoke('desktop_media_set_state', {
        isPlaying: shouldReportPlaying,
        position,
        playbackRate: rate
      }).catch(() => {});
    }

    if (Capacitor.isNativePlatform()) {
      MediaSession.setPlaybackState({ playbackState: state });
      import('@capacitor/core').then(({ registerPlugin }) => {
        const AudioDevice = registerPlugin<any>('AudioDevice');
        if (AudioDevice && typeof AudioDevice.notifyPlaybackState === 'function') {
          AudioDevice.notifyPlaybackState({ state }).catch(() => {});
        }
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
