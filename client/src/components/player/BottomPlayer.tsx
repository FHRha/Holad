import { useRef, useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Repeat1, Shuffle, Heart, MoreVertical, VolumeX, Star, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { getStreamUrl, starItem, unstarItem } from '../../api/subsonic';
import Slider from '../common/Slider';
import LiquidSeekBar from '../common/LiquidSeekBar';
import ArtistLinks from '../common/ArtistLinks';
import TrackImage from '../common/TrackImage';
import MobilePlayerUI from './MobilePlayerUI';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useAutoDj } from '../../hooks/useAutoDj';
import { useNavigate } from 'react-router-dom';
import { useContextMenuStore } from '../../store/contextMenuStore';

export default function BottomPlayer() {
  const navigate = useNavigate();
  const { openMenu } = useContextMenuStore();
  const { t } = useTranslation();
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, volume, setVolume, role, isAutoDjEnabled, toggleAutoDj, likedTrackIds, toggleTrackLike, isShuffle, toggleShuffle, repeatMode, cycleRepeatMode, setTrackRating, isMinimized, setIsMinimized, initialPosition, setInitialPosition } = usePlayerStore();
  const { toggleNowPlaying, isNowPlayingOpen } = useUIStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [dragVolume, setDragVolume] = useState<number | null>(null);

  const {
    progress,
    setProgress,
    setIsSeeking,
    handleTimeUpdate,
    handleEnded,
    handleSeekChange,
    handleSeekEnd
  } = useAudioEngine(audioRef);

  const currentTrack = queue[currentIndex];

  useEffect(() => {
    if (initialPosition > 0 && audioRef.current && currentTrack) {
      if (audioRef.current.readyState >= 1) {
        audioRef.current.currentTime = initialPosition / 1000;
        setProgress((initialPosition / 1000 / currentTrack.duration) * 100);
        setInitialPosition(0);
      }
    }
  }, [initialPosition, currentTrack]);

  useAutoDj();

  const handleVolumeDrag = (newVolume: number) => {
    if (audioRef.current) {
      const scaledVolume = newVolume * 0.3;
      audioRef.current.volume = scaledVolume * scaledVolume;
    }
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

  const handlePlayPause = () => {
    if (role === 'listener') return; 
    setIsPlaying(!isPlaying);
  };

  const searchParams = new URLSearchParams(window.location.search);
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isStandalone = isJamRoute && (!!searchParams.get('track') || !!searchParams.get('album'));
  const hideSocialActions = isJamRoute && (role === 'listener' || isStandalone);
  const hideAutoDJ = isJamRoute && isStandalone;

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
            <span onClick={() => navigate(`/Holad/album/${currentTrack.albumId}`)} className="font-bold text-base text-foreground truncate hover:underline cursor-pointer">{currentTrack.title}</span>
            <MoreVertical size={16} className="text-secondary/50 hover:text-foreground cursor-pointer flex-shrink-0" onClick={(e) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, currentTrack, 'track'); }} />
          </div>
          <ArtistLinks artistString={currentTrack.artist} artistId={currentTrack.artistId} className="text-sm font-medium text-secondary truncate mt-0.5" />
          {currentTrack.album && (
            <span onClick={() => navigate(`/Holad/album/${currentTrack.albumId}`)} className="text-sm text-secondary/70 truncate hover:underline cursor-pointer">{currentTrack.album}</span>
          )}
        </div>
      </div>

      {/* Controls (Center) */}
      <div className="flex flex-col items-center justify-center flex-1 max-w-[40%] gap-3 mt-0">
        <div className="flex items-center justify-center gap-4">
          <button 
            onClick={toggleShuffle} 
            disabled={role === 'listener'}
            className={`transition-colors disabled:opacity-50 ${isShuffle ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
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
            disabled={role === 'listener'}
            className={`transition-colors disabled:opacity-50 ${repeatMode !== 'none' ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
          >
            {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
          </button>
        </div>

        <div className="w-full flex items-center gap-3 text-[11px] text-secondary font-medium px-4">
          <span className="min-w-[35px] text-right">{formatTime((progress / 100) * (currentTrack?.duration || 0))}</span>
          <LiquidSeekBar 
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
          <div className="flex items-center gap-4 w-full justify-end">
            {!hideSocialActions && (
              <>
                <button 
                  onClick={handleLike} 
                  disabled={role === 'listener'}
                  className="hover:text-primary transition-colors flex items-center justify-center w-5 disabled:opacity-50"
                >
                  <Heart size={18} fill={likedTrackIds.includes(currentTrack.id) ? "currentColor" : "none"} className={likedTrackIds.includes(currentTrack.id) ? "text-primary" : ""} />
                </button>
                
                {/* Star Rating */}
                <div className={`flex items-center justify-center gap-0.5 flex-1 ${role === 'listener' ? 'pointer-events-none opacity-50' : ''}`} onMouseLeave={() => {}}>
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
              </>
            )}

            {!hideAutoDJ && (
              <button 
                onClick={toggleAutoDj}
                disabled={role === 'listener'}
                className={`text-[10px] font-bold tracking-widest transition-colors w-16 text-right disabled:opacity-50 ${isAutoDjEnabled ? 'text-primary' : 'text-secondary hover:text-white'}`}
              >
                {t('player.auto_dj')}
              </button>
            )}
          </div>

          {/* Bottom row: Expand & Volume */}
          <div className="flex items-center gap-4 w-full">
            {/* Expand Now Playing View or Maximize Jam */}
            {role === 'listener' ? (
              <div className="w-5" /> // Placeholder for alignment
            ) : (isJamRoute && role !== 'host') ? (
              <button 
                onClick={() => setIsMinimized(!isMinimized)}
                className={`transition-colors flex items-center justify-center w-5 ${!isMinimized ? 'text-primary' : 'text-secondary hover:text-white'}`}
                title={isMinimized ? t('player.expand') : t('player.minimize_session')}
              >
                <Maximize2 size={16} />
              </button>
            ) : (
              <button 
                onClick={toggleNowPlaying}
                className={`transition-colors flex items-center justify-center w-5 ${isNowPlayingOpen ? 'text-primary' : 'text-secondary hover:text-white'}`}
                title={t('player.now_playing')}
              >
                <Maximize2 size={16} />
              </button>
            )}
            
            <div className="flex items-center gap-3 flex-1">
              <button onClick={() => setVolume(volume === 0 ? 1 : 0)} className="hover:text-foreground transition-colors">
                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="flex-1">
                <Slider 
                  value={volume} 
                  onDrag={(newVolume) => {
                    setDragVolume(newVolume);
                    handleVolumeDrag(newVolume);
                  }}
                  onDragEnd={(newVolume) => {
                    setDragVolume(null);
                    setVolume(newVolume);
                  }} 
                  thickness="thick" 
                />
              </div>
              <span className="text-xs font-bold w-9 text-right">{Math.round((dragVolume !== null ? dragVolume : volume) * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const MobileMiniPlayer = (
    <div className={`md:hidden fixed bottom-[56px] left-0 right-0 z-40 px-2 pb-2 ${isJamRoute && !isMinimized ? 'hidden' : ''}`}>
      <div 
        className="flex h-14 bg-[#121212]/40 backdrop-blur-xl border border-white/10 rounded-[16px] items-center px-3 gap-3 relative overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        onClick={() => {
          if (isJamRoute) setIsMinimized(false);
          else setIsMobileExpanded(true);
        }}
      >
        <div className="absolute bottom-0 left-4 right-4 h-[2px] overflow-hidden rounded-t-full">
          <div 
            className="absolute bottom-0 left-0 h-full bg-primary z-10 transition-all opacity-80" 
            style={{ width: `${progress}%` }} 
          />
        </div>
      
      <TrackImage 
        src={currentTrack.coverArt} 
        className="w-9 h-9 rounded shadow" 
        alt="" 
      />
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-sm font-bold text-foreground truncate">{currentTrack.title}</p>
        <ArtistLinks artistString={currentTrack.artist} artistId={currentTrack.artistId} className="text-xs text-secondary truncate" />
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
    </div>
  );

  return (
    <>
      <audio
        id="main-audio-player"
        crossOrigin="anonymous"
        ref={audioRef}
        src={currentTrack ? getStreamUrl(currentTrack.id) : ''}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={(e) => {
          const scaledVolume = volume * 0.3;
          const target = e.target as HTMLAudioElement;
          target.volume = scaledVolume * scaledVolume;
          
          if (initialPosition > 0) {
            target.currentTime = initialPosition / 1000;
            setProgress((initialPosition / 1000 / currentTrack.duration) * 100);
            setInitialPosition(0);
          }
        }}
        onSeeking={() => setIsSeeking(true)}
        onSeeked={() => {
          setIsSeeking(false);
          if (audioRef.current && currentTrack) {
            setProgress((audioRef.current.currentTime / currentTrack.duration) * 100);
          }
        }}
        loop={repeatMode === 'one'}
      />
      {DesktopPlayer}
      {!isMobileExpanded && MobileMiniPlayer}
      <div className="md:hidden">
        {isMobileExpanded && !isJamRoute && <MobilePlayerUI onClose={() => setIsMobileExpanded(false)} />}
      </div>
    </>
  );
}

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
