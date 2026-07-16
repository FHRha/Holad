import { useEffect, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue } from '../api/subsonic';
import { useAudioStore } from '../store/audioStore';

export function useAudioEngine(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, volume, role } = usePlayerStore();
  const { setAudioElement } = useAudioStore();
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

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
    // Attempt to resume audio context on interaction, and unblock playback
    const handleInteraction = () => {
      if (audioRef.current) {
        const audioEl = audioRef.current as any;
        if (audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
          audioEl._audioCtx.resume();
        }
        // If it should be playing but browser blocked it, start it now
        if (usePlayerStore.getState().isPlaying && audioRef.current.paused) {
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
      if (isPlaying) {
        audioRef.current.play().then(() => {
          const audioEl = audioRef.current as any;
          if (audioEl && audioEl._audioCtx && audioEl._audioCtx.state === 'suspended') {
            audioEl._audioCtx.resume();
          }
        }).catch(e => {
          console.error("Playback error:", e);
          const isListener = usePlayerStore.getState().role === 'listener';
          // Listeners shouldn't have their state reset, so they can unblock it via click
          if (e.name === 'NotAllowedError' && !isListener) {
            setIsPlaying(false);
          }
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack, setIsPlaying]);

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking && currentTrack) {
      setProgress((audioRef.current.currentTime / currentTrack.duration) * 100);
      
      // Save timing locally for F5 reloads
      localStorage.setItem('streamnavi_time', audioRef.current.currentTime.toString());
      localStorage.setItem('streamnavi_track', currentTrack.id);
    }
  };

  const handleEnded = () => {
    if (role === 'listener') return;
    nextTrack();
  };

  const handleSeekChange = (value: number) => {
    if (role === 'listener') return;
    setIsSeeking(true);
    setProgress(value * 100);
  };

  const handleSeekEnd = (value: number) => {
    if (role === 'listener') return;
    if (audioRef.current && currentTrack) {
      audioRef.current.currentTime = value * currentTrack.duration;
      
      // Save timing locally
      localStorage.setItem('streamnavi_time', audioRef.current.currentTime.toString());
      localStorage.setItem('streamnavi_track', currentTrack.id);
      
      const isJamRoute = window.location.pathname.startsWith('/jam');
      if (!isJamRoute) {
        const trackIds = queue.map(t => t.id);
        const pos = Math.floor(audioRef.current.currentTime * 1000);
        savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
      }
    }
    setIsSeeking(false);
  };

  return {
    progress,
    setProgress,
    isSeeking,
    setIsSeeking,
    handleTimeUpdate,
    handleEnded,
    handleSeekChange,
    handleSeekEnd
  };
}
