import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, Repeat1, Shuffle, Heart, MoreVertical, VolumeX, Star, Maximize2, Monitor, Smartphone, Tv2, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { starItem, unstarItem } from '../../api/subsonic';
import VolumeSlider from '../common/VolumeSlider';
import ArtistLinks from '../common/ArtistLinks';
import TrackImage from '../common/TrackImage';
import { getCoverArtUrl } from '../../api/subsonic';
import MobilePlayerUI from './MobilePlayerUI';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useAutoDj } from '../../hooks/useAutoDj';
import { useMediaSession } from '../../hooks/useMediaSession';
import { useNavigate } from 'react-router-dom';

import { useContextMenuStore } from '../../store/contextMenuStore';
import HoladConnectMenu from './HoladConnectMenu';
import { useHoladStore } from '../../store/holadStore';
import { useAudioStore } from '../../store/audioStore';
import { useBookmark } from '../../hooks/useBookmark';
import { Bookmark } from 'lucide-react';
import PlayerProgressControl from './PlayerProgressControl';
import { isTrackExcluded } from '../../utils/trackFingerprint';
import { getBasePath, isJamPath } from '../../utils/basePath';

const MiniProgressBar = React.memo(function MiniProgressBar() {
  const progress = useAudioStore(s => s.progress);
  const buffered = useAudioStore(s => s.buffered);
  return (
    <div className="absolute bottom-0 left-4 right-4 h-[2px] overflow-hidden rounded-t-full">
      {buffered > 0 && (
        <div 
          className="absolute bottom-0 left-0 h-full bg-white/40 z-0 transition-all duration-300 pointer-events-none" 
          style={{ width: `${buffered}%` }} 
        />
      )}
      <div 
        className="absolute bottom-0 left-0 h-full bg-primary z-10 transition-all opacity-80" 
        style={{ width: `${progress}%` }} 
      />
    </div>
  );
});

