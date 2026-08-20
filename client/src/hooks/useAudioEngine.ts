/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue } from '../api/subsonic';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTrackSource } from './useTrackSource';
import { isTauri, isCapacitor } from '../utils/StorageManager';
import { AudioEngine } from '../audio/AudioEngine';

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
    playbackRate,
    sleepTimer,
    setSleepTimer,
    initialPosition,
    setInitialPosition,
    repeatMode,
  } = usePlayerStore();

  const {
    setAudioElement,
    progress,
    setProgress,
    duration,
    setDuration,
    isSeeking,
    setIsSeeking,
    handleSeekChange,
    handleSeekEnd,
  } = useAudioStore();

  const holadDeviceId = useHoladStore(s => s.deviceId);
  const holadActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const isHoladConnected = useHoladStore(s => s.roomId !== null);
  const isActiveDevice = !isHoladConnected || holadActiveDeviceId === holadDeviceId || holadActiveDeviceId === null;

  const { src: audioSrc, trackId: srcTrackId, isLoading: srcLoading, isAvailable } = useTrackSource(currentTrack);

  const [activeIndex, setActiveIndex] = useState<0 | 1>(0);
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());
  const isInitializedRef = useRef<boolean>(false);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);

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
  useEffect(() => {
    engineRef.current.updateSettings({
      isCrossfadeEnabled: settings.isCrossfadeEnabled,
      crossfadeDuration: settings.crossfadeDuration,
      crossfadeCurve: settings.crossfadeCurve,
      isGaplessEnabled: settings.isGaplessEnabled,
      isLoudnessNormalizationEnabled: settings.isLoudnessNormalizationEnabled,
      preloadNextTrack: settings.preloadNextTrack,
    });
  }, [
    settings.isCrossfadeEnabled,
    settings.crossfadeDuration,
    settings.crossfadeCurve,
    settings.isGaplessEnabled,
    settings.isLoudnessNormalizationEnabled,
    settings.preloadNextTrack,
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
    }
  }, [settings.preloadNextTrack]);

  // Handle Track Source Changes & Playback Transitions
  const prevTrackIdRef = useRef<string | null>(null);
  const crossfadeTriggeredRef = useRef<string | null>(null);
  const prevActiveDeviceRef = useRef<boolean>(isActiveDevice);

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
    
    if (prevTrackIdRef.current === currentTrack.id && !didDeviceBecomeActive) return;

    const isAutoSkip = crossfadeTriggeredRef.current === prevTrackIdRef.current;
    prevTrackIdRef.current = currentTrack.id;

    const isPlayingStore = usePlayerStore.getState().isPlaying;
    const isCrossfade = settings.isCrossfadeEnabled;
    const durationSec = isAutoSkip ? settings.crossfadeDuration : 2;
    
    // Check if the engine was actually playing previously to avoid crossfading when resuming/unpausing
    // Use prevIsPlayingRef to avoid being tricked by queueSlice's triggerPlay() which calls .play() blindly
    const wasPlayingEngine = prevIsPlayingRef.current;

    if (isPlayingStore && isActiveDevice) {
      const activeDeckIdx = engineRef.current.getActiveDeckIndex();
      const nextDeckIdx = (isCrossfade ? (1 - activeDeckIdx) : activeDeckIdx) as 0 | 1;
      setActiveIndex(nextDeckIdx);
      const targetEl = audioRefs[nextDeckIdx]?.current;
      if (targetEl) setAudioElement(targetEl);

      engineRef.current.playTrack(
        { ...currentTrack, streamUrl: audioSrc },
        {
          startTime: initialPosition > 0 ? initialPosition / 1000 : 0,
          immediate: !isCrossfade || !wasPlayingEngine || didDeviceBecomeActive,
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

      const deck = engineRef.current.getActiveDeck();
      deck.load(audioSrc, initialPosition > 0 ? initialPosition / 1000 : 0).catch(() => {});
      if (initialPosition > 0) setInitialPosition(0);
    }
  }, [currentTrack, srcTrackId, audioSrc, srcLoading, isActiveDevice, audioRefs, setAudioElement, settings.isCrossfadeEnabled, settings.crossfadeDuration, initialPosition, setInitialPosition]);

  // Handle play/pause toggle
  useEffect(() => {
    if (!currentTrack) return;

    if (isPlaying && isActiveDevice) {
      engineRef.current.resume().catch((e) => {
        console.error('Playback resume error:', e);
      });
    } else {
      engineRef.current.pause();
    }
  }, [isPlaying, currentTrack, isActiveDevice]);

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
      // oxlint-disable-next-line
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

    const handleTimeUpdate = (currentTime: number) => {
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
        localStorage.setItem('streamnavi_time', currentTime.toString());
        localStorage.setItem('streamnavi_track', currentTrack.id);

        if (!syncedRef.current && (accumulatedTimeRef.current >= 30 || accumulatedTimeRef.current / currentTrack.duration >= 0.5)) {
          syncedRef.current = true;
          const now = Date.now();
          useHistoryStore.getState().addTrackToHistory(currentTrack, now);
          useHoladStore.getState().sendRemoteCommand('syncHistory', { track: currentTrack, playedAt: now });
        }

        // Auto crossfade trigger
        const actualDur = engine.getDuration() || currentTrack.duration || 0;
        if (settings.isCrossfadeEnabled && actualDur > 0 && currentTrack.id !== crossfadeTriggeredRef.current) {
          const remaining = actualDur - currentTime;
          if (remaining > 0 && remaining <= settings.crossfadeDuration && currentTime > 0) {
            crossfadeTriggeredRef.current = currentTrack.id;
            nextTrack();
          }
        }
      }
    };

    const handleEnded = () => {
      if (role === 'listener') return;
      if (sleepTimer.type === 'track_end') {
        setIsPlaying(false);
        setSleepTimer(null);
        return;
      }

      if (crossfadeTriggeredRef.current === currentTrack?.id) return;
      nextTrack();
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
  }, [currentTrack, isActiveDevice, duration, role, sleepTimer, settings.isCrossfadeEnabled, settings.crossfadeDuration, nextTrack, preloadUpcomingTrack, setDuration, setProgress, setIsPlaying, setSleepTimer]);

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
    let localCurrentTime = (progress / 100) * (currentTrack?.duration || 1);

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
        if (localCurrentTime <= currentTrack.duration) {
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
  }, [isActiveDevice, currentTrack, isHoladConnected, duration, setDuration, progress, setProgress]);

  return {
    progress,
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
