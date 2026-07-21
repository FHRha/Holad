import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue } from '../api/subsonic';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useHistoryStore } from '../store/historyStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTrackSource } from './useTrackSource';
import { isTauri, isCapacitor } from '../utils/StorageManager';

export function useAudioEngine(audioRefs: [React.RefObject<HTMLAudioElement | null>, React.RefObject<HTMLAudioElement | null>], currentTrack: any) {
  const { queue, isPlaying, setIsPlaying, nextTrack, volume, mobileVolume, volumeMultiplier, role, playbackRate, sleepTimer, setSleepTimer, initialPosition, setInitialPosition, repeatMode } = usePlayerStore();
  const { setAudioElement, progress, setProgress, duration, setDuration, isSeeking, setIsSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();

  const holadDeviceId = useHoladStore(s => s.deviceId);
  const holadActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const isHoladConnected = useHoladStore(s => s.roomId !== null);
  const isActiveDevice = !isHoladConnected || holadActiveDeviceId === holadDeviceId || holadActiveDeviceId === null;

  const { src: audioSrc, trackId: srcTrackId, isLoading: srcLoading } = useTrackSource(currentTrack);

  const [activeIndex, setActiveIndex] = useState(0);
  const fadeState = useRef({ isFading: false, fadeOutRef: null as HTMLAudioElement | null, fadeInRef: null as HTMLAudioElement | null, interval: null as any });
  const activeRef = audioRefs[activeIndex].current;

  // Track initial position setting
  useEffect(() => {
    if (initialPosition > 0 && activeRef && currentTrack) {
      if (activeRef.readyState >= 1) {
        activeRef.currentTime = initialPosition / 1000;
        setProgress((initialPosition / 1000 / (currentTrack.duration || 1)) * 100);
        setInitialPosition(0);
      } else {
        const onLoaded = () => {
          activeRef.currentTime = initialPosition / 1000;
          setProgress((initialPosition / 1000 / (currentTrack.duration || 1)) * 100);
          setInitialPosition(0);
        };
        activeRef.addEventListener('loadedmetadata', onLoaded, { once: true });
        return () => activeRef.removeEventListener('loadedmetadata', onLoaded);
      }
    }
  }, [initialPosition, currentTrack, activeRef]);

  const getScaledVolume = () => {
     const volSetting = usePlayerStore.getState().volume;
     const isMobile = !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
     const activeVolume = isMobile ? usePlayerStore.getState().mobileVolume : volSetting;
     const scaledVolume = activeVolume * 0.3 * (usePlayerStore.getState().volumeMultiplier || 1.0);
     return Math.min(1, Math.max(0, scaledVolume * scaledVolume));
  }

  // Crossfade trigger
  const prevTrackIdRef = useRef<string | null>(null);
  const crossfadeTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentTrack || srcLoading || !audioSrc || srcTrackId !== currentTrack.id) return;
    if (prevTrackIdRef.current === currentTrack.id) return;
    
    const isAutoSkip = crossfadeTriggeredRef.current === prevTrackIdRef.current;
    prevTrackIdRef.current = currentTrack.id;

    const { isCrossfadeEnabled, crossfadeDuration } = useSettingsStore.getState();
    const isPlayingStore = usePlayerStore.getState().isPlaying;
    
    if (!isCrossfadeEnabled || !isPlayingStore || !activeRef) {
       // Normal play
       if (activeRef) {
          activeRef.src = audioSrc;
          if (isPlayingStore && isActiveDevice) activeRef.play().catch(()=>{});
       }
       return;
    }

    // Crossfade Logic
    const oldIndex = activeIndex;
    const newIndex = 1 - activeIndex;
    const oldRef = audioRefs[oldIndex].current;
    const newRef = audioRefs[newIndex].current;

    setActiveIndex(newIndex);
    setAudioElement(newRef);
    
    if (newRef && oldRef) {
       newRef.src = audioSrc;
       newRef.volume = 0; // start at 0
       if (isActiveDevice) newRef.play().catch(()=>{});

       if (fadeState.current.interval) clearInterval(fadeState.current.interval);
       
       fadeState.current = {
          isFading: true,
          fadeOutRef: oldRef,
          fadeInRef: newRef,
          interval: null
       };

       const actualFadeDuration = isAutoSkip ? crossfadeDuration : 2;
       const stepDuration = 50;
       const totalSteps = (actualFadeDuration * 1000) / stepDuration;
       let currentStep = 0;

       fadeState.current.interval = setInterval(() => {
           currentStep++;
           const progress = Math.min(1, currentStep / totalSteps);
           const targetVol = getScaledVolume();

           if (fadeState.current.fadeOutRef) fadeState.current.fadeOutRef.volume = targetVol * (1 - progress);
           if (fadeState.current.fadeInRef) fadeState.current.fadeInRef.volume = targetVol * progress;

           if (progress >= 1) {
               clearInterval(fadeState.current.interval!);
               fadeState.current.isFading = false;
               if (fadeState.current.fadeOutRef) {
                   fadeState.current.fadeOutRef.pause();
                   fadeState.current.fadeOutRef.src = '';
               }
           }
       }, stepDuration);
    }
  }, [currentTrack?.id, audioSrc, srcLoading, isActiveDevice]);


  useEffect(() => {
    if (activeRef) {
      if (!fadeState.current.isFading) {
        activeRef.volume = getScaledVolume();
      }
      setAudioElement(activeRef);
      
      const audioEl = activeRef as any;
      if (!audioEl._audioCtx) {
        try {
          const ctx = (window as any)._globalAudioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
          audioEl._audioCtx = ctx;
          if (!(window as any)._globalAudioContext) {
            (window as any)._globalAudioContext = ctx;
          }
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          audioEl._analyser = analyser;
          
          const source = ctx.createMediaElementSource(activeRef);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          audioEl._source = source;
        } catch (e) {
          console.error("Failed to pre-initialize audio context:", e);
        }
      }
    }
  }, [volume, mobileVolume, volumeMultiplier, activeRef, setAudioElement]);

  useEffect(() => {
    if (activeRef) {
      activeRef.playbackRate = playbackRate;
    }
  }, [playbackRate, activeRef]);

  useEffect(() => {
    if (activeRef) {
      activeRef.loop = (repeatMode === 'one');
    }
  }, [repeatMode, activeRef]);

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

  // Unlock audio context
  useEffect(() => {
    const handleInteraction = () => {
      audioRefs.forEach(ref => {
        if (ref.current) {
          const audioEl = ref.current as any;
          if (audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
            audioEl._audioCtx.resume();
          }
          if (!audioEl.dataset.unlocked) {
            if (!audioEl.src || audioEl.src === window.location.href) {
              audioEl.load();
            } else if (audioEl.paused && ref.current === activeRef) {
              const p = audioEl.play();
              if (p !== undefined) p.catch(() => {});
              if (!usePlayerStore.getState().isPlaying) {
                  audioEl.pause();
              }
            }
            audioEl.dataset.unlocked = "true";
          }
        }
      });
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction, { passive: true });
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, [audioRefs, activeRef]);

  // Save history state
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const isJamUrl = window.location.pathname.startsWith('/jam');
    const saveState = () => {
      if (activeRef && currentTrack) {
        const trackIds = queue.map(t => t.id);
        const pos = Math.floor(activeRef.currentTime * 1000);
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
  }, [queue, currentTrack, isPlaying, role, activeRef]);

  // Handle play/pause toggle
  useEffect(() => {
    if (activeRef && currentTrack) {
      if (isPlaying && isActiveDevice) {
        activeRef.play().then(() => {
          const audioEl = activeRef as any;
          if (audioEl && audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
            audioEl._audioCtx.resume();
          }
        }).catch(e => {
          console.error("Playback error:", e);
        });
      } else {
        activeRef.pause();
        
        // Abort crossfade if paused during fade
        if (fadeState.current.isFading) {
          if (fadeState.current.interval) clearInterval(fadeState.current.interval);
          fadeState.current.isFading = false;
          if (fadeState.current.fadeOutRef) {
            fadeState.current.fadeOutRef.pause();
            fadeState.current.fadeOutRef.src = '';
          }
          if (fadeState.current.fadeInRef) {
            fadeState.current.fadeInRef.volume = getScaledVolume();
          }
        }
      }
    }
  }, [isPlaying, currentTrack, isActiveDevice, activeRef]);


  const accumulatedTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const trackIdRef = useRef<string | null>(null);
  const syncedRef = useRef<boolean>(false);
  const isSeekingRef = useRef(isSeeking);
  useEffect(() => { isSeekingRef.current = isSeeking; }, [isSeeking]);

  useEffect(() => {
    const el = activeRef;
    if (!el) return;
    
    const handleTimeUpdate = () => {
      if (!isSeekingRef.current && currentTrack && isActiveDevice) {
        if (trackIdRef.current !== currentTrack.id) {
          trackIdRef.current = currentTrack.id;
          accumulatedTimeRef.current = 0;
          lastTimeRef.current = el.currentTime;
          syncedRef.current = false;
        }

        const delta = Math.abs(el.currentTime - lastTimeRef.current);
        if (delta > 0 && delta < 1) {
          accumulatedTimeRef.current += delta;
        }
        lastTimeRef.current = el.currentTime;

        const actualDuration = el.duration && !isNaN(el.duration) ? el.duration : (currentTrack.duration || 1);
        if (duration !== actualDuration) setDuration(actualDuration);

        const pct = (el.currentTime / actualDuration) * 100;
        setProgress(pct);
        localStorage.setItem('streamnavi_time', el.currentTime.toString());
        localStorage.setItem('streamnavi_track', currentTrack.id);

        if (!syncedRef.current && (accumulatedTimeRef.current >= 30 || (accumulatedTimeRef.current / currentTrack.duration) >= 0.5)) {
          syncedRef.current = true;
          const now = Date.now();
          useHistoryStore.getState().addTrackToHistory(currentTrack, now);
          useHoladStore.getState().sendRemoteCommand('syncHistory', { track: currentTrack, playedAt: now });
        }
        
        // Auto crossfade trigger
        const { isCrossfadeEnabled, crossfadeDuration } = useSettingsStore.getState();
        if (isCrossfadeEnabled && !fadeState.current.isFading && el.duration && currentTrack.id !== crossfadeTriggeredRef.current) {
            const remaining = el.duration - el.currentTime;
            if (remaining > 0 && remaining <= crossfadeDuration) {
                // Ensure we only trigger once per track
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
      
      // If crossfade triggered this track to skip already, dont do it again on ended
      if (crossfadeTriggeredRef.current === currentTrack?.id) return;
      
      nextTrack();
    };

    const handleSeeking = () => setIsSeeking(true);
    const handleSeeked = () => {
       setIsSeeking(false);
       if (currentTrack) {
          setProgress((el.currentTime / (duration || 1)) * 100);
       }
    };

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('ended', handleEnded);
    el.addEventListener('seeking', handleSeeking);
    el.addEventListener('seeked', handleSeeked);
    
    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('seeking', handleSeeking);
      el.removeEventListener('seeked', handleSeeked);
    };
  }, [activeRef, currentTrack, isActiveDevice, duration, role, sleepTimer]);


  // Holad Syncing
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && isActiveDevice && isHoladConnected) {
       interval = setInterval(() => {
          if (activeRef) {
             const roomId = useHoladStore.getState().roomId;
             if (roomId) {
               useHoladStore.getState().socket?.emit('holad_syncTime', { roomId, currentTime: activeRef.currentTime });
             }
          }
       }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isActiveDevice, isHoladConnected, activeRef]);

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
  }, [isActiveDevice, currentTrack, isHoladConnected, duration, setDuration, progress]);

  return {
    progress,
    setProgress,
    duration,
    setDuration,
    isSeeking,
    setIsSeeking,
    handleSeekChange,
    handleSeekEnd
  };
}