export default function BottomPlayer() {
  const navigate = useNavigate();
  const { openMenu } = useContextMenuStore();
  const { t } = useTranslation();
  const { queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, volume, setVolume, role, isAutoDjEnabled, toggleAutoDj, likedTrackIds, toggleTrackLike, excludedTrackIds, excludedAlbumIds, excludedFingerprints, toggleTrackExclude, isShuffle, toggleShuffle, repeatMode, cycleRepeatMode, setTrackRating, isMinimized, setIsMinimized } = usePlayerStore();
  const { toggleNowPlaying, isNowPlayingOpen } = useUIStore();
  const audioRef0 = useRef<HTMLAudioElement>(null);
  const audioRef1 = useRef<HTMLAudioElement>(null);
  const audioRefs = useMemo(() => [audioRef0, audioRef1] as [React.RefObject<HTMLAudioElement | null>, React.RefObject<HTMLAudioElement | null>], []);

  useAudioEngine(audioRefs, queue[currentIndex]);

  useMediaSession();

  const currentTrack = queue[currentIndex];

  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const percentTextRef = useRef<HTMLSpanElement>(null);
  const lastNonZeroVolumeRef = useRef<number>(volume > 0 ? volume : 0.5);

  useEffect(() => {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
    }
  }, [volume]);

  const handleToggleMute = () => {
    if (volume > 0) {
      lastNonZeroVolumeRef.current = volume;
      setVolume(0);
    } else {
      const target = lastNonZeroVolumeRef.current > 0 ? lastNonZeroVolumeRef.current : 0.5;
      setVolume(target);
    }
  };

  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  const devices = useHoladStore(s => s.devices);
  const isConnected = useHoladStore(s => s.roomId !== null);
  const isActiveDevice = !isConnected || activeDeviceId === localDeviceId || activeDeviceId === null;
  const activeDeviceObj = devices.find(d => d.id === activeDeviceId);

  useAutoDj();

  const { isBookmarked, toggleBookmark: handleBookmark } = useBookmark(currentTrack?.id);

  const handleVolumeDrag = (newVolume: number) => {
    // Volume logic is now handled in useAudioEngine, we just update the store
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

  const handlePlayPause = () => {
    if (role === 'listener') return; 
    
    setIsPlaying(!isPlaying);
  };

  const searchParams = new URLSearchParams(window.location.search);
  const isJamRoute = isJamPath();
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const base = getBasePath();
  const normPath = base && window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname;
  const isStandalonePath = normPath.startsWith('/jam/track/') ||
                           normPath.startsWith('/jam/album/') ||
                           normPath.startsWith('/jam/playlist/');
  const isStandalone = isJamRoute && (isStandaloneQuery || isStandalonePath);
  const hideSocialActions = isJamRoute && role !== 'host';
  const hideAutoDJ = isJamRoute && isStandalone;

  if (!currentTrack) return null;

  const getDeviceIcon = (name: string, size = 10, className = "") => {
    const n = name.toLowerCase();
    if (n.includes('mobile') || n.includes('iphone') || n.includes('android')) return <Smartphone size={size} className={className} />;
    if (n.includes('tv')) return <Tv2 size={size} className={className} />;
    return <Monitor size={size} className={className} />;
  };

  const DesktopPlayer = (
    <div className="hidden md:flex h-28 bg-background border-t border-white/5 items-center px-4 justify-between z-20 relative">
      <div className="flex items-center gap-4 flex-1 min-w-0 max-w-[30%] md:min-w-[180px] lg:min-w-[250px]">
        <div className="w-[92px] h-[92px] rounded-md overflow-hidden relative group shadow-sm flex-shrink-0">
          <TrackImage 
            src={getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 120)} 
            trackId={currentTrack.id}
            alt="Cover" 
            className="w-full h-full object-cover" 
          />
        </div>
        <div className="flex flex-col leading-tight justify-center gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 w-full">
            <span onClick={() => navigate(`/album/${currentTrack.albumId}`)} className="font-bold text-base text-foreground truncate hover:underline cursor-pointer">{currentTrack.title}</span>
            <MoreVertical size={16} className="text-[#808080] hover:text-foreground cursor-pointer flex-shrink-0" onClick={(e) => { e.stopPropagation(); openMenu(e.clientX, e.clientY, currentTrack, 'track'); }} />
          </div>
          <ArtistLinks artistString={currentTrack.artist} artistId={currentTrack.artistId} className="text-sm font-medium text-secondary truncate mt-0.5" />
          {currentTrack.album && (
            <span onClick={() => navigate(`/album/${currentTrack.albumId}`)} className="text-sm text-secondary/70 truncate hover:underline cursor-pointer mt-0.5">{currentTrack.album}</span>
          )}
          {!isActiveDevice && activeDeviceObj && (
            <div className="relative shrink-0 mt-1 max-w-full w-fit">
              <div className={`absolute -inset-0.5 bg-gradient-to-r from-primary/70 to-primary/20 rounded-full blur-[6px] opacity-60 transition duration-1000 ${isPlaying ? 'animate-pulse' : 'opacity-20'}`}></div>
              <div className="text-[11px] font-medium text-white/90 bg-[#121212]/60 backdrop-blur-[20px] backdrop-saturate-[150%] px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/10 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)] w-fit max-w-full cursor-default overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                {getDeviceIcon(activeDeviceObj.name, 12, "flex-shrink-0 text-primary z-10")}
                <span className="truncate max-w-[120px] md:max-w-[200px] z-10 drop-shadow-sm">
                  {t('player.playing_on')} <span className="font-bold text-white">{activeDeviceObj.name}</span>
                </span>
                <div className="relative flex items-center justify-center w-2.5 h-2.5 ml-1 z-10 flex-shrink-0">
                  {isPlaying && <div className="absolute inset-0 bg-primary/80 rounded-full animate-ping"></div>}
                  <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary-rgb),0.8)]' : 'bg-primary/40'}`}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls (Center) */}
      <div className="flex flex-col items-center justify-center flex-[1.5] lg:flex-[2] min-w-[200px] gap-3 mt-0 mx-2">
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

        <PlayerProgressControl isPlaying={isPlaying} role={role} />
      </div>

      <div className="flex items-center gap-3 lg:gap-4 justify-end flex-1 min-w-0 max-w-[36%] md:min-w-[180px] lg:min-w-[380px] text-secondary pr-2">
        {/* Left Block: Single Action Icons (2 Rows) */}
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          {/* Top Row: Like (Избранное), Bookmark (Отложенное), Ban (Игнор) */}
          <div className="flex items-center gap-1 justify-end h-7">
            {!hideSocialActions && (
              <>
                {/* Like (Избранное) */}
                <button 
                  onClick={handleLike} 
                  disabled={role === 'listener'}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-foreground/5 disabled:opacity-50 text-secondary hover:text-foreground"
                  title={currentTrack && likedTrackIds.includes(currentTrack.id) ? t('player.tooltip_like_remove') : t('player.tooltip_like_add')}
                >
                  <Heart size={16} fill={currentTrack && likedTrackIds.includes(currentTrack.id) ? "currentColor" : "none"} className={currentTrack && likedTrackIds.includes(currentTrack.id) ? "text-primary" : ""} />
                </button>

                {/* Bookmark (Отложенное) */}
                <button 
                  onClick={handleBookmark} 
                  disabled={role === 'listener'}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-foreground/5 disabled:opacity-50 ${isBookmarked ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
                  title={isBookmarked ? t('player.tooltip_bookmark_remove') : t('player.tooltip_bookmark_add')}
                >
                  <Bookmark size={16} fill={isBookmarked ? "currentColor" : "none"} />
                </button>

                {/* Ban (Игнор / Не рекомендовать) */}
                <button 
                  onClick={() => currentTrack && toggleTrackExclude(currentTrack.id, currentTrack)} 
                  disabled={role === 'listener'}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-foreground/5 disabled:opacity-50 text-secondary hover:text-foreground"
                  title={currentTrack && isTrackExcluded(currentTrack, excludedTrackIds, excludedAlbumIds, excludedFingerprints) ? t('player.tooltip_exclude_remove') : t('player.tooltip_exclude_add')}
                >
                  <Ban size={16} className={currentTrack && isTrackExcluded(currentTrack, excludedTrackIds, excludedAlbumIds, excludedFingerprints) ? "text-red-500" : ""} />
                </button>
              </>
            )}
          </div>

          {/* Bottom Row: Holad Connect, Fullscreen Player */}
          <div className="flex items-center gap-1 justify-end h-7">
            {!(isJamRoute && role !== 'host') && (
              <>
                <HoladConnectMenu />
                <button 
                  onClick={toggleNowPlaying}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-foreground/5 ${isNowPlayingOpen ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
                  title={isNowPlayingOpen ? t('player.tooltip_fullscreen_exit') : t('player.tooltip_fullscreen')}
                >
                  <Maximize2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right Block: 2 Rows (Top: Stars + AutoDJ, Bottom: Volume + Percentage) */}
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          {/* Top row: Stars (tight, 16px, matching stroke) & ABTO-DJ */}
          <div className="flex items-center justify-between w-full h-7">
            {/* Star Rating */}
            {!hideSocialActions && (
              <div 
                className={`flex items-center gap-0.5 ml-1.5 ${role === 'listener' ? 'pointer-events-none opacity-50' : ''}`} 
                title={currentTrack?.userRating ? t('player.tooltip_rate_current', { rating: currentTrack.userRating }) : t('player.tooltip_rate_empty')}
              >
                {[1, 2, 3, 4, 5].map(star => {
                  const currentRating = currentTrack?.userRating || 0;
                  const isFilled = star <= currentRating;
                  return (
                    <button 
                      key={star} 
                      className={`transition-colors p-0 flex items-center justify-center w-4 h-4 ${isFilled ? 'text-primary' : 'text-foreground/50 hover:text-foreground/80'}`}
                      onClick={() => {
                        if (!currentTrack) return;
                        const newRating = currentRating === star ? 0 : star;
                        setTrackRating(currentTrack.id, newRating);
                      }}
                      title={currentRating === star ? t('player.tooltip_rate_reset') : t('player.tooltip_rate_star', { star })}
                    >
                      <Star size={16} strokeWidth={2} fill={isFilled ? "currentColor" : "none"} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Auto DJ Toggle */}
            {!hideAutoDJ && (
              <button 
                onClick={toggleAutoDj}
                disabled={role === 'listener'}
                className={`text-[11px] font-bold tracking-wider uppercase transition-colors disabled:opacity-50 flex items-center ${hideSocialActions ? 'ml-auto' : ''} ${
                  isAutoDjEnabled 
                    ? 'text-primary' 
                    : 'text-secondary hover:text-foreground'
                }`}
                title={isAutoDjEnabled ? t('player.tooltip_auto_dj_on') : t('player.tooltip_auto_dj_off')}
              >
                {t('player.auto_dj')}
              </button>
            )}
          </div>

          {/* Bottom row: Volume Mute, Volume Slider, Percentage */}
          <div 
            className="flex items-center gap-2 justify-end h-7"
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.03 : -0.03;
              const nextVal = Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100));
              setVolume(nextVal);
            }}
          >
            <button 
              onClick={handleToggleMute} 
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-foreground/5 hover:text-foreground transition-colors flex-shrink-0 text-secondary"
              title={volume === 0 ? t('player.tooltip_unmute') : t('player.tooltip_mute')}
            >
              {volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
            </button>

            {/* Volume Slider Capsule */}
            <div 
              className="hidden md:block w-[80px] lg:w-[96px] flex-shrink-0"
              title={`${t('player.tooltip_volume_slider')} (${Math.round(volume * 100)}%)`}
            >
              <VolumeSlider 
                value={volume} 
                onChange={setVolume}
                onDrag={(newVolume) => {
                  handleVolumeDrag(newVolume);
                }}
                onDragEnd={(newVolume) => {
                  setVolume(newVolume);
                }} 
                onPercentageChange={(formatted) => {
                  if (percentTextRef.current) {
                    percentTextRef.current.textContent = formatted;
                  }
                }}
              />
            </div>

            {/* Volume percentage number */}
            <span 
              ref={percentTextRef} 
              className="hidden md:block text-xs font-bold w-8 text-right flex-shrink-0 text-secondary tabular-nums"
            >
              {Math.round(volume * 100)}%
            </span>
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
        <MiniProgressBar />
      
        <TrackImage 
          src={getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 120)} 
          trackId={currentTrack.id}
          className="w-9 h-9 rounded shadow flex-shrink-0 object-cover" 
          alt="" 
        />
      
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p className="text-sm font-bold text-foreground truncate">{currentTrack.title}</p>
        <ArtistLinks artistString={currentTrack.artist} artistId={currentTrack.artistId} className="text-xs text-secondary truncate" />
      </div>

      <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
        <HoladConnectMenu />
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
        id="main-audio-player-0"
        className="main-audio-player"
        playsInline
        preload="auto"
        ref={audioRef0}
      />
      <audio
        id="main-audio-player-1"
        className="main-audio-player"
        playsInline
        preload="auto"
        ref={audioRef1}
      />
      {DesktopPlayer}
      {!isMobileExpanded && MobileMiniPlayer}
      <div className="md:hidden">
        {isMobileExpanded && !isJamRoute && <MobilePlayerUI onClose={() => setIsMobileExpanded(false)} />}
      </div>
    </>
  );
}
