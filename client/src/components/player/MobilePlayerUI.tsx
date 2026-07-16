import { useState, useEffect, useMemo } from 'react';
import { 
  ChevronDown, MoreHorizontal, Heart, Shuffle, SkipBack, 
  Play, Pause, SkipForward, Repeat, Repeat1, Moon, 
  Bookmark, Music, Info, MessageSquareQuote, RotateCcw, RotateCw 
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

export default function MobilePlayerUI({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { 
    queue, currentIndex, isPlaying, setIsPlaying, nextTrack, prevTrack, 
    role, likedTrackIds, toggleTrackLike, isShuffle, toggleShuffle, 
    repeatMode, cycleRepeatMode
  } = usePlayerStore();
  const { audioElement } = useAudioStore();
  const { openMenu } = useContextMenuStore();
  
  const currentTrack = queue[currentIndex];
  
  const [activeTab, setActiveTab] = useState<'player' | 'queue' | 'info' | 'lyrics'>('player');
  const [progress, setProgress] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const coverArtHighRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 1000) : '', [currentTrack?.id]);
  const coverArtLowRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 300) : '', [currentTrack?.id]);

  useEffect(() => {
    if (!audioElement || isSeeking) return;

    const updateProgress = () => {
      if (currentTrack?.duration) {
        setProgress((audioElement.currentTime / currentTrack.duration) * 100);
      }
    };

    audioElement.addEventListener('timeupdate', updateProgress);
    return () => audioElement.removeEventListener('timeupdate', updateProgress);
  }, [audioElement, currentTrack, isSeeking]);

  const handleSeekChange = (val: number) => {
    setIsSeeking(true);
    setProgress(val * 100);
  };

  const handleSeekEnd = (val: number) => {
    if (audioElement && currentTrack) {
      audioElement.currentTime = val * currentTrack.duration;
    }
    setIsSeeking(false);
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

  if (!currentTrack) return null;

  const isLiked = likedTrackIds.includes(currentTrack.id);
  const currentTime = (progress / 100) * currentTrack.duration;

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-background flex flex-col text-foreground overflow-hidden z-[100] animate-in slide-in-from-bottom-full fade-in-0 duration-300">
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[60px] opacity-60 saturate-150 scale-110"
        style={{ backgroundImage: `url(${coverArtLowRes})` }}
      />
      <div className="absolute inset-0 z-0 bg-black/40" />

      {/* Top Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 py-4 w-full">
        <button 
          onClick={onClose}
          className="p-2 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95"
        >
          <ChevronDown size={28} />
        </button>
        <span className="text-white font-bold text-sm tracking-wider">
          {t('player.now_playing', { defaultValue: 'Играет' })}
        </span>
        <button 
          onClick={(e) => openMenu(e.clientX, e.clientY, currentTrack, 'track')}
          className="p-2 text-white hover:bg-white/10 rounded-full transition-colors active:scale-95"
        >
          <MoreHorizontal size={24} />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-6 pb-6 w-full max-w-md mx-auto min-h-0 overflow-y-auto hide-scrollbar">
        
        {/* Conditional Content based on Active Tab */}
        <div className="w-full flex-1 flex flex-col justify-center min-h-[40vh] my-auto">
          {activeTab === 'player' && (
            <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl mb-8 border border-white/10 bg-black/20">
              <TrackImage src={coverArtHighRes} className="w-full h-full object-cover" alt={currentTrack.title} />
            </div>
          )}
          {activeTab === 'queue' && (
            <div className="flex-1 flex flex-col items-center justify-center text-white/50 font-medium">Очередь (в разработке)</div>
          )}
          {activeTab === 'info' && (
            <div className="flex-1 flex flex-col items-center justify-center text-white/50 font-medium">Инфо (в разработке)</div>
          )}
          {activeTab === 'lyrics' && (
            <div className="flex-1 flex flex-col items-center justify-center text-white/50 font-medium">Тексты (в разработке)</div>
          )}
        </div>

        {/* Info & Controls Section (Always visible) */}
        <div className="w-full flex flex-col gap-6">
          {/* Track Info */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden mr-4">
              <h1 className="text-2xl font-bold text-white truncate drop-shadow-md">{currentTrack.title}</h1>
              <h2 className="text-base text-white/70 truncate drop-shadow-md">{formatArtistName(currentTrack.artist)}</h2>
            </div>
            <button 
              onClick={handleLike}
              className={`p-2 rounded-full transition-colors active:scale-95 flex-shrink-0 ${isLiked ? 'text-primary' : 'text-white/70 hover:text-white'}`}
            >
              <Heart size={24} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="w-full flex flex-col gap-2">
            <LiquidSeekBar 
              value={progress / 100} 
              onChange={handleSeekChange} 
              onDragEnd={handleSeekEnd} 
              className={`w-full ${role === 'listener' ? 'pointer-events-none' : ''}`}
              isAnimated={isPlaying && !isSeeking}
            />
            <div className="flex justify-between text-xs font-medium text-white/50">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(currentTrack.duration)}</span>
            </div>
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
          <div className="flex items-center justify-between w-full px-4 pt-2 text-white/60">
            <button className="hover:text-white transition-colors active:scale-95"><Moon size={20} /></button>
            <button className="hover:text-white transition-colors active:scale-95 relative flex items-center justify-center">
              <RotateCcw size={20} />
              <span className="absolute text-[8px] font-bold mt-0.5">15</span>
            </button>
            <button className="hover:text-white transition-colors active:scale-95 font-bold text-sm tracking-wider">1x</button>
            <button className="hover:text-white transition-colors active:scale-95 relative flex items-center justify-center">
              <RotateCw size={20} />
              <span className="absolute text-[8px] font-bold mt-0.5">30</span>
            </button>
            <button className="hover:text-white transition-colors active:scale-95"><Bookmark size={20} /></button>
          </div>
        </div>
      </div>

      {/* Very Bottom: Navigation Tabs */}
      <div className="relative z-10 w-full h-[72px] flex-shrink-0 bg-black/40 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
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
        <button onClick={() => setActiveTab('info')} className={`p-3 rounded-full transition-colors ${activeTab === 'info' ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white/80'}`}>
          <Info size={24} />
        </button>
        <button onClick={() => setActiveTab('lyrics')} className={`p-3 rounded-full transition-colors ${activeTab === 'lyrics' ? 'text-primary bg-primary/10' : 'text-white/50 hover:text-white/80'}`}>
          <MessageSquareQuote size={24} />
        </button>
      </div>
    </div>
  );
}
