import { useEffect, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { savePlayQueue } from '../api/subsonic';
import { useAudioStore } from '../store/audioStore';

export function useAudioEngine(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, volume, initialPosition, setInitialPosition, role } = usePlayerStore();
  const { setAudioElement } = useAudioStore();
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (audioRef.current) {
      // Use exponential curve for volume (x^2) as human hearing is logarithmic
      audioRef.current.volume = volume * volume;
      setAudioElement(audioRef.current);
      
      // Initialize AudioContext early to prevent stuttering when switching to visualizer
      const audioEl = audioRef.current as any;
      if (!audioEl._audioCtx) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioEl._audioCtx = ctx;
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
  }, [volume, setAudioElement]);

  useEffect(() => {
    if (audioRef.current && currentTrack && initialPosition > 0) {
      audioRef.current.currentTime = initialPosition / 1000;
      setProgress((initialPosition / 1000 / currentTrack.duration) * 100);
      setInitialPosition(0);
    }
  }, [currentTrack, initialPosition, setInitialPosition]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const isJamUrl = window.location.pathname.startsWith('/jam');
    
    if (isPlaying && currentTrack && role !== 'listener' && !isJamUrl) {
      interval = setInterval(() => {
        if (audioRef.current) {
          const trackIds = queue.map(t => t.id);
          const pos = Math.floor(audioRef.current.currentTime * 1000);
          savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
        }
      }, 10000);
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
          if (e.name === 'NotAllowedError') {
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
