import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Repeat1, Shuffle, Heart, ChevronDown, MoreHorizontal, MoreVertical, VolumeX, Star, Maximize2 } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { useAudioStore } from '../../store/audioStore';
import { getStreamUrl, fetchRandomTracks, getCoverArtUrl, starItem, unstarItem, savePlayQueue } from '../../api/subsonic';
import Slider from '../common/Slider';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';



export default function BottomPlayer() {
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, volume, setVolume, role, isAutoDjEnabled, toggleAutoDj, addToQueue, likedTrackIds, toggleTrackLike, initialPosition, setInitialPosition, isShuffle, toggleShuffle, repeatMode, cycleRepeatMode, setTrackRating } = usePlayerStore();
  const { toggleNowPlaying, isNowPlayingOpen } = useUIStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const { setAudioElement } = useAudioStore();

  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      setAudioElement(audioRef.current);
    }
    return () => setAudioElement(null);
  }, [audioRef.current]);

  useEffect(() => {
    if (audioRef.current && currentTrack && initialPosition > 0) {
      audioRef.current.currentTime = initialPosition / 1000;
      setProgress((initialPosition / 1000 / currentTrack.duration) * 100);
      setInitialPosition(0);
    }
  }, [currentTrack, initialPosition, setInitialPosition]);

  useEffect(() => {
    if (role === 'listener' || queue.length === 0 || !currentTrack) return;
    
    const interval = setInterval(() => {
      if (isPlaying && audioRef.current) {
         const trackIds = queue.map(t => t.id);
         const pos = Math.floor(audioRef.current.currentTime * 1000);
         savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [queue, currentTrack, isPlaying, role]);

  useEffect(() => {
    if (audioRef.current) {
      // Use exponential curve for volume (x^2) as human hearing is logarithmic
      audioRef.current.volume = volume * volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current && currentTrack) {
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Auto-play prevented", e));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
  };

  const handleLike = () => {
    if (!currentTrack) return;
    const isLiked = likedTrackIds.includes(currentTrack.id);
    toggleTrackLike(currentTrack.id);
    if (isLiked) {
      unstarItem(currentTrack.id);
    } else {
      starItem(currentTrack.id);
    }
  };

  useEffect(() => {
    const checkAutoDj = async () => {
      if (isAutoDjEnabled && queue.length > 0 && currentIndex >= queue.length - 2) {
        try {
          const newTracks = await fetchRandomTracks(10);
          const mapped = newTracks.map((t: any) => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            coverArt: getCoverArtUrl(t.coverArt, 300),
            duration: t.duration
          }));
          addToQueue(mapped);
        } catch (error) {
          console.error("Auto DJ failed to fetch tracks:", error);
        }
      }
    };
    checkAutoDj();
  }, [currentIndex, isAutoDjEnabled, queue.length]);

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleEnded = () => {
    if (role === 'listener') return;
    nextTrack();
  };

  const handlePlayPause = () => {
    if (role === 'listener') return; 
    setIsPlaying(!isPlaying);
    
    if (isPlaying && audioRef.current && currentTrack) {
      const trackIds = queue.map(t => t.id);
      const pos = Math.floor(audioRef.current.currentTime * 1000);
      savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
    }
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
      
      const trackIds = queue.map(t => t.id);
      const pos = Math.floor(audioRef.current.currentTime * 1000);
      savePlayQueue(trackIds, currentTrack.id, pos).catch(() => {});
    }
    setIsSeeking(false);
  };

  if (!currentTrack) return null;

  const DesktopPlayer = (
    <div className="hidden md:flex h-28 bg-background border-t border-white/5 items-center px-4 justify-between z-20 relative">
      <div className="flex items-center gap-4 w-[30%] min-w-[200px]">
        <div className="w-[92px] h-[92px] rounded-md overflow-hidden relative group shadow-sm flex-shrink-0">
          <TrackImage 
            src={currentTrack.coverArt} 
            alt="Cover" 
            className="w-full h-full object-cover" 
          />
        </div>
        <div className="flex flex-col overflow-hidden leading-tight justify-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-base text-foreground truncate hover:underline cursor-pointer">{currentTrack.title}</span>
            <MoreVertical size={16} className="text-secondary/50 hover:text-foreground cursor-pointer flex-shrink-0" />
          </div>
          <span className="text-sm font-medium text-secondary truncate hover:underline cursor-pointer mt-0.5">{formatArtistName(currentTrack.artist)}</span>
          {currentTrack.album && (
            <span className="text-sm text-secondary/70 truncate hover:underline cursor-pointer">{currentTrack.album}</span>
          )}
        </div>
      </div>

      {/* Controls (Center) */}
      <div className="flex flex-col items-center justify-center flex-1 max-w-[40%] gap-3 mt-0">
        <div className="flex items-center gap-7">
          <button 
            onClick={toggleShuffle} 
            className={`transition-colors ${isShuffle ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
          >
            <Shuffle size={20} />
          </button>
          <button onClick={prevTrack} disabled={role === 'listener'} className="text-secondary hover:text-foreground transition-colors disabled:opacity-50"><SkipBack size={24} fill="currentColor" /></button>
          
          <button 
            onClick={handlePlayPause} 
            disabled={role === 'listener'}
            className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 transition-colors disabled:opacity-50 shadow-md"
          >
            {isPlaying ? <Pause fill="currentColor" size={20} className="stroke-none" /> : <Play fill="currentColor" size={20} className="stroke-none translate-x-[2px]" />}
          </button>
          
          <button onClick={nextTrack} disabled={role === 'listener'} className="text-secondary hover:text-foreground transition-colors disabled:opacity-50"><SkipForward size={24} fill="currentColor" /></button>
          <button 
            onClick={cycleRepeatMode} 
            className={`transition-colors ${repeatMode !== 'none' ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
          >
            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        <div className="w-full flex items-center gap-3 text-[11px] text-secondary font-medium px-4">
          <span className="min-w-[35px] text-right">{formatTime((progress / 100) * (currentTrack?.duration || 0))}</span>
          <Slider 
            value={progress / 100} 
            onChange={handleSeekChange} 
            onDragEnd={handleSeekEnd} 
            className={`flex-1 ${role === 'listener' ? 'pointer-events-none' : ''}`}
            isAnimated={isPlaying}
          />
          <span className="min-w-[35px] text-left">{formatTime(currentTrack.duration)}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex flex-col justify-center items-end w-[30%] min-w-[200px] text-secondary pr-2">
        <div className="flex flex-col gap-3 w-[240px]">
          {/* Top row: Favorite, Stars, Auto DJ */}
          <div className="flex items-center gap-4 w-full">
            <button 
              onClick={handleLike} 
              className="hover:text-primary transition-colors flex items-center justify-center w-5"
            >
              <Heart size={18} fill={likedTrackIds.includes(currentTrack.id) ? "currentColor" : "none"} className={likedTrackIds.includes(currentTrack.id) ? "text-primary" : ""} />
            </button>
            
            {/* Star Rating */}
            <div className="flex items-center justify-center gap-0.5 flex-1" onMouseLeave={() => {}}>
              {[1, 2, 3, 4, 5].map(star => {
                const currentRating = currentTrack.userRating || 0;
                const isFilled = star <= currentRating;
                return (
                  <button 
                    key={star} 
                    className={`transition-colors ${isFilled ? 'text-primary' : 'text-white/20 hover:text-white/60'}`}
                    onClick={() => {
                      const newRating = currentRating === star ? 0 : star;
                      setTrackRating(currentTrack.id, newRating);
                    }}
                  >
                    <Star size={16} fill={isFilled ? "currentColor" : "none"} />
                  </button>
                );
              })}
            </div>

            <button 
              onClick={toggleAutoDj}
              className={`text-xs font-bold tracking-wider transition-colors ${isAutoDjEnabled ? 'text-primary' : 'text-secondary hover:text-white'}`}
            >
              АВТО DJ
            </button>
          </div>

          {/* Bottom row: Expand & Volume */}
          <div className="flex items-center gap-4 w-full">
            {/* Expand Now Playing View */}
            <button 
              onClick={toggleNowPlaying}
              className={`transition-colors flex items-center justify-center w-5 ${isNowPlayingOpen ? 'text-primary' : 'text-secondary hover:text-white'}`}
              title="Сейчас играет"
            >
              <Maximize2 size={16} />
            </button>
            
            <div className="flex items-center gap-3 flex-1">
              <button onClick={() => setVolume(volume === 0 ? 1 : 0)} className="hover:text-foreground transition-colors">
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="flex-1">
                <Slider value={volume} onChange={handleVolumeChange} thickness="thick" />
              </div>
              <span className="text-xs font-bold w-9 text-right">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const MobileMiniPlayer = (
    <div 
      className="md:hidden flex h-14 bg-card mx-2 mb-1 rounded-lg items-center px-3 gap-3 relative z-40 overflow-hidden shadow-lg border border-white/5"
      onClick={() => setIsMobileExpanded(true)}
    >
      <div 
        className="absolute bottom-0 left-0 h-[2px] bg-primary z-10 transition-all" 
        style={{ width: `${progress}%` }} 
      />
      
      <TrackImage 
        src={currentTrack.coverArt} 
        className="w-9 h-9 rounded shadow" 
        alt="" 
      />
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-sm font-bold text-foreground truncate">{currentTrack.title}</p>
        <p className="text-xs text-secondary truncate">{formatArtistName(currentTrack.artist)}</p>
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
        className="w-8 h-8 flex items-center justify-center text-foreground hover:text-primary transition-colors"
      >
        {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} className="ml-1" />}
      </button>
      
      <button 
        onClick={(e) => { e.stopPropagation(); nextTrack(); }}
        className="w-8 h-8 flex items-center justify-center text-foreground hover:text-primary transition-colors"
      >
        <SkipForward fill="currentColor" size={20} />
      </button>
    </div>
  );

  const MobileFullScreenPlayer = (
    <div className={`fixed inset-0 z-[100] bg-background flex flex-col transition-transform duration-300 ${isMobileExpanded ? 'translate-y-0' : 'translate-y-full'}`}>
      {/* Blurred background for mobile player */}
      <div 
        className="absolute inset-0 bg-cover bg-center blur-[80px] opacity-30 scale-125 pointer-events-none"
        style={{ backgroundImage: `url(${currentTrack.coverArt})` }}
      />
      
      <div className="relative z-10 flex flex-col h-full p-6">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setIsMobileExpanded(false)} className="text-white/80 p-2 -ml-2">
            <ChevronDown size={28} />
          </button>
          <span className="text-xs font-bold tracking-widest text-secondary uppercase">Играет</span>
          <button className="text-white/80 p-2 -mr-2">
            <MoreHorizontal size={24} />
          </button>
        </div>

        <div className="w-full aspect-square bg-muted rounded-xl shadow-2xl overflow-hidden mb-8">
          <TrackImage src={currentTrack.coverArt} className="w-full h-full object-cover" alt="" />
        </div>

        <div className="flex justify-between items-end mb-6">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-2xl font-bold text-white truncate mb-1">{currentTrack.title}</h2>
            <p className="text-lg text-white/70 truncate">{formatArtistName(currentTrack.artist)}</p>
          </div>
          <button onClick={handleLike} className="hover:scale-110 transition-transform">
            <Heart size={28} className={likedTrackIds.includes(currentTrack.id) ? "text-primary" : "text-white/70"} fill={likedTrackIds.includes(currentTrack.id) ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Timeline */}
        <div className="mb-8">
          <Slider 
            value={progress / 100} 
            onChange={handleSeekChange} 
            onDragEnd={handleSeekEnd} 
            className={role === 'listener' ? 'pointer-events-none mb-2' : 'mb-2'}
          />
          <div className="flex justify-between text-xs text-white/50 font-medium">
            <span>{formatTime((progress / 100) * (currentTrack?.duration || 0))}</span>
            <span>{formatTime(currentTrack.duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-8">
          <button className="text-white/70 hover:text-white transition-colors">
            <Shuffle size={24} />
          </button>
          <button onClick={prevTrack} className="text-white hover:text-primary transition-colors">
            <SkipBack fill="currentColor" size={32} />
          </button>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause fill="currentColor" size={32} /> : <Play fill="currentColor" size={36} className="ml-2" />}
          </button>
          <button onClick={nextTrack} className="text-white hover:text-primary transition-colors">
            <SkipForward fill="currentColor" size={32} />
          </button>
          <button className="text-white/70 hover:text-white transition-colors">
            <Repeat size={24} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        src={currentTrack ? getStreamUrl(currentTrack.id) : ''}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onSeeking={() => setIsSeeking(true)}
        onSeeked={() => setIsSeeking(false)}
        loop={repeatMode === 'one'}
      />
      {DesktopPlayer}
      {!isMobileExpanded && MobileMiniPlayer}
      {MobileFullScreenPlayer}
    </>
  );
}

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
