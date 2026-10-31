import { useState, useMemo } from 'react';
import { 
  ChevronDown, 
  Music, Users, MessageSquareQuote
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
import { 
  SeekControls, 
  PlaybackRateButton, 
  SleepTimerMenu, 
  SleepTimerButton, 
  PlayerTransportBar 
} from './controls';

export default function MobileJamPlayerUI({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { 
    queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, 
    role, isShuffle, toggleShuffle, 
    repeatMode, cycleRepeatMode, playbackRate, cyclePlaybackRate, 
    sleepTimer, roomId
  } = usePlayerStore();
  const { progress, buffered, duration, isSeeking, handleSeekChange, handleSeekEnd } = useAudioStore();
  
  const currentTrack = queue[currentIndex];
  
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'lyrics'>('player');
  const [showSleepTimerMenu, setShowSleepTimerMenu] = useState(false);
  const [showSessionMenu, setShowSessionMenu] = useState(false);

  // Check if standalone
  const searchParams = new URLSearchParams(window.location.search);
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const isStandalonePath = window.location.pathname.startsWith('/jam/track/') ||
                           window.location.pathname.startsWith('/jam/album/') ||
                           window.location.pathname.startsWith('/jam/playlist/');
  const isStandalone = isJamRoute && (isStandaloneQuery || isStandalonePath) && !roomId;



  // oxlint-disable-next-line
  const coverArtHighRes = useMemo(() => {
    if (!currentTrack) return '';
    const cover = currentTrack.coverArt || currentTrack.id;
    if (cover.startsWith('http')) {
      return cover.replace(/([?&])size=\d+&?/, (m, p1) => m.endsWith('&') ? p1 : '').replace(/&$/, '') + (cover.includes('?') ? '&size=1000' : '?size=1000');
    }
    return cover.startsWith('capacitor://') || cover.startsWith('asset://') || cover.startsWith('blob:') || cover.startsWith('file://') ? cover : getCoverArtUrl(cover, 1000);
  }, [currentTrack?.id, currentTrack?.coverArt]);

  const coverArtLowRes = useMemo(() => {
    if (!currentTrack) return '';
    const cover = currentTrack.coverArt || currentTrack.id;
    if (cover.startsWith('http')) {
      return cover.replace(/([?&])size=\d+&?/, (m, p1) => m.endsWith('&') ? p1 : '').replace(/&$/, '') + (cover.includes('?') ? '&size=120' : '?size=120');
    }
    return cover.startsWith('capacitor://') || cover.startsWith('asset://') || cover.startsWith('blob:') || cover.startsWith('file://') ? cover : getCoverArtUrl(cover, 120);
  }, [currentTrack?.id, currentTrack?.coverArt]);

  const handlePlayPause = () => {
    if (role === 'listener') return; 
    setIsPlaying(!isPlaying);
  };

  if (!currentTrack) return null;


  const showMinimizeButton = role !== 'listener' && !isStandalone;
  const showSessionButton = !isStandalone;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-background flex flex-col text-foreground overflow-hidden z-[100] animate-in slide-in-from-bottom-full fade-in-0 duration-300">
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[60px] opacity-60 saturate-150 scale-110 transform-gpu will-change-transform"
        style={{ backgroundImage: coverArtLowRes ? `url("${coverArtLowRes}")` : undefined }}
      />
      <div className="absolute inset-0 z-0 bg-background/40" />

      <div className="relative z-10 flex items-center justify-between px-4 py-4 w-full">
        {showMinimizeButton ? (
          <button 
            onClick={onClose}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95"
          >
            <ChevronDown size={28} />
          </button>
        ) : (
          <div className="w-11" /> // Placeholder for alignment
        )}
        <span className="text-foreground font-bold text-sm tracking-wider">
          {t('player.now_playing')}
        </span>
        {showSessionButton ? (
          <button 
            onClick={() => setShowSessionMenu(true)}
            className="p-2 text-secondary hover:bg-foreground/10 rounded-full transition-colors active:scale-95"
          >
            <Users size={24} />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6 w-full max-w-md mx-auto min-h-0 overflow-y-auto hide-scrollbar">
        
        <div className="w-full flex-1 flex flex-col justify-center min-h-0 overflow-hidden mb-6 mt-2">
          {activeTab === 'player' && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="h-full max-h-full max-w-full aspect-square">
                <TrackImage src={coverArtHighRes} className="w-full h-full rounded-3xl shadow-2xl object-cover border border-border bg-background/20" alt={currentTrack.title} />
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

        <div className="w-full flex flex-col gap-6 mt-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden mr-4">
              <h1 className="text-2xl font-bold text-foreground truncate drop-shadow-md">{currentTrack.title}</h1>
              <h2 className="text-base text-secondary truncate drop-shadow-md">{formatArtistName(currentTrack.artist)}</h2>
            </div>
          </div>

          <div className="w-full flex items-center gap-3 text-xs font-medium text-secondary">
            <span className="min-w-[40px] text-right font-medium">{formatTime((progress / 100) * (duration || 0))}</span>
            <LiquidSeekBar 
              value={progress / 100} 
              buffered={buffered / 100}
              onChange={handleSeekChange} 
              onDragEnd={handleSeekEnd} 
              className={`flex-1 ${role === 'listener' ? 'pointer-events-none' : ''}`}
              isAnimated={isPlaying && !isSeeking}
            />
            <span className="min-w-[40px] text-left font-medium text-secondary">{formatTime(duration || 0)}</span>
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

          {role !== 'listener' && (
            <div className="flex items-center justify-between w-full px-4 pt-2 text-secondary">
              <SleepTimerButton 
                onClick={() => setShowSleepTimerMenu(true)} 
                isActive={!!sleepTimer.type} 
              />
              <SeekControls currentTrack={currentTrack} role={role}>
                <PlaybackRateButton 
                  playbackRate={playbackRate} 
                  onCycle={cyclePlaybackRate}  
                />
              </SeekControls>
            </div>
          )}
        </div>
      </div>

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
        <button onClick={() => setActiveTab('lyrics')} className={`p-3 rounded-full transition-colors ${activeTab === 'lyrics' ? 'text-primary bg-primary/10' : 'text-secondary hover:text-secondary'}`}>
          <MessageSquareQuote size={24} />
        </button>
      </div>

      <SleepTimerMenu 
        isOpen={showSleepTimerMenu} 
        onClose={() => setShowSleepTimerMenu(false)} 
      />

      {showSessionMenu && (
        <div className="absolute inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            className="w-full sm:w-[400px] bg-background/90 backdrop-blur-xl transform-gpu border border-border rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-4 animate-in slide-in-from-bottom-10 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users size={24} className="text-primary" />
                {t('jam.session')}
              </h3>
              <button onClick={() => setShowSessionMenu(false)} className="p-2 text-secondary hover:text-foreground transition-colors rounded-full active:scale-95">
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
