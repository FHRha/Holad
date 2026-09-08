import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ChevronDown, MoreHorizontal, Heart, Shuffle, SkipBack, 
  Play, Pause, SkipForward, Repeat, Repeat1, Moon, 
  Bookmark, Music, Info, MessageSquareQuote, RotateCcw, RotateCw, Ban
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
import MobileQueueTab from './MobileQueueTab';
import MobileInfoTab from './MobileInfoTab';
import MobileLyricsTab from './MobileLyricsTab';
import HoladConnectMenu from './HoladConnectMenu';
import { getAudioEngine } from '../../audio/AudioEngine';
import { useBookmark } from '../../hooks/useBookmark';
import { jamSocket } from '../../api/socket';

export default function MobilePlayerUI({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { 
    queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, 
    role, likedTrackIds, toggleTrackLike, excludedTrackIds, toggleTrackExclude, isShuffle, toggleShuffle, 
    repeatMode, cycleRepeatMode, playbackRate, cyclePlaybackRate, 
    sleepTimer, setSleepTimer
  } = usePlayerStore();
  const { progress, buffered, duration, isSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();
  const { openMenu } = useContextMenuStore();
  
  const isConnected = useHoladStore(s => s.roomId !== null);
  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const searchParams = new URLSearchParams(window.location.search);
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const isStandalonePath = window.location.pathname.startsWith('/jam/track/') ||
                           window.location.pathname.startsWith('/jam/album/') ||
                           window.location.pathname.startsWith('/jam/playlist/');
  const isStandalone = isJamRoute && (isStandaloneQuery || isStandalonePath);
  const isListenerPage = isStandalone || (isJamRoute && role !== 'host');
  
  const currentTrack = queue[currentIndex];
  
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'info' | 'lyrics'>('player');
  const [showSleepTimerMenu, setShowSleepTimerMenu] = useState(false);
  
  const { isBookmarked, toggleBookmark: handleBookmark } = useBookmark(currentTrack?.id);

  const handleRewind = () => {
    if (currentTrack) {
      const engine = getAudioEngine();
      const newTime = Math.max(0, engine.getCurrentTime() - 15);
      engine.seek(newTime);
      const pState = usePlayerStore.getState();
      if (pState.roomId && (pState.role === 'host' || pState.role === 'cohost')) {
        jamSocket.syncSeek(newTime);
      }
    }
  };

  const handleFastForward = () => {
    if (currentTrack) {
      const engine = getAudioEngine();
      const dur = engine.getDuration() || currentTrack.duration || 0;
      const newTime = Math.min(dur, engine.getCurrentTime() + 30);
      engine.seek(newTime);
      const pState = usePlayerStore.getState();
      if (pState.roomId && (pState.role === 'host' || pState.role === 'cohost')) {
        jamSocket.syncSeek(newTime);
      }
    }
  };

  const handleSetSleepTimer = (val: number | 'track_end' | null) => {
    setSleepTimer(val);
    setShowSleepTimerMenu(false);
  };


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
    
    if (!isPlaying && (!isConnected || activeDeviceId === localDeviceId || activeDeviceId === null)) {
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
        // Only update text if not seeking, to avoid jumping text while user drags
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
  }, [isPlaying, progress, duration, activeTab]);

  if (!currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.id);

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-background flex flex-col text-foreground overflow-hidden z-[100] animate-in slide-in-from-bottom-full fade-in-0 duration-300">
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[30px] opacity-70 scale-110 transform-gpu will-change-transform"
        style={{ backgroundImage: `url(${coverArtLowRes})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/40" />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-4 w-full">
        {!isListenerPage ? (
          <button 
            onClick={onClose}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95"
          >
            <ChevronDown size={28} />
          </button>
        ) : <div className="w-[44px]" />}
        <span className="text-white font-bold text-sm tracking-wider">
          {t('player.now_playing')}
        </span>
        <div className="flex items-center gap-1">
          <HoladConnectMenu />
          <button 
            onClick={(e) => openMenu(e.clientX, e.clientY, currentTrack, 'track')}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95"
          >
            <MoreHorizontal size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={`relative z-10 flex-1 flex flex-col items-center justify-between w-full max-w-md mx-auto min-h-0 ${activeTab === 'player' ? 'px-6 pb-6 overflow-y-auto hide-scrollbar' : 'px-0 pb-0 overflow-hidden'}`}>
        
        {/* Conditional Content based on Active Tab */}
        <div className={`w-full flex-1 flex flex-col justify-start min-h-0 overflow-hidden ${activeTab === 'player' ? 'mb-2 mt-2' : 'h-full'}`}>
          {activeTab === 'player' && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="h-full max-h-full max-w-full aspect-square">
                <TrackImage src={coverArtHighRes} className="w-full h-full rounded-3xl shadow-2xl object-cover border border-border bg-card" alt={currentTrack.title} />
              </div>
            </div>
          )}
          {activeTab === 'queue' && (
            <MobileQueueTab />
          )}
          {activeTab === 'info' && (
            <MobileInfoTab currentTrack={currentTrack} />
          )}
          {activeTab === 'lyrics' && (
            <MobileLyricsTab currentTrack={currentTrack} isActive={activeTab === 'lyrics'} />
          )}
        </div>

        {/* Info & Controls Section (Visible only on player tab) */}
        {activeTab === 'player' && (
          <div className="w-full flex flex-col gap-5 mt-auto">
            {/* Track Info */}
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
                  onClick={() => toggleTrackExclude(currentTrack.id)}
                  className={`p-2 rounded-full transition-colors active:scale-95 flex-shrink-0 ${excludedTrackIds.includes(currentTrack.id) ? 'text-red-500' : 'text-secondary'}`}
                >
                  <Ban size={24} />
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full flex flex-col gap-2">
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

            {/* Main Playback Controls */}
            <div className="flex items-center justify-between w-full px-2">
              <button 
                onClick={toggleShuffle} 
                disabled={role === 'listener'}
                className={`transition-colors active:scale-95 disabled:opacity-50 p-2.5 rounded-full flex items-center justify-center ${isShuffle ? 'text-primary bg-primary/20 shadow-sm shadow-primary/10' : 'text-secondary hover:bg-foreground/10'}`}
              >
                <Shuffle size={20} />
              </button>
              <button 
                onClick={prevTrack} 
                disabled={role === 'listener'} 
                className="text-secondary hover:text-foreground active:scale-95 transition-colors disabled:opacity-50 p-2"
              >
                <SkipBack size={32} fill="currentColor" />
              </button>
              <button 
                onClick={handlePlayPause} 
                disabled={role === 'listener'}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
              >
                {isPlaying ? (
                  <Pause fill="currentColor" size={28} className="stroke-none" />
                ) : (
                  <Play fill="currentColor" size={28} className="stroke-none translate-x-[2px]" />
                )}
              </button>
              <button 
                onClick={nextTrack} 
                disabled={role === 'listener'} 
                className="text-secondary hover:text-foreground active:scale-95 transition-colors disabled:opacity-50 p-2"
              >
                <SkipForward size={32} fill="currentColor" />
              </button>
              <button 
                onClick={cycleRepeatMode} 
                disabled={role === 'listener'}
                className={`transition-colors active:scale-95 disabled:opacity-50 p-2.5 rounded-full flex items-center justify-center ${repeatMode !== 'none' ? 'text-primary bg-primary/20 shadow-sm shadow-primary/10' : 'text-secondary hover:bg-foreground/10'}`}
              >
                {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
              </button>
            </div>

            {/* Secondary Controls Row */}
            <div className="flex items-center justify-between w-full px-4 pt-2 text-secondary">
              <button onClick={() => setShowSleepTimerMenu(true)} className={`hover:text-foreground transition-colors active:scale-95 ${sleepTimer.type ? 'text-primary' : ''}`}>
                <Moon size={20} />
              </button>
              <button onClick={handleRewind} className="hover:text-foreground transition-colors active:scale-95 relative flex items-center justify-center">
                <RotateCcw size={20} />
                <span className="absolute text-[8px] font-bold mt-0.5">15</span>
              </button>
              <button onClick={cyclePlaybackRate} className={`hover:text-foreground transition-colors active:scale-95 font-bold text-sm tracking-wider ${playbackRate !== 1 ? 'text-primary' : ''}`}>
                {playbackRate}x
              </button>
              <button onClick={handleFastForward} className="hover:text-foreground transition-colors active:scale-95 relative flex items-center justify-center">
                <RotateCw size={20} />
                <span className="absolute text-[8px] font-bold mt-0.5">30</span>
              </button>
              <button onClick={handleBookmark} className={`hover:text-foreground transition-colors active:scale-95 ${isBookmarked ? 'text-primary' : ''}`}>
                <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Very Bottom: Navigation Tabs */}
      <div className="relative z-10 w-full h-[72px] flex-shrink-0 bg-background/40 backdrop-blur-md transform-gpu will-change-transform border-t border-border flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => setActiveTab('player')} className={`p-3 rounded-full transition-colors ${activeTab === 'player' ? 'text-primary bg-primary/10' : 'text-secondary hover:text-secondary'}`}>
          <Music size={24} />
        </button>
        <button onClick={() => setActiveTab('queue')} className={`p-3 rounded-full transition-colors ${activeTab === 'queue' ? 'text-primary bg-primary/10' : 'text-secondary hover:text-secondary'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="6" x2="21" y2="6"></line>
            <line x1="12" y1="12" x2="21" y2="12"></line>
            <line x1="12" y1="18" x2="21" y2="18"></line>
            <polygon points="3 5 9 8.5 3 12 3 5" fill="currentColor" stroke="none"></polygon>
          </svg>
        </button>
        <button onClick={() => setActiveTab('info')} className={`p-3 rounded-full transition-colors ${activeTab === 'info' ? 'text-primary bg-primary/10' : 'text-secondary hover:text-secondary'}`}>
          <Info size={24} />
        </button>
        <button onClick={() => setActiveTab('lyrics')} className={`p-3 rounded-full transition-colors ${activeTab === 'lyrics' ? 'text-primary bg-primary/10' : 'text-secondary hover:text-secondary'}`}>
          <MessageSquareQuote size={24} />
        </button>
      </div>

      {/* Sleep Timer Modal */}
      {showSleepTimerMenu && (
        <div className="absolute inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:w-[400px] bg-background/90 backdrop-blur-xl transform-gpu border border-border rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-2 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Moon size={24} className="text-primary" />
                {t('player.sleepTimer')}
              </h3>
              <button onClick={() => setShowSleepTimerMenu(false)} className="p-2 text-secondary hover:text-foreground transition-colors rounded-full active:scale-95">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <button onClick={() => handleSetSleepTimer(15)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground">
              <span>{t('player.timer.15m')}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) <= 15 && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer(30)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground">
              <span>{t('player.timer.30m')}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 15 && Math.round((sleepTimer.endTime - Date.now()) / 60000) <= 30 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer(60)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground">
              <span>{t('player.timer.60m')}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 30 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer('track_end')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-foreground">
              <span>{t('player.timer.trackEnd')}</span>
              {sleepTimer.type === 'track_end' && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <div className="w-full h-px bg-foreground/10 my-2" />
            <button onClick={() => handleSetSleepTimer(null)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-foreground/10 transition-colors flex justify-between items-center text-red-400">
              <span>{t('player.timer.off')}</span>
            </button>
          </div>
          <div className="absolute inset-0 z-[-1]" onClick={() => setShowSleepTimerMenu(false)} />
        </div>
      )}
    </div>
  );
}
