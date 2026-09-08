/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue, getCoverArtUrl } from '../api/subsonic';
import { getCachedImageUrl } from '../utils/imageCache';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTrackSource } from './useTrackSource';
import { isTauri, isCapacitor } from '../utils/StorageManager';
import { AudioEngine } from '../audio/AudioEngine';
import { useSocialStore } from '../store/socialStore';
import { jamSocket } from '../api/socket';

export function useAudioEngine(audioRefs: [React.RefObject<HTMLAudioElement | null>, React.RefObject<HTMLAudioElement | null>], currentTrack: any) {
  const {
    queue,
    isPlaying,
    setIsPlaying,
    nextTrack,
    volume,
    mobileVolume,
    volumeMultiplier,
    role,
    roomId,
    playbackRate,
    sleepTimer,
    setSleepTimer,
    initialPosition,
    setInitialPosition,
    repeatMode,
    hostSettings,
  } = usePlayerStore();

  const audioMode = useSocialStore(s => s.audioMode);
  const isSpeakerDj = roomId !== null && audioMode === 'speaker_dj';

  const setAudioElement = useAudioStore(s => s.setAudioElement);
  const setProgress = useAudioStore(s => s.setProgress);
  const duration = useAudioStore(s => s.duration);
  const setDuration = useAudioStore(s => s.setDuration);
  const isSeeking = useAudioStore(s => s.isSeeking);
  const setIsSeeking = useAudioStore(s => s.setIsSeeking);
  const handleSeekChange = useAudioStore(s => s.handleSeekChange);
  const handleSeekEnd = useAudioStore(s => s.handleSeekEnd);

  const holadDeviceId = useHoladStore(s => s.deviceId);
  const holadActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const isHoladConnected = useHoladStore(s => s.roomId !== null);
  const isActiveDevice = !isHoladConnected || holadActiveDeviceId === holadDeviceId || holadActiveDeviceId === null;

  const { src: audioSrc, trackId: srcTrackId, isLoading: srcLoading, isAvailable } = useTrackSource(currentTrack);

  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());
  const isInitializedRef = useRef<boolean>(false);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);

  const lastLocalStorageWriteRef = useRef<number>(0);
  const latestPositionRef = useRef<number>(0);
  const latestTrackIdRef = useRef<string | null>(null);

  const flushPositionToLocalStorage = useCallback(() => {
    if (latestTrackIdRef.current) {
      try {
        localStorage.setItem('holad_time', latestPositionRef.current.toString());
        localStorage.setItem('holad_track', latestTrackIdRef.current);
        lastLocalStorageWriteRef.current = performance.now();
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  // Flush track position on page unload / pagehide
  useEffect(() => {
    const handleUnload = () => {
      flushPositionToLocalStorage();
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      flushPositionToLocalStorage();
    };
  }, [flushPositionToLocalStorage]);

  useEffect(() => {
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize AudioEngine with dual elements
  useEffect(() => {
    const el0 = audioRefs[0].current;
    const el1 = audioRefs[1].current;
    if (el0 && el1 && !isInitializedRef.current) {
      engineRef.current.initialize([el0, el1]);
      isInitializedRef.current = true;
      setAudioElement(el0);
    }
  }, [audioRefs, setAudioElement]);

  // Sync settings with AudioEngine
  const settings = useSettingsStore();
  
  const effectiveSettings = {
    isCrossfadeEnabled: role === 'listener' && hostSettings ? (hostSettings.isCrossfadeEnabled ?? settings.isCrossfadeEnabled) : settings.isCrossfadeEnabled,
    crossfadeDuration: role === 'listener' && hostSettings ? (hostSettings.crossfadeDuration ?? settings.crossfadeDuration) : settings.crossfadeDuration,
    crossfadeCurve: role === 'listener' && hostSettings ? (hostSettings.crossfadeCurve ?? settings.crossfadeCurve) : settings.crossfadeCurve,
    isGaplessEnabled: role === 'listener' && hostSettings ? (hostSettings.isGaplessEnabled ?? settings.isGaplessEnabled) : settings.isGaplessEnabled,
    isLoudnessNormalizationEnabled: settings.isLoudnessNormalizationEnabled,
    preloadNextTrack: settings.preloadNextTrack,
    compressorThreshold: settings.compressorThreshold,
    compressorRatio: settings.compressorRatio,
    compressorAttack: settings.compressorAttack,
    compressorRelease: settings.compressorRelease,
  };

  useEffect(() => {
    engineRef.current.updateSettings({
      isCrossfadeEnabled: effectiveSettings.isCrossfadeEnabled,
      crossfadeDuration: effectiveSettings.crossfadeDuration,
      crossfadeCurve: effectiveSettings.crossfadeCurve,
      isGaplessEnabled: effectiveSettings.isGaplessEnabled,
      isLoudnessNormalizationEnabled: effectiveSettings.isLoudnessNormalizationEnabled,
      preloadNextTrack: effectiveSettings.preloadNextTrack,
      compressorThreshold: effectiveSettings.compressorThreshold,
      compressorRatio: effectiveSettings.compressorRatio,
      compressorAttack: effectiveSettings.compressorAttack,
      compressorRelease: effectiveSettings.compressorRelease,
    });
  }, [
    effectiveSettings.isCrossfadeEnabled,
    effectiveSettings.crossfadeDuration,
    effectiveSettings.crossfadeCurve,
    effectiveSettings.isGaplessEnabled,
    effectiveSettings.isLoudnessNormalizationEnabled,
    effectiveSettings.preloadNextTrack,
    effectiveSettings.compressorThreshold,
    effectiveSettings.compressorRatio,
    effectiveSettings.compressorAttack,
    effectiveSettings.compressorRelease,
  ]);

  // Volume calculations and updates
  const getScaledVolume = useCallback(() => {
    const isMobile = !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const store = usePlayerStore.getState();
    const activeVol = isMobile ? store.mobileVolume : store.volume;
    const vol = typeof activeVol === 'number' ? Math.max(0, Math.min(1, activeVol)) : 1.0;
    const multiplier = typeof store.volumeMultiplier === 'number' ? Math.max(0, store.volumeMultiplier) : 1.0;
    return { vol, multiplier, isMobile };
  }, []);

  useEffect(() => {
    const { vol, multiplier, isMobile } = getScaledVolume();
    engineRef.current.setVolume(vol, isMobile);
    engineRef.current.setVolumeMultiplier(multiplier);
  }, [getScaledVolume, volume, mobileVolume, volumeMultiplier]);

  useEffect(() => {
    engineRef.current.setPlaybackRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    engineRef.current.setLoop(repeatMode === 'one');
  }, [repeatMode]);

  // Preload next track
  const preloadUpcomingTrack = useCallback(() => {
    if (!settings.preloadNextTrack) return;
    const q = usePlayerStore.getState().queue;
    const idx = usePlayerStore.getState().currentIndex;
    const rMode = usePlayerStore.getState().repeatMode;
    let nextIdx = idx + 1;
    if (nextIdx >= q.length) {
      if (rMode === 'all') {
        nextIdx = 0;
      } else {
        return;
      }
    }
    const nextTrk = q[nextIdx];
    if (nextTrk) {
      engineRef.current.preloadNextTrack(nextTrk).catch(() => {});
      const nextCoverId = nextTrk.coverArt || nextTrk.albumId || nextTrk.id;
      if (nextCoverId) {
        const coverUrl = getCoverArtUrl(nextCoverId, 300);
        if (coverUrl) {
          getCachedImageUrl(coverUrl).catch(() => {});
        }
      }
    }
  }, [settings.preloadNextTrack]);

  // Handle Track Source Changes & Playback Transitions
  const prevTrackIdRef = useRef<string | null>(null);
  const crossfadeTriggeredRef = useRef<string | null>(null);
  const prevActiveDeviceRef = useRef<boolean>(isActiveDevice);

  const playActionId = usePlayerStore(s => s.playActionId);
  const prevPlayActionIdRef = useRef(playActionId);

  useEffect(() => {
    if (!currentTrack || srcLoading || srcTrackId !== currentTrack.id) return;
    
    // oxlint-disable-next-line
    if (!isAvailable) {
      setIsPlaying(false);
      engineRef.current.pause();
      console.warn('This track is not available offline');
      return;
    }
    if (!audioSrc) return;
    
    const didDeviceBecomeActive = isActiveDevice && !prevActiveDeviceRef.current;
    prevActiveDeviceRef.current = isActiveDevice;
    
    const hasPlayActionChanged = playActionId !== prevPlayActionIdRef.current;
    prevPlayActionIdRef.current = playActionId;
    
    if (prevTrackIdRef.current === currentTrack.id && !didDeviceBecomeActive && !hasPlayActionChanged) return;

    const isAutoSkip = crossfadeTriggeredRef.current === prevTrackIdRef.current;
    crossfadeTriggeredRef.current = null;
    prevTrackIdRef.current = currentTrack.id;

    const isPlayingStore = usePlayerStore.getState().isPlaying;
    const isCrossfade = effectiveSettings.isCrossfadeEnabled;
    const durationSec = isAutoSkip ? effectiveSettings.crossfadeDuration : 2;
    
    // Check if the engine was actually playing previously to avoid crossfading when resuming/unpausing
    // Use prevIsPlayingRef to avoid being tricked by queueSlice's triggerPlay() which calls .play() blindly
    const wasPlayingEngine = prevIsPlayingRef.current;
    const isMidTransition = engineRef.current.isTransitioning();

    if (isPlayingStore && isActiveDevice && !isSpeakerDj) {
      const activeDeckIdx = engineRef.current.getActiveDeckIndex();
      const shouldCrossfade = isCrossfade && wasPlayingEngine && !didDeviceBecomeActive && !isMidTransition;
      const nextDeckIdx = (shouldCrossfade ? (1 - activeDeckIdx) : activeDeckIdx) as 0 | 1;
      setActiveIndex(nextDeckIdx);
      const targetEl = audioRefs[nextDeckIdx]?.current;
      if (targetEl) setAudioElement(targetEl);

      engineRef.current.playTrack(
        { ...currentTrack, streamUrl: audioSrc },
        {
          startTime: initialPosition > 0 ? initialPosition / 1000 : 0,
          immediate: !shouldCrossfade,
          transitionDuration: durationSec,
        }
      ).then(() => {
        const newActiveIdx = engineRef.current.getActiveDeckIndex();
        setActiveIndex(newActiveIdx as 0 | 1);
        const newEl = audioRefs[newActiveIdx]?.current;
        if (newEl) setAudioElement(newEl);
      }).catch((e) => {
        console.warn('Track playback initiation error:', e);
      });

      if (initialPosition > 0) {
        setInitialPosition(0);
      }
    } else {
      const activeDeckIdx = engineRef.current.getActiveDeckIndex();
      setActiveIndex(activeDeckIdx as 0 | 1);
      const activeEl = audioRefs[activeDeckIdx]?.current;
      if (activeEl) setAudioElement(activeEl);

      engineRef.current.setDeckTrackId(activeDeckIdx as 0 | 1, currentTrack.id);

      const deck = engineRef.current.getActiveDeck();
      deck.load(audioSrc, initialPosition > 0 ? initialPosition / 1000 : 0).catch(() => {});
      if (initialPosition > 0) setInitialPosition(0);
      if (isSpeakerDj) {
        engineRef.current.pause();
      }
    }
  }, [currentTrack, srcTrackId, audioSrc, srcLoading, isActiveDevice, isSpeakerDj, audioRefs, setAudioElement, effectiveSettings.isCrossfadeEnabled, effectiveSettings.crossfadeDuration, initialPosition, setInitialPosition]);

  // Handle play/pause toggle
  useEffect(() => {
    if (!currentTrack) return;

    if (isPlaying && isActiveDevice && !isSpeakerDj) {
      engineRef.current.resume().catch((e) => {
        console.error('Playback resume error:', e);
      });
    } else {
      flushPositionToLocalStorage();
      engineRef.current.pause();
    }
  }, [isPlaying, currentTrack, isActiveDevice, isSpeakerDj, flushPositionToLocalStorage]);

  // Audio mode dynamic change in Jam
  useEffect(() => {
    if (roomId !== null) {
      if (audioMode === 'speaker_dj') {
        engineRef.current.pause();
      } else if (audioMode === 'synced_audio' && isPlaying && isActiveDevice) {
        const currentProgress = useAudioStore.getState().progress;
        const dur = engineRef.current.getDuration() || currentTrack?.duration || 0;
        if (dur > 0 && currentProgress > 0) {
          const targetTime = (currentProgress / 100) * dur;
          engineRef.current.seek(targetTime);
        }
        engineRef.current.resume().catch(() => {});
      }
    }
  }, [audioMode, roomId, isPlaying, isActiveDevice, currentTrack?.duration]);

  // Broadcast current playing track to friends (only when actively playing)
  useEffect(() => {
    if (currentTrack && isPlaying) {
      jamSocket.emit('social_presenceUpdate', {
        track: {
          id: currentTrack.id,
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album,
          coverArt: currentTrack.coverArt
        }
      });
    } else {
      jamSocket.emit('social_presenceUpdate', { track: null });
    }
  }, [currentTrack?.id, isPlaying]);

  // Sleep timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (sleepTimer.type === 'time' && sleepTimer.endTime && isPlaying) {
      interval = setInterval(() => {
        if (Date.now() >= sleepTimer.endTime!) {
          setIsPlaying(false);
          setSleepTimer(null);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sleepTimer, isPlaying, setIsPlaying, setSleepTimer]);

  // Unlock audio context safely on first user gesture without premature playback
  useEffect(() => {
    const handleInteraction = () => {
      engineRef.current.getWebAudioPipeline()?.unlockContext();
      // Force unlock HTML Audio elements on mobile by playing and immediately pausing them
      // BUT only if they are not actively playing a track, otherwise we break the user's first play action.
      const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      if (audioRefs[1].current && !audioRefs[1].current.src) {
        audioRefs[1].current.src = silentWav;
      }
      audioRefs[0].current?.play().then(() => {
         if (!usePlayerStore.getState().isPlaying) audioRefs[0].current?.pause();
      }).catch(() => {});
      audioRefs[1].current?.play().then(() => {
         if (!usePlayerStore.getState().isPlaying) audioRefs[1].current?.pause();
      }).catch(() => {});
      
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // Save history state & Subsonic playqueue
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const isJamUrl = window.location.pathname.startsWith('/jam');
    const saveState = () => {
      if (currentTrack) {
        const trackIds = queue.map((t) => t.id);
        const pos = Math.floor(engineRef.current.getCurrentTime() * 1000);
        savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
      }
    };
    if (currentTrack && role !== 'listener' && !isJamUrl) {
      saveState();
      if (isPlaying) {
        interval = setInterval(saveState, 2000);
      }
    }
    return () => clearInterval(interval);
  }, [queue, currentTrack, isPlaying, role]);

  // Time and playback updates
  const accumulatedTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const trackIdRef = useRef<string | null>(null);
  const syncedRef = useRef<boolean>(false);
  const isSeekingRef = useRef(isSeeking);
  useEffect(() => {
    isSeekingRef.current = isSeeking;
  }, [isSeeking]);

  useEffect(() => {
    const engine = engineRef.current;

    const handleTimeUpdate = (currentTime: number, emittedTrackId?: string) => {
      if (emittedTrackId && currentTrack && emittedTrackId !== currentTrack.id) return;
      if (!isSeekingRef.current && currentTrack && isActiveDevice) {
        if (trackIdRef.current !== currentTrack.id) {
          trackIdRef.current = currentTrack.id;
          accumulatedTimeRef.current = 0;
          lastTimeRef.current = currentTime;
          syncedRef.current = false;
        }

        const delta = Math.abs(currentTime - lastTimeRef.current);
        if (delta > 0 && delta < 1) {
          accumulatedTimeRef.current += delta;
        }
        lastTimeRef.current = currentTime;

        const dur = engine.getDuration() || currentTrack.duration || 1;
        if (duration !== dur) setDuration(dur);

        const pct = (currentTime / dur) * 100;
        setProgress(pct);

        latestPositionRef.current = currentTime;
        latestTrackIdRef.current = currentTrack.id;

        const now = performance.now();
        if (now - lastLocalStorageWriteRef.current >= 2500) {
          flushPositionToLocalStorage();
        }

        if (!syncedRef.current && (accumulatedTimeRef.current >= 30 || accumulatedTimeRef.current / currentTrack.duration >= 0.5)) {
          syncedRef.current = true;
          const now = Date.now();
          useHistoryStore.getState().addTrackToHistory(currentTrack, now);
          useHoladStore.getState().sendRemoteCommand('syncHistory', { track: currentTrack, playedAt: now });
        }

        // Auto crossfade trigger
        const pStore = usePlayerStore.getState();
        const isJamSession = Boolean(pStore.roomId);
        const canAdvanceTrack = !isJamSession || pStore.role === 'host' || pStore.role === 'cohost';
        const isEngineOnCurrentTrack = engine.getActiveTrackId() === currentTrack.id;
        const actualDur = engine.getDuration() || currentTrack.duration || 0;

        if (
          canAdvanceTrack &&
          isEngineOnCurrentTrack &&
          effectiveSettings.isCrossfadeEnabled &&
          actualDur > 0 &&
          currentTrack.id !== crossfadeTriggeredRef.current &&
          !engine.isTransitioning()
        ) {
          const remaining = actualDur - currentTime;
          if (remaining > 0 && remaining <= effectiveSettings.crossfadeDuration && currentTime > 0) {
            crossfadeTriggeredRef.current = currentTrack.id;
            if (isJamSession) {
              jamSocket.trackEnded(currentTrack.id, pStore.currentIndex, pStore.repeatMode);
            } else {
              nextTrack();
            }
          }
        }
      }
    };

    const handleEnded = (emittedTrackId?: string) => {
      flushPositionToLocalStorage();
      if (!currentTrack) return;
      if (emittedTrackId && emittedTrackId !== currentTrack.id) return;
      const pStore = usePlayerStore.getState();
      const isJamSession = Boolean(pStore.roomId);
      if (isJamSession && pStore.role !== 'host' && pStore.role !== 'cohost') return;
      if (role === 'listener') return;
      if (sleepTimer.type === 'track_end') {
        setIsPlaying(false);
        setSleepTimer(null);
        return;
      }

      if (engine.isTransitioning()) return;
      if (crossfadeTriggeredRef.current === currentTrack.id) return;
      
      if (isJamSession) {
        jamSocket.trackEnded(currentTrack.id, pStore.currentIndex, pStore.repeatMode);
      } else {
        nextTrack();
      }
    };

    const handleRequestPreload = () => {
      preloadUpcomingTrack();
    };

    engine.on('timeupdate', handleTimeUpdate);
    engine.on('ended', handleEnded);
    engine.on('requestPreload', handleRequestPreload);

    return () => {
      engine.off('timeupdate', handleTimeUpdate);
      engine.off('ended', handleEnded);
      engine.off('requestPreload', handleRequestPreload);
    };
  }, [currentTrack, isActiveDevice, duration, role, sleepTimer, effectiveSettings.isCrossfadeEnabled, effectiveSettings.crossfadeDuration, nextTrack, preloadUpcomingTrack, setDuration, setProgress, setIsPlaying, setSleepTimer, flushPositionToLocalStorage]);

  // Holad Syncing
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && isActiveDevice && isHoladConnected) {
      interval = setInterval(() => {
        const roomId = useHoladStore.getState().roomId;
        if (roomId) {
          useHoladStore.getState().socket?.emit('holad_syncTime', {
            roomId,
            currentTime: engineRef.current.getCurrentTime(),
          });
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isActiveDevice, isHoladConnected]);

  useEffect(() => {
    if (isActiveDevice || !isHoladConnected) return;

    let animationFrame: number;
    let lastTime = performance.now();
    let localCurrentTime = (useAudioStore.getState().progress / 100) * (currentTrack?.duration || 1);

    const socket = useHoladStore.getState().socket;

    const onSyncTime = (data: { currentTime: number }) => {
      localCurrentTime = data.currentTime;
      lastTime = performance.now();
      if (currentTrack && currentTrack.duration) {
        setProgress((localCurrentTime / currentTrack.duration) * 100);
      }
    };

    if (socket) {
      socket.on('holad_syncTime', onSyncTime);
    }

    const tick = () => {
      if (currentTrack && currentTrack.duration && duration !== currentTrack.duration) {
        setDuration(currentTrack.duration);
      }

      if (usePlayerStore.getState().isPlaying && currentTrack && currentTrack.duration) {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;
        localCurrentTime += delta;
        if (!useAudioStore.getState().isSeeking) {
          setProgress((localCurrentTime / currentTrack.duration) * 100);
        }
      } else {
        lastTime = performance.now();
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrame);
      if (socket) socket.off('holad_syncTime', onSyncTime);
    };
  }, [isActiveDevice, currentTrack, isHoladConnected, duration, setDuration]);

  return {
    get progress() {
      return useAudioStore.getState().progress;
    },
    setProgress,
    duration,
    setDuration,
    isSeeking,
    setIsSeeking,
    handleSeekChange,
    handleSeekEnd,
    activeIndex,
  };
}
