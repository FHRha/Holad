import { useState, useMemo } from 'react';
import { 
  ChevronDown, Shuffle, SkipBack, 
  Play, Pause, SkipForward, Repeat, Repeat1, Moon, 
  Music, RotateCcw, RotateCw, Users, MessageSquareQuote
} from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { getCoverArtUrl } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import LiquidSeekBar from '../common/LiquidSeekBar';
import { useTranslation } from 'react-i18next';

import MobileQueueTab from './MobileQueueTab';
import MobileLyricsTab from './MobileLyricsTab';
import JamSessionControl from '../jam/JamSessionControl';

export default function MobileJamPlayerUI({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { 
    queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, 
    role, isShuffle, toggleShuffle, 
    repeatMode, cycleRepeatMode, playbackRate, cyclePlaybackRate, 
    sleepTimer, setSleepTimer, roomId
  } = usePlayerStore();
  const { audioElement, progress, duration, isSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();
  
  const currentTrack = queue[currentIndex];
  
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'lyrics'>('player');
  const [showSleepTimerMenu, setShowSleepTimerMenu] = useState(false);
  const [showSessionMenu, setShowSessionMenu] = useState(false);

  // Check if standalone
  const searchParams = new URLSearchParams(window.location.search);
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isStandalone = isJamRoute && (!!searchParams.get('track') || !!searchParams.get('album')) && !roomId;

  const handleRewind = () => {
    if (audioElement && currentTrack) {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - 15);
    }
  };

  const handleFastForward = () => {
    if (audioElement && currentTrack) {
      audioElement.currentTime = Math.min(currentTrack.duration, audioElement.currentTime + 30);
    }
  };

  const handleSetSleepTimer = (val: number | 'track_end' | null) => {
    setSleepTimer(val);
    setShowSleepTimerMenu(false);
  };

  const coverArtHighRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 1000) : '', [currentTrack?.id]);
  const coverArtLowRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 300) : '', [currentTrack?.id]);



  const handlePlayPause = () => {
    if (role === 'listener') return; 
    setIsPlaying(!isPlaying);
  };

  if (!currentTrack) return null;


  const showMinimizeButton = role !== 'listener' && !isStandalone;
  const showSessionButton = !isStandalone;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-background flex flex-col text-foreground overflow-hidden z-[100] animate-in slide-in-from-bottom-full fade-in-0 duration-300">
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[60px] opacity-60 saturate-150 scale-110 transform-gpu will-change-transform"
        style={{ backgroundImage: `url(${coverArtLowRes})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/40" />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-4 w-full">
        {showMinimizeButton ? (
          <button 
            onClick={onClose}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95"
          >
            <ChevronDown size={28} />
          </button>
        ) : (
          <div className="w-11" /> // Placeholder for alignment
        )}
        <span className="text-white font-bold text-sm tracking-wider">
          {t('player.now_playing', { defaultValue: 'Играет' })}
        </span>
        {showSessionButton ? (
          <button 
            onClick={() => setShowSessionMenu(true)}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95"
          >
            <Users size={24} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6 w-full max-w-md mx-auto min-h-0 overflow-y-auto hide-scrollbar">
        
        {/* Conditional Content based on Active Tab */}
        <div className="w-full flex-1 flex flex-col justify-center min-h-0 overflow-hidden mb-6 mt-2">
          {activeTab === 'player' && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="h-full max-h-full max-w-full aspect-square">
                <TrackImage src={coverArtHighRes} className="w-full h-full rounded-3xl shadow-2xl object-cover border border-white/10 bg-black/20" alt={currentTrack.title} />
              </div>
            </div>
          )}
          {activeTab === 'queue' && (
            <MobileQueueTab />
          )}
          {activeTab === 'lyrics' && (
            <MobileLyricsTab currentTrack={currentTrack} isActive={activeTab === 'lyrics'} />
          )}
        </div>

        {/* Info & Controls Section (Always visible) */}
        <div className="w-full flex flex-col gap-6 mt-6">
          {/* Track Info */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden mr-4">
              <h1 className="text-2xl font-bold text-white truncate drop-shadow-md">{currentTrack.title}</h1>
              <h2 className="text-base text-white/70 truncate drop-shadow-md">{formatArtistName(currentTrack.artist)}</h2>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex items-center gap-3 text-xs font-medium text-white/50">
            <span className="min-w-[40px] text-right font-medium">{formatTime((progress / 100) * (duration || 0))}</span>
            <LiquidSeekBar 
              value={progress / 100} 
              onChange={handleSeekChange} 
              onDragEnd={handleSeekEnd} 
              className={`flex-1 ${role === 'listener' ? 'pointer-events-none' : ''}`}
              isAnimated={isPlaying && !isSeeking}
            />
            <span className="min-w-[40px] text-left font-medium text-white/50">{formatTime(duration || 0)}</span>
          </div>

          {/* Main Playback Controls */}
          <div className="flex items-center justify-between w-full px-2">
            <button 
              onClick={toggleShuffle} 
              disabled={role === 'listener'}
              className={`transition-colors active:scale-95 disabled:opacity-50 ${isShuffle ? 'text-primary' : 'text-white/70'}`}
            >
              <Shuffle size={24} />
            </button>
            <button 
              onClick={prevTrack} 
              disabled={role === 'listener'} 
              className="text-white hover:text-white/80 active:scale-95 transition-colors disabled:opacity-50"
            >
              <SkipBack size={36} fill="currentColor" />
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
              className="text-white hover:text-white/80 active:scale-95 transition-colors disabled:opacity-50"
            >
              <SkipForward size={36} fill="currentColor" />
            </button>
            <button 
              onClick={cycleRepeatMode} 
              disabled={role === 'listener'}
              className={`transition-colors active:scale-95 disabled:opacity-50 ${repeatMode !== 'none' ? 'text-primary' : 'text-white/70'}`}
            >
              {repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}
            </button>
          </div>

          {/* Secondary Controls Row */}
          {role !== 'listener' && (
            <div className="flex items-center justify-between w-full px-4 pt-2 text-white/60">
              <button onClick={() => setShowSleepTimerMenu(true)} className={`hover:text-white transition-colors active:scale-95 ${sleepTimer.type ? 'text-primary' : ''}`}>
                <Moon size={20} />
              </button>
              <button onClick={handleRewind} className="hover:text-white transition-colors active:scale-95 relative flex items-center justify-center">
                <RotateCcw size={20} />
                <span className="absolute text-[8px] font-bold mt-0.5">15</span>
              </button>
              <button onClick={cyclePlaybackRate} className={`hover:text-white transition-colors active:scale-95 font-bold text-sm tracking-wider ${playbackRate !== 1 ? 'text-primary' : ''}`}>
                {playbackRate}x
              </button>
              <button onClick={handleFastForward} className="hover:text-white transition-colors active:scale-95 relative flex items-center justify-center">
                <RotateCw size={20} />
                <span className="absolute text-[8px] font-bold mt-0.5">30</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Very Bottom: Navigation Tabs */}
      <div className="relative z-10 w-full h-[72px] flex-shrink-0 bg-black/40 backdrop-blur-md transform-gpu will-change-transform border-t border-white/5 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        <button onClick={() => setActiveTab('player')} className={`p-3 rounded-full transition-colors ${activeTab === 'player' ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white/80'}`}>
          <Music size={24} />
        </button>
        <button onClick={() => setActiveTab('queue')} className={`p-3 rounded-full transition-colors ${activeTab === 'queue' ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white/80'}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="6" x2="21" y2="6"></line>
            <line x1="12" y1="12" x2="21" y2="12"></line>
            <line x1="12" y1="18" x2="21" y2="18"></line>
            <polygon points="3 5 9 8.5 3 12 3 5" fill="currentColor" stroke="none"></polygon>
          </svg>
        </button>
        <button onClick={() => setActiveTab('lyrics')} className={`p-3 rounded-full transition-colors ${activeTab === 'lyrics' ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white/80'}`}>
          <MessageSquareQuote size={24} />
        </button>
      </div>

      {/* Sleep Timer Modal */}
      {showSleepTimerMenu && (
        <div className="absolute inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:w-[400px] bg-background/90 backdrop-blur-xl transform-gpu border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-2 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Moon size={24} className="text-primary" />
                {t('player.sleepTimer', { defaultValue: 'Sleep Timer' })}
              </h3>
              <button onClick={() => setShowSleepTimerMenu(false)} className="p-2 text-white/50 hover:text-white transition-colors rounded-full active:scale-95">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <button onClick={() => handleSetSleepTimer(15)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between items-center text-white">
              <span>{t('player.timer.15m', { defaultValue: '15 Minutes' })}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) <= 15 && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 0 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer(30)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between items-center text-white">
              <span>{t('player.timer.30m', { defaultValue: '30 Minutes' })}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 15 && Math.round((sleepTimer.endTime - Date.now()) / 60000) <= 30 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer(60)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between items-center text-white">
              <span>{t('player.timer.60m', { defaultValue: '1 Hour' })}</span>
              {sleepTimer.type === 'time' && sleepTimer.endTime && Math.round((sleepTimer.endTime - Date.now()) / 60000) > 30 && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <button onClick={() => handleSetSleepTimer('track_end')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between items-center text-white">
              <span>{t('player.timer.trackEnd', { defaultValue: 'End of Track' })}</span>
              {sleepTimer.type === 'track_end' && <span className="w-2 h-2 rounded-full bg-primary" />}
            </button>
            <div className="w-full h-px bg-white/10 my-2" />
            <button onClick={() => handleSetSleepTimer(null)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 transition-colors flex justify-between items-center text-red-400">
              <span>{t('player.timer.off', { defaultValue: 'Turn Off' })}</span>
            </button>
          </div>
          <div className="absolute inset-0 z-[-1]" onClick={() => setShowSleepTimerMenu(false)} />
        </div>
      )}

      {/* Session Menu Modal */}
      {showSessionMenu && (
        <div className="absolute inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:w-[400px] bg-background/90 backdrop-blur-xl transform-gpu border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Users size={24} className="text-primary" />
                {t('jam.session', { defaultValue: 'Jam Session' })}
              </h3>
              <button onClick={() => setShowSessionMenu(false)} className="p-2 text-white/50 hover:text-white transition-colors rounded-full active:scale-95">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <JamSessionControl hideCreate={true} />
            
          </div>
          <div className="absolute inset-0 z-[-1]" onClick={() => setShowSessionMenu(false)} />
        </div>
      )}
    </div>
  );
}
