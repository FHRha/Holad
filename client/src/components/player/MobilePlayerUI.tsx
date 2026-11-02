import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronDown, MoreHorizontal, Heart, 
  Bookmark, Music, Info, MessageSquareQuote, Ban,
  Headphones, Speaker, Disc3
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import LiquidSeekBar from '../common/LiquidSeekBar';
import { useTranslation } from 'react-i18next';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useHoladStore } from '../../store/holadStore';
import { useIsActiveDevice } from '../../hooks/useIsActiveDevice';
import MobileQueueTab from './MobileQueueTab';
import MobileInfoTab from './MobileInfoTab';
import MobileLyricsTab from './MobileLyricsTab';
import HoladConnectMenu from './HoladConnectMenu';
import { getAudioEngine } from '../../audio/AudioEngine';
import { useBookmark } from '../../hooks/useBookmark';
import { useAudioOutputDevice, getDeviceDisplayName, promptSelectAudioOutput } from '../../hooks/useAudioOutputDevice';
import { 
  SeekControls, 
  PlaybackRateButton, 
  SleepTimerMenu, 
  SleepTimerButton, 
  PlayerTransportBar 
} from './controls';
import { isTrackExcluded } from '../../utils/trackFingerprint';
import { StorageManager } from '../../utils/StorageManager';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { preloadAndDecodeImage } from '../../utils/assetPreloader';
import { getCachedImageUrl } from '../../utils/imageCache';
import { useLyricsSync } from '../../hooks/useLyricsSync';

const TAB_ORDER = ['player', 'queue', 'info', 'lyrics'] as const;
type TabType = typeof TAB_ORDER[number];

