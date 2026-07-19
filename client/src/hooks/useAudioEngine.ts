import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue } from '../api/subsonic';
import { useAudioStore } from '../store/audioStore';
import { useHoladStore } from '../store/holadStore';
import { useHistoryStore } from '../store/historyStore';

export function useAudioEngine(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, volume, role, playbackRate, sleepTimer, setSleepTimer } = usePlayerStore();
  const { setAudioElement, progress, setProgress, duration, setDuration, isSeeking, setIsSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();

  const holadDeviceId = useHoladStore(s => s.deviceId);
  const holadActiveDeviceId = useHoladStore(s => s.activeDeviceId);
  const isHoladConnected = useHoladStore(s => s.roomId !== null);
  const isActiveDevice = !isHoladConnected || holadActiveDeviceId === holadDeviceId || holadActiveDeviceId === null;

  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (audioRef.current) {
      if (volume !== undefined && !isNaN(volume)) {
        // Scale volume so that 100% on the UI equals 30% actual volume
        // and use exponential curve (x^2) for natural hearing response
        const scaledVolume = volume * 0.3;
        audioRef.current.volume = scaledVolume * scaledVolume;
      }
      setAudioElement(audioRef.current);
      
      // Initialize AudioContext early to prevent stuttering when switching to visualizer
      const audioEl = audioRef.current as any;
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
          
          const source = ctx.createMediaElementSource(audioRef.current);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          audioEl._source = source;
        } catch (e) {
          console.error("Failed to pre-initialize audio context:", e);
        }
      }
    }
    return () => setAudioElement(null);
  }, [volume, setAudioElement, audioRef.current]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioRef.current]);

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
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sleepTimer, isPlaying, setIsPlaying, setSleepTimer]);

  useEffect(() => {
    // Attempt to resume audio context on interaction, and unblock playback
    const handleInteraction = () => {
      if (audioRef.current) {
        const audioEl = audioRef.current as any;
        if (audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
          audioEl._audioCtx.resume();
        }
        // If it should be playing but browser blocked it, start it now
        const store = useHoladStore.getState();
        const isDeviceActive = store.roomId === null || store.activeDeviceId === store.deviceId || store.activeDeviceId === null;
        if (usePlayerStore.getState().isPlaying && audioRef.current.paused && isDeviceActive) {
          audioRef.current.play().catch(e => console.error("Playback still prevented:", e));
        }
      }
    };
    // Listen to every click so users can always "fix" blocked audio by clicking anywhere
    document.addEventListener('click', handleInteraction);
    return () => document.removeEventListener('click', handleInteraction);
  }, [audioRef]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const isJamUrl = window.location.pathname.startsWith('/jam');
    
    const saveState = () => {
      if (audioRef.current && currentTrack) {
        const trackIds = queue.map(t => t.id);
        const pos = Math.floor(audioRef.current.currentTime * 1000);
        savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
      }
    };
    
    if (currentTrack && role !== 'listener' && !isJamUrl) {
      // Save state immediately on track/queue/play state changes
      saveState();
      
      if (isPlaying) {
        interval = setInterval(saveState, 2000);
      }
    }
    return () => clearInterval(interval);
  }, [queue, currentTrack, isPlaying, role]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      if (isPlaying && isActiveDevice) {
        audioRef.current.play().then(() => {
          const audioEl = audioRef.current as any;
          if (audioEl && audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
            audioEl._audioCtx.resume();
          }
        }).catch(e => {
          console.error("Playback error:", e);
          const isListener = usePlayerStore.getState().role === 'listener';
          if (e.name === 'NotAllowedError' && !isListener) {
            setIsPlaying(false);
          }
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack, setIsPlaying, isActiveDevice]);

  const accumulatedTimeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const trackIdRef = useRef<string | null>(null);
  const syncedRef = useRef<boolean>(false);

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking && currentTrack) {
      if (isActiveDevice) {
        if (trackIdRef.current !== currentTrack.id) {
          trackIdRef.current = currentTrack.id;
          accumulatedTimeRef.current = 0;
          lastTimeRef.current = audioRef.current.currentTime;
          syncedRef.current = false;
        }

        const delta = Math.abs(audioRef.current.currentTime - lastTimeRef.current);
        if (delta > 0 && delta < 1) {
          accumulatedTimeRef.current += delta;
        }
        lastTimeRef.current = audioRef.current.currentTime;

        const actualDuration = audioRef.current.duration && !isNaN(audioRef.current.duration) ? audioRef.current.duration : (currentTrack.duration || 1);
        if (duration !== actualDuration) setDuration(actualDuration);

        const pct = (audioRef.current.currentTime / actualDuration) * 100;
        setProgress(pct);
        localStorage.setItem('streamnavi_time', audioRef.current.currentTime.toString());
        localStorage.setItem('streamnavi_track', currentTrack.id);

        if (!syncedRef.current && (accumulatedTimeRef.current >= 30 || (accumulatedTimeRef.current / currentTrack.duration) >= 0.5)) {
          syncedRef.current = true;
          const now = Date.now();
          useHistoryStore.getState().addTrackToHistory(currentTrack, now);
          useHoladStore.getState().sendRemoteCommand('syncHistory', { track: currentTrack, playedAt: now });
        }
      }
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && isActiveDevice && isHoladConnected) {
       interval = setInterval(() => {
          if (audioRef.current) {
             const roomId = useHoladStore.getState().roomId;
             if (roomId) {
               useHoladStore.getState().socket?.emit('holad_syncTime', { roomId, currentTime: audioRef.current.currentTime });
             }
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
  }, [isActiveDevice, currentTrack, isHoladConnected]);

  const handleEnded = () => {
    if (role === 'listener') return;
    
    if (sleepTimer.type === 'track_end') {
      setIsPlaying(false);
      setSleepTimer(null);
      return;
    }

    nextTrack();
  };


  return {
    progress,
    setProgress,
    duration,
    setDuration,
    isSeeking,
    setIsSeeking,
    handleTimeUpdate,
    handleEnded,
    handleSeekChange,
    handleSeekEnd
  };
}