function FoldLyricsTeaser({ currentTrack, onOpenLyrics }: { currentTrack: any; onOpenLyrics: () => void }) {
  const { t } = useTranslation();
  const { audioElement } = useAudioStore();
  const { lyricsText, lrcLines, loadingLyrics, activeLyricIndexRef } = useLyricsSync(currentTrack, audioElement, true);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (lrcLines.length === 0) return;
    const interval = setInterval(() => {
      if (usePlayerStore.getState().isPlaying) {
        setTick(t => (t + 1) % 1000);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [lrcLines.length]);

  const activeIdx = activeLyricIndexRef.current >= 0 ? activeLyricIndexRef.current : 0;

  // 5 to 7 lines around activeIdx
  const visibleLines = useMemo(() => {
    if (lrcLines.length === 0) return [];
    const count = 5;
    let start = Math.max(0, activeIdx - 2);
    let end = Math.min(lrcLines.length, start + count);
    if (end - start < count) {
      start = Math.max(0, end - count);
    }
    return lrcLines.slice(start, end).map((line, idx) => {
      const realIdx = start + idx;
      return {
        line,
        realIdx,
        isCurrent: realIdx === activeIdx,
        isPast: realIdx < activeIdx,
        offset: realIdx - activeIdx
      };
    });
  }, [lrcLines, activeIdx]);

  const plainLines = useMemo(() => {
    if (!lyricsText) return [];
    return lyricsText.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6);
  }, [lyricsText]);

  return (
    <div
      onClick={onOpenLyrics}
      className="flex flex-col gap-2 p-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 backdrop-blur-md cursor-pointer transition-all duration-300 group select-none flex-1 min-h-[140px] md:min-h-[160px] justify-between relative overflow-hidden"
    >
      <div className="flex items-center justify-between shrink-0 z-10">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          <MessageSquareQuote size={14} />
          {t('player.lyrics', 'Текст песни')}
        </span>
        <span className="text-[11px] text-secondary/70 group-hover:text-primary transition-colors flex items-center gap-1">
          {t('player.open_full_lyrics', 'Открыть весь')} →
        </span>
      </div>

      <div 
        className="flex-1 flex flex-col justify-center overflow-hidden py-1 relative"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
        }}
      >
        {loadingLyrics ? (
          <p className="text-xs text-secondary animate-pulse text-center">{t('player.loading_lyrics', 'Загрузка текста...')}</p>
        ) : lrcLines.length > 0 ? (
          <div className="flex flex-col gap-1.5 text-center transition-all duration-300">
            {visibleLines.map(({ line, realIdx, isCurrent, isPast, offset }) => {
              if (line.isInterlude) {
                return (
                  <div key={realIdx} className={`flex justify-center items-center gap-2 py-1 transition-all duration-300 ${isCurrent ? 'scale-105' : 'opacity-40'}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
                  </div>
                );
              }

              let lineClass = 'text-center truncate transition-all duration-300 px-2 ';
              if (isCurrent) {
                lineClass += 'text-base md:text-lg font-extrabold text-primary scale-105 drop-shadow-[0_0_15px_rgba(var(--color-primary-rgb),0.5)]';
              } else if (isPast) {
                lineClass += 'text-white/50 text-sm';
              } else {
                if (offset === 1) {
                  lineClass += 'text-white/80 text-sm';
                } else {
                  lineClass += 'text-white/40 text-xs md:text-sm';
                }
              }

              return (
                <p key={realIdx} className={lineClass}>
                  {line.text || '♪ ♪ ♪'}
                </p>
              );
            })}
          </div>
        ) : plainLines.length > 0 ? (
          <div className="flex flex-col gap-1 text-center overflow-hidden">
            {plainLines.map((line, idx) => (
              <p 
                key={idx} 
                className={`text-xs truncate transition-colors ${
                  idx === 0 
                    ? 'text-foreground/90 font-medium' 
                    : idx < 3 
                      ? 'text-white/70' 
                      : 'text-white/40'
                }`}
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-secondary/70 text-center">
            {t('player.tap_for_lyrics', 'Нажмите для просмотра текста')}
          </p>
        )}
      </div>
    </div>
  );
}

export default function MobilePlayerUI({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { 
    queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, 
    role, likedTrackIds, toggleTrackLike, excludedTrackIds, excludedAlbumIds, excludedFingerprints, toggleTrackExclude, isShuffle, toggleShuffle, 
    repeatMode, cycleRepeatMode, playbackRate, cyclePlaybackRate, 
    sleepTimer
  } = usePlayerStore();
  const { progress, buffered, duration, isSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();
  const { openMenu } = useContextMenuStore();
  
  const isConnected = useHoladStore(s => s.roomId !== null);
  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  const isActiveDevice = useIsActiveDevice();
  const isRemoteActive = !isActiveDevice;
  const outputDevice = useAudioOutputDevice();
  
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const searchParams = new URLSearchParams(window.location.search);
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const isStandalonePath = window.location.pathname.startsWith('/jam/track/') ||
                           window.location.pathname.startsWith('/jam/album/') ||
                           window.location.pathname.startsWith('/jam/playlist/');
  const isStandalone = isJamRoute && (isStandaloneQuery || isStandalonePath);
  const isListenerPage = isStandalone || (isJamRoute && role === 'listener');
  
  const currentTrack = queue[currentIndex];
  const nextTrackItem = queue[currentIndex + 1];
  
  const [activeTab, setActiveTab] = useState<TabType>('player');
  const [tabDirection, setTabDirection] = useState<number>(0);
  const [showSleepTimerMenu, setShowSleepTimerMenu] = useState(false);

  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 600 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsWide(window.innerWidth >= 600);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleTabChange = (newTab: TabType) => {
    if (newTab === activeTab) return;
    const oldIdx = TAB_ORDER.indexOf(activeTab);
    const newIdx = TAB_ORDER.indexOf(newTab);
    setTabDirection(newIdx > oldIdx ? 1 : -1);
    setActiveTab(newTab);
  };
  
  const { isBookmarked, toggleBookmark: handleBookmark } = useBookmark(currentTrack?.id);

  // oxlint-disable-next-line
  const coverArtHighRes = useMemo(() => {
    if (!currentTrack) return '';
    return getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 1000);
  }, [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);

  // oxlint-disable-next-line
  const coverArtLowRes = useMemo(() => {
    if (!currentTrack) return '';
    return getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 300);
  }, [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const coverArtBg = useMemo(() => {
    if (!currentTrack) return '';
    return getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 120);
  }, [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);

  const [activeCoverSrc, setActiveCoverSrc] = useState(coverArtLowRes);
  useEffect(() => {
    setActiveCoverSrc(coverArtLowRes);
    if (!coverArtHighRes) return;
    let isMounted = true;
    preloadAndDecodeImage(coverArtHighRes).then(() => {
      if (isMounted) setActiveCoverSrc(coverArtHighRes);
    }).catch(() => {});
    return () => { isMounted = false; };
  }, [coverArtLowRes, coverArtHighRes]);

  const [localCoverUrl, setLocalCoverUrl] = useState<string>('');
  const [displayedBgCover, setDisplayedBgCover] = useState<string>(() => {
    if (!currentTrack) return '';
    return getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 120);
  });

  useEffect(() => {
    let isMounted = true;
    if (!currentTrack?.id) return;

    const resolveBackground = async () => {
      let candidate = '';
      try {
        const uri = await StorageManager.getLocalCoverUri(currentTrack.id);
        if (uri && isMounted) {
          setLocalCoverUrl(uri);
          candidate = uri;
        }
      } catch {}

      if (!candidate && coverArtBg) {
        try {
          candidate = await getCachedImageUrl(coverArtBg);
        } catch {
          candidate = coverArtBg;
        }
      }

      if (candidate && isMounted) {
        await preloadAndDecodeImage(candidate);
        if (isMounted) {
          setDisplayedBgCover(candidate);
        }
      }
    };

    resolveBackground();

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, coverArtBg]);

  const effectiveBgCover = displayedBgCover || localCoverUrl || coverArtBg;

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
    
    if (isConnected && !activeDeviceId) {
      useHoladStore.getState().setActiveDevice(localDeviceId);
    }

    if (!isPlaying && isActiveDevice) {
      getAudioEngine().resume().catch(() => {});
    }
    
    setIsPlaying(!isPlaying);
  };

  const timeTextRef = useRef<HTMLSpanElement>(null);
  const seekbarRef = useRef<any>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timeTextRef.current) timeTextRef.current.textContent = formatTime((progress / 100) * (duration || 0));
      if (seekbarRef.current) seekbarRef.current.setValue(progress / 100);
      return;
    }
    let animationFrameId: number;
    const updateTime = () => {
      const engine = getAudioEngine();
      let t = 0;
      const engDur = engine.getDuration();
      const state = useHoladStore.getState();
      const isActiveDevice = !state.roomId || state.activeDeviceId === state.deviceId;
      if (engDur > 0 && isActiveDevice) {
        t = engine.getCurrentTime();
      } else {
        t = (progress / 100) * (duration || 0);
      }
      
      if (timeTextRef.current) {
        if (!useAudioStore.getState().isSeeking) {
          timeTextRef.current.textContent = formatTime(t);
        } else {
          timeTextRef.current.textContent = formatTime((useAudioStore.getState().progress / 100) * (duration || 0));
        }
      }
      
      if (seekbarRef.current && !useAudioStore.getState().isSeeking) {
        const dur = engDur > 0 ? engDur : duration;
        seekbarRef.current.setValue(dur ? t / dur : 0);
      }
      
      animationFrameId = requestAnimationFrame(updateTime);
    };
    updateTime();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, progress, duration, activeTab, isWide]);

  const formatBadgeText = useMemo(() => {
    if (!currentTrack) return 'MP3 • 192 kbps';
    const suf = currentTrack.suffix?.toUpperCase();
    const isLossless = suf === 'FLAC' || suf === 'ALAC' || suf === 'WAV' || suf === 'AIFF';
    if (isLossless) {
      return `${suf || 'FLAC'} Lossless`;
    }
    if (suf && currentTrack.bitRate) {
      return `${suf} • ${currentTrack.bitRate} kbps`;
    }
    if (suf) return suf;
    if (currentTrack.bitRate) return `${currentTrack.bitRate} kbps`;
    return 'MP3 • 192 kbps';
  }, [currentTrack]);

  if (!currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.id);

  // Playback Controls (Seekbar + Transport Bar)
  const PlaybackControlsContent = (
    <div className="w-full flex flex-col gap-4">
      <div className="w-full flex flex-col gap-1.5">
        <LiquidSeekBar 
          ref={seekbarRef}
          value={progress / 100} 
          buffered={buffered / 100}
          onChange={handleSeekChange} 
          onDragEnd={handleSeekEnd} 
          className={`w-full ${role === 'listener' ? 'pointer-events-none' : ''}`}
          isAnimated={isPlaying && !isSeeking}
        />
        <div className="flex justify-between text-xs font-medium text-secondary px-1">
          <span ref={timeTextRef}>{formatTime(isSeeking ? (progress / 100) * (duration || 0) : ((progress / 100) * (duration || 0)))}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <PlayerTransportBar
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onNext={nextTrack}
        onPrev={prevTrack}
        isShuffle={isShuffle}
        onToggleShuffle={toggleShuffle}
        repeatMode={repeatMode}
        onCycleRepeat={cycleRepeatMode}
        isListener={role === 'listener'}
      />
    </div>
  );

  // Secondary Tools (Sleep Timer, Playback Rate, Bookmark)
  const SecondaryControls = (
    <div className="flex items-center justify-between w-full px-2 pt-1 text-secondary">
      <SleepTimerButton 
        onClick={() => setShowSleepTimerMenu(true)} 
        isActive={!!sleepTimer.type} 
      />
      <SeekControls currentTrack={currentTrack} role={role}>
        <PlaybackRateButton 
          playbackRate={playbackRate} 
          onCycle={cyclePlaybackRate} 
          disabled={role === 'listener'} 
        />
      </SeekControls>
      <button onClick={handleBookmark} className={`hover:text-foreground transition-colors active:scale-95 ${isBookmarked ? 'text-primary' : ''}`}>
        <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
      </button>
    </div>
  );

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 260, mass: 0.8 }}
      drag={!isWide && !isListenerPage && activeTab === 'player' ? 'y' : false}
      dragSnapToOrigin={true}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) {
          onClose();
        }
      }}
      className="fixed inset-0 h-[100dvh] w-full bg-background flex flex-col text-foreground overflow-hidden z-[100] transform-gpu will-change-transform"
    >
      {!isListenerPage && (
        <div className="w-full pt-2 pb-0 flex justify-center items-center pointer-events-none z-20">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
      )}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <AnimatePresence mode="popLayout">
          {effectiveBgCover && (
            <motion.div 
              key={effectiveBgCover}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
              className="absolute inset-0 bg-cover bg-center blur-[30px] scale-110 transform-gpu will-change-transform"
              style={{ backgroundImage: `url("${effectiveBgCover}")` }}
            />
          )}
        </AnimatePresence>
      </div>
      <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />

      {/* Top Header */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3 w-full">
        {!isListenerPage ? (
          <button 
            onClick={onClose}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95 shrink-0"
            aria-label={t('common.close', 'Закрыть')}
          >
            <ChevronDown size={28} />
          </button>
        ) : <div className="w-11 shrink-0" />}

        <div className="flex-1 flex items-center justify-center min-w-0 px-2 overflow-hidden">
          {!isRemoteActive && (
            <div 
              onClick={() => {
                promptSelectAudioOutput().catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 backdrop-blur-md text-[11px] font-medium text-white/80 max-w-[200px] truncate select-none border border-white/5 shadow-sm transition-all duration-300 cursor-pointer active:scale-95"
              title={getDeviceDisplayName(outputDevice, t)}
            >
              {outputDevice.isHeadphones ? (
                <Headphones size={13} className="text-primary shrink-0" />
              ) : (
                <Speaker size={13} className="text-white/60 shrink-0" />
              )}
              <span className="truncate min-w-0">
                {getDeviceDisplayName(outputDevice, t)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <HoladConnectMenu variant="icon" />
          <button 
            onClick={(e) => openMenu(e.clientX, e.clientY, currentTrack, 'track')}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95"
            aria-label={t('common.more_options', 'Дополнительно')}
          >
            <MoreHorizontal size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isWide ? (
        /* Dual-Column Foldable / Tablet Split-View Layout (Benchmark: Galaxy Z Fold unfolded >= 600px) */
        <LayoutGroup id="fold-player-controls">
          <div className="relative z-10 flex-1 flex flex-row items-center justify-center w-full max-w-5xl mx-auto px-6 py-2 gap-8 min-h-0 overflow-hidden">
            
            {/* Left Column: Fixed Cover, Header, and Adaptive Bottom Control Slot */}
            <div className="w-[44%] max-w-[380px] h-full flex flex-col justify-start shrink-0 py-2">
              
              {/* Top Area: Technical Metadata Badges (Format/Bitrate on Left, Year on Right) */}
              <div className="w-full flex items-center justify-between shrink-0 px-0.5">
                <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                  <span>{formatBadgeText}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-white/[0.05] text-secondary/90 border border-white/10 backdrop-blur-md">
                  <span>{(currentTrack as any).year || '—'}</span>
                </div>
              </div>

              {/* Middle Area: Cover Art (Visual center, mt-3 md:mt-4, max-h-[40vh] md:max-h-[44vh]) */}
              <div className="w-full aspect-square max-h-[40vh] md:max-h-[44vh] flex items-center justify-center shrink-0 mt-3 md:mt-4">
                <TrackImage 
                  src={activeCoverSrc} 
                  trackId={currentTrack.id}
                  className="w-full h-full rounded-3xl shadow-2xl object-cover border border-border bg-card" 
                  alt={currentTrack.title} 
                  priority={true}
                />
              </div>

              {/* Under Cover: Title, Artist, Album with Disc3 + Heart & Ban Buttons */}
              <div className="w-full flex items-center justify-between shrink-0 mt-3 md:mt-4">
                <div className="flex flex-col overflow-hidden mr-3">
                  <h1 className="text-xl md:text-2xl font-bold text-foreground truncate drop-shadow-md">
                    {currentTrack.title}
                  </h1>
                  <h2 className="text-sm md:text-base text-secondary truncate drop-shadow-md mt-0.5">
                    {formatArtistName(currentTrack.artist)}
                  </h2>
                  <div className="flex items-center gap-1.5 text-xs text-secondary/80 mt-1 truncate">
                    <Disc3 size={13} className="text-primary shrink-0 animate-spin-slow" />
                    <span className="truncate">{currentTrack.album || t('player.single', 'Сингл')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={handleLike}
                    className={`p-2 rounded-full transition-colors active:scale-95 ${isLiked ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
                    aria-label={isLiked ? t('player.tooltip_like_remove', 'Удалить из избранного') : t('player.tooltip_like_add', 'Добавить в избранное')}
                  >
                    <Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />
                  </button>
                  <button 
                    onClick={() => toggleTrackExclude(currentTrack.id, currentTrack)}
                    className={`p-2 rounded-full transition-colors active:scale-95 ${isTrackExcluded(currentTrack, excludedTrackIds, excludedAlbumIds, excludedFingerprints) ? 'text-red-500' : 'text-secondary'}`}
                    aria-label={t('player.tooltip_exclude_add', 'Не рекомендовать')}
                  >
                    <Ban size={22} />
                  </button>
                </div>
              </div>

              {/* Bottom Slot of Left Column:
                  On 'player' tab -> Secondary controls (sleep timer, speed, bookmark).
                  On other tabs ('queue', 'lyrics', 'info') -> Main playback controls (seekbar + transport)! */}
              <div className="w-full shrink-0 min-h-[115px] flex flex-col justify-end mt-4 md:mt-5">
                {activeTab === 'player' ? (
                  <div className="w-full pb-1">
                    {SecondaryControls}
                  </div>
                ) : (
                  <motion.div
                    layoutId="foldPlaybackControls"
                    transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                    className="w-full"
                  >
                    {PlaybackControlsContent}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Right Column: Tab View Area with Smooth Transitions */}
            <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden relative py-2">
              <div className="w-full flex-1 min-h-0 overflow-hidden relative">
                {activeTab === 'player' ? (
                  <motion.div
                    key="player-tab-right"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="w-full h-full flex flex-col min-h-0 overflow-hidden"
                  >
                    {/* Combined Upper Area: Next Up Card + Live Synced Lyrics Teaser */}
                    <div className="w-full flex-1 flex flex-col gap-3 min-h-0 mb-4 overflow-hidden">
                      {nextTrackItem && (
                        <div 
                          onClick={() => handleTabChange('queue')}
                          className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 backdrop-blur-md cursor-pointer transition-colors group select-none shrink-0"
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-card border border-border">
                            <TrackImage 
                              src={nextTrackItem.coverArt ? getCoverArtUrl(nextTrackItem.coverArt, 120) : ''} 
                              trackId={nextTrackItem.id} 
                              className="w-full h-full object-cover" 
                              alt={nextTrackItem.title} 
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              {t('player.up_next', 'Далее в очереди')}
                            </span>
                            <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                              {nextTrackItem.title}
                            </p>
                            <p className="text-xs text-secondary truncate">
                              {'• ' + formatArtistName(nextTrackItem.artist)}
                            </p>
                          </div>
                        </div>
                      )}

                      <FoldLyricsTeaser 
                        currentTrack={currentTrack} 
                        onOpenLyrics={() => handleTabChange('lyrics')} 
                      />
                    </div>
                  </motion.div>
                ) : (
                  /* Full-height active tab content on right screen */
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: tabDirection > 0 ? 24 : -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="w-full h-full flex flex-col min-h-0 overflow-hidden"
                  >
                    {activeTab === 'queue' && <MobileQueueTab />}
                    {activeTab === 'info' && <MobileInfoTab currentTrack={currentTrack} />}
                    {activeTab === 'lyrics' && <MobileLyricsTab currentTrack={currentTrack} isActive={activeTab === 'lyrics'} />}
                  </motion.div>
                )}
              </div>

              {/* Right Bottom Slot: Playback Controls when on Player Tab (at static column level) */}
              {activeTab === 'player' && (
                <div className="w-full shrink-0 min-h-[115px] flex flex-col justify-end">
                  <motion.div
                    layoutId="foldPlaybackControls"
                    transition={{ type: 'spring', stiffness: 350, damping: 32 }}
                    className="w-full"
                  >
                    {PlaybackControlsContent}
                  </motion.div>
                </div>
              )}
            </div>
          </div>
        </LayoutGroup>
      ) : (
        /* Single-Column Classical Mobile Layout (< 600px) */
        <div className={`relative z-10 flex-1 flex flex-col items-center justify-between w-full max-w-md mx-auto min-h-0 ${activeTab === 'player' ? 'px-6 pb-6 overflow-y-auto hide-scrollbar' : 'px-0 pb-0 overflow-hidden'}`}>
          {activeTab === 'player' ? (
            <motion.div
              key="player-tab-single"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full flex-1 flex flex-col justify-between h-full"
            >
              <div className="w-full flex-1 flex items-center justify-center min-h-0 overflow-hidden mb-2 mt-2">
                <div className="h-full max-h-[42vh] aspect-square flex items-center justify-center">
                  <TrackImage 
                    src={activeCoverSrc} 
                    trackId={currentTrack.id}
                    className="w-full h-full rounded-3xl shadow-2xl object-cover border border-border bg-card" 
                    alt={currentTrack.title} 
                    priority={true}
                  />
                </div>
              </div>

              <div className="w-full flex flex-col gap-5 mt-auto">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col overflow-hidden mr-4">
                    <h1 className="text-2xl font-bold text-foreground truncate drop-shadow-md">{currentTrack.title}</h1>
                    <h2 className="text-base text-secondary truncate drop-shadow-md">{formatArtistName(currentTrack.artist)}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handleLike}
                      className={`p-2 rounded-full transition-colors active:scale-95 flex-shrink-0 ${isLiked ? 'text-primary' : 'text-secondary hover:text-foreground'}`}
                    >
                      <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
                    </button>
                    <button 
                      onClick={() => toggleTrackExclude(currentTrack.id, currentTrack)}
                      className={`p-2 rounded-full transition-colors active:scale-95 flex-shrink-0 ${isTrackExcluded(currentTrack, excludedTrackIds, excludedAlbumIds, excludedFingerprints) ? 'text-red-500' : 'text-secondary'}`}
                    >
                      <Ban size={24} />
                    </button>
                  </div>
                </div>

                {PlaybackControlsContent}
                {SecondaryControls}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: tabDirection > 0 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full h-full flex flex-col min-h-0 overflow-hidden"
            >
              {activeTab === 'queue' && <MobileQueueTab />}
              {activeTab === 'info' && <MobileInfoTab currentTrack={currentTrack} />}
              {activeTab === 'lyrics' && <MobileLyricsTab currentTrack={currentTrack} isActive={activeTab === 'lyrics'} />}
            </motion.div>
          )}
        </div>
      )}

      {/* Bottom Navigation Bar with Spring Layout Pill */}
      <div 
        onPointerDownCapture={(e) => e.stopPropagation()}
        onTouchStartCapture={(e) => e.stopPropagation()}
        className="relative z-10 w-full h-[72px] flex-shrink-0 bg-background/40 backdrop-blur-md transform-gpu will-change-transform border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <button 
          onClick={() => handleTabChange('player')} 
          className={`relative p-3 rounded-full transition-colors z-10 ${activeTab === 'player' ? 'text-primary' : 'text-secondary hover:text-secondary'}`}
          aria-label={t('player.music', 'Музыка')}
        >
          {activeTab === 'player' && (
            <motion.div
              layoutId="mobilePlayerActiveTab"
              className="absolute inset-0 bg-primary/15 rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Music size={24} />
        </button>
        <button 
          onClick={() => handleTabChange('queue')} 
          className={`relative p-3 rounded-full transition-colors z-10 ${activeTab === 'queue' ? 'text-primary' : 'text-secondary hover:text-secondary'}`}
          aria-label={t('player.queue', 'Очередь')}
        >
          {activeTab === 'queue' && (
            <motion.div
              layoutId="mobilePlayerActiveTab"
              className="absolute inset-0 bg-primary/15 rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="6" x2="21" y2="6"></line>
            <line x1="12" y1="12" x2="21" y2="12"></line>
            <line x1="12" y1="18" x2="21" y2="18"></line>
            <polygon points="3 5 9 8.5 3 12 3 5" fill="currentColor" stroke="none"></polygon>
          </svg>
        </button>
        <button 
          onClick={() => handleTabChange('info')} 
          className={`relative p-3 rounded-full transition-colors z-10 ${activeTab === 'info' ? 'text-primary' : 'text-secondary hover:text-secondary'}`}
          aria-label={t('player.tab_info', 'Инфо')}
        >
          {activeTab === 'info' && (
            <motion.div
              layoutId="mobilePlayerActiveTab"
              className="absolute inset-0 bg-primary/15 rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Info size={24} />
        </button>
        <button 
          onClick={() => handleTabChange('lyrics')} 
          className={`relative p-3 rounded-full transition-colors z-10 ${activeTab === 'lyrics' ? 'text-primary' : 'text-secondary hover:text-secondary'}`}
          aria-label={t('player.lyrics', 'Текст')}
        >
          {activeTab === 'lyrics' && (
            <motion.div
              layoutId="mobilePlayerActiveTab"
              className="absolute inset-0 bg-primary/15 rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <MessageSquareQuote size={24} />
        </button>
      </div>

      <SleepTimerMenu 
        isOpen={showSleepTimerMenu} 
        onClose={() => setShowSleepTimerMenu(false)} 
      />
    </motion.div>
  );
}
