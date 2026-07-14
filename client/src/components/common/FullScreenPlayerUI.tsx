import { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { Play, ChevronDown } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from './TrackImage';
import AudioVisualizer from './AudioVisualizer';
import { useLyricsSync } from '../../hooks/useLyricsSync';
import { useSimilarTracks } from '../../hooks/useSimilarTracks';

export default function FullScreenPlayerUI({ 
  onClose,
  extraControls
}: { 
  onClose?: () => void,
  extraControls?: React.ReactNode
}) {
  const { queue, currentIndex, setQueueAndPlay, role } = usePlayerStore();
  const currentTrack = queue[currentIndex];
  const { audioElement } = useAudioStore();
  const [activeTab, setActiveTab] = useState<'queue' | 'similar' | 'lyrics' | 'visualizer'>('lyrics');
  
  const isJamRoute = window.location.pathname.startsWith('/jam');
  const searchParams = new URLSearchParams(window.location.search);
  const isStandalone = isJamRoute && !!searchParams.get('track');
  const readOnlyControls = isJamRoute && role === 'listener';
  
  const queueContainerRef = useRef<HTMLDivElement>(null);
  
  const coverArtHighRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 1000) : '', [currentTrack?.id]);
  const coverArtLowRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 300) : '', [currentTrack?.id]);

  const {
    lyricsText,
    lrcLines,
    loadingLyrics,
    activeLyricIndex,
    isUserScrolled,
    lyricsContainerRef,
    handleUserScroll,
    forceSync,
    setIsUserScrolled
  } = useLyricsSync(currentTrack, audioElement, activeTab === 'lyrics');

  const { similarTracks } = useSimilarTracks(currentTrack?.id);

  useEffect(() => {
    if (activeTab === 'queue' && queueContainerRef.current) {
      const activeElement = queueContainerRef.current.children[currentIndex] as HTMLElement;
      const container = queueContainerRef.current.closest('.overflow-y-auto') as HTMLElement;
      if (activeElement && container) {
        container.scrollTo({
          top: activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2),
          behavior: 'auto' // instant jump for queue
        });
      }
    }
  }, [activeTab, currentIndex]);

  const displayTrack = currentTrack || {
    id: 'empty',
    title: 'Ожидание трека...',
    artist: 'Пока ничего не играет',
    album: '',
    coverArt: '',
    duration: 0
  };

  return (
    <div className={`absolute inset-0 bg-background flex text-foreground overflow-hidden ${onClose ? 'z-[100] animate-in slide-in-from-bottom-full fade-in-0 duration-500 ease-out' : 'z-10'}`}>
      
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[80px] opacity-80 saturate-150 scale-110 transition-all duration-1000"
        style={{ backgroundImage: `url(${coverArtLowRes})` }}
      />
      
      <div className="absolute inset-0 z-0 bg-black/20" />

      {/* Top Bar for close button & extra controls */}
      <div className="absolute top-0 left-0 right-0 p-6 z-50 flex justify-between items-start pointer-events-none">
        <div className="flex-1 pointer-events-auto flex items-center gap-4">
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10 shadow-lg"
              title="Закрыть"
            >
              <ChevronDown size={28} className="text-white" />
            </button>
          )}
          {!onClose && isJamRoute && (role === 'host' || role === 'cohost') && (
            <button 
              onClick={() => usePlayerStore.getState().setIsMinimized(true)}
              className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10 shadow-lg"
              title="Свернуть окно сессии"
            >
              <ChevronDown size={28} className="text-white" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto">
          {extraControls}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full h-full p-10 gap-16 pt-24 pb-20 items-stretch justify-center max-w-[1600px] mx-auto">
        
        {/* Left: Large Cover & Info */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-[600px]">
          <div className="w-full aspect-square max-w-[500px] rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] mb-10 border border-white/20 bg-muted">
            <TrackImage src={coverArtHighRes} className="w-full h-full object-cover" alt={displayTrack.title} />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-3 text-center drop-shadow-xl leading-tight text-white">{displayTrack.title}</h1>
          <h2 className="text-2xl text-white/70 mb-2 text-center drop-shadow-lg font-medium">{formatArtistName(displayTrack.artist)}</h2>
          <p className="text-base text-white/40 mb-8 text-center drop-shadow">{displayTrack.album || 'Unknown Album'}</p>
          
          <div className="flex gap-4">
            <span className="px-4 py-1.5 bg-primary/20 text-primary rounded-full text-xs font-bold tracking-widest border border-primary/30 backdrop-blur-md shadow-lg">MP3</span>
            <span className="px-4 py-1.5 bg-primary/20 text-primary rounded-full text-xs font-bold tracking-widest border border-primary/30 backdrop-blur-md shadow-lg">320kbps</span>
          </div>
        </div>

        {/* Right: Tabs and Content */}
        <div className="flex-1 h-full w-full max-w-[800px] flex flex-col bg-white/10 rounded-3xl border border-white/20 backdrop-blur-2xl overflow-hidden shadow-2xl relative">
          
          {/* Sync Button Floating Over Lyrics */}
          {activeTab === 'lyrics' && isUserScrolled && lrcLines.length > 0 && (
            <button 
              onClick={forceSync}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 px-8 py-3 bg-primary text-background rounded-full font-bold shadow-[0_10px_30px_rgba(29,185,84,0.4)] hover:scale-105 hover:bg-primary/90 transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in flex items-center gap-2"
            >
              Синхронизировать
            </button>
          )}
          
          {/* Pill-shaped Tabs */}
          <div className="flex items-center justify-center gap-2 px-6 py-6 border-b border-white/10 text-sm font-bold tracking-wider text-white/60">
            <button 
              onClick={() => setActiveTab('queue')}
              className={`transition-all rounded-full px-5 py-2 ${activeTab === 'queue' ? 'bg-primary text-background shadow-md' : 'hover:bg-white/10 hover:text-white'}`}
            >
              Очередь
            </button>
            {!isStandalone && (
              <button 
                onClick={() => setActiveTab('similar')}
                className={`transition-all rounded-full px-5 py-2 ${activeTab === 'similar' ? 'bg-primary text-background shadow-md' : 'hover:bg-white/10 hover:text-white'}`}
              >
                Похожие
              </button>
            )}
            <button 
              onClick={() => setActiveTab('lyrics')}
              className={`transition-all rounded-full px-5 py-2 ${activeTab === 'lyrics' ? 'bg-primary text-background shadow-md' : 'hover:bg-white/10 hover:text-white'}`}
            >
              Слова
            </button>
            <button 
              onClick={() => setActiveTab('visualizer')}
              className={`transition-all rounded-full px-5 py-2 ${activeTab === 'visualizer' ? 'bg-primary text-background shadow-md' : 'hover:bg-white/10 hover:text-white'}`}
            >
              Визуализатор
            </button>
          </div>

          {/* Content Area */}
          <div 
            className="flex-1 overflow-y-auto custom-scrollbar p-6 relative"
            onScroll={() => {
              if (activeTab === 'lyrics') {
                handleUserScroll();
              }
            }}
          >
            
            {activeTab === 'lyrics' && (
              <div className="h-full flex flex-col items-center justify-start text-center max-w-[600px] mx-auto py-10 relative">
                {loadingLyrics ? (
                  <p className="text-white/50 animate-pulse text-lg">Загрузка текста...</p>
                ) : lrcLines.length > 0 ? (
                  <div ref={lyricsContainerRef} className="flex flex-col gap-6 pt-[350px] pb-[350px] w-full transition-all duration-300">
                    {lrcLines.map((line, idx) => {
                      const isActive = idx === activeLyricIndex;
                      const isPast = idx < activeLyricIndex;
                      
                      if (line.isInterlude) {
                        return (
                          <div key={idx} className={`flex justify-center items-center gap-4 transition-all duration-500 py-6 ${isActive ? 'scale-110' : 'opacity-40'}`}>
                            {[0, 1, 2].map(i => (
                              <div key={i} className="w-3 h-3 rounded-full bg-white/20 relative overflow-hidden shadow-inner">
                                <div 
                                  className="absolute inset-0 bg-primary transition-opacity duration-100"
                                  style={{ 
                                    opacity: isActive ? `calc((var(--interlude-progress, 0) - ${i * 0.33}) * 3)` : 0
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )
                      }
                      
                      return (
                        <div 
                          key={idx} 
                          className={`text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight transition-all duration-500 cursor-pointer px-4 ${
                            isActive 
                              ? 'text-primary scale-110 drop-shadow-[0_0_15px_rgba(29,185,84,0.5)]' 
                              : isPast 
                                ? 'text-white/40' 
                                : 'text-white/30 hover:text-white/50'
                          }`}
                          onClick={() => {
                            if (audioElement) audioElement.currentTime = line.time;
                            setIsUserScrolled(false); // Snap back to sync mode when user clicks a line
                          }}
                        >
                          {line.text}
                        </div>
                      )
                    })}
                  </div>
                ) : lyricsText ? (
                  <div className="w-full flex flex-col items-center gap-5 pb-32 pt-10 px-4 text-center">
                    {lyricsText.split('\n').map((line, idx) => {
                      const text = line.trim();
                      if (!text) return <div key={idx} className="h-2" />; // gap
                      
                      const isSectionHeader = (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('(') && text.endsWith(')'));
                      
                      return (
                        <div 
                          key={idx}
                          className={`${
                            isSectionHeader 
                              ? 'text-sm md:text-base font-bold text-primary tracking-[0.2em] uppercase mt-8 mb-2 opacity-80 drop-shadow-md' 
                              : 'text-2xl md:text-3xl font-bold tracking-tight text-white/70 hover:text-white transition-colors cursor-default'
                          }`}
                        >
                          {text}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-white/40 text-lg flex flex-col items-center gap-4 mt-20">
                    <p>Текст песни не найден</p>
                    <p className="text-sm">Provided by My Server</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'queue' && (
              <div ref={queueContainerRef} className="space-y-2">
                {queue.map((track, idx) => {
                  const isPlayingQueue = idx === currentIndex;
                  return (
                    <div 
                      key={idx} 
                      className={`flex items-center px-4 py-3 rounded-xl transition-colors ${isPlayingQueue ? 'bg-primary/20 shadow-sm border border-primary/30' : 'hover:bg-white/10 cursor-pointer'}`}
                      onDoubleClick={() => !readOnlyControls && setQueueAndPlay(queue, idx)}
                    >
                      <div className="w-8 flex justify-center text-white/50 text-sm font-medium">
                        {isPlayingQueue ? <Play size={14} className="text-primary" fill="currentColor" /> : idx + 1}
                      </div>
                      <div className="w-12 h-12 flex-shrink-0 mx-4 rounded-lg overflow-hidden shadow-md">
                        <TrackImage src={getCoverArtUrl(track.id, 100)} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <p className={`truncate text-base font-semibold ${isPlayingQueue ? 'text-primary drop-shadow-md' : 'text-white/90'}`}>{track.title}</p>
                        <p className="truncate text-sm text-white/60">{formatArtistName(track.artist)}</p>
                      </div>
                      <div className="w-16 text-sm text-white/50 flex justify-end font-medium">
                        {formatTime(track.duration)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'similar' && (
              <div className="space-y-2">
                {similarTracks.length > 0 ? similarTracks.map((track, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center px-4 py-3 rounded-xl transition-colors hover:bg-white/10 cursor-pointer"
                    onDoubleClick={() => !readOnlyControls && setQueueAndPlay(similarTracks, idx)}
                  >
                    <div className="w-12 h-12 flex-shrink-0 mr-4 rounded-lg overflow-hidden shadow-md">
                      <TrackImage src={track.coverArt} className="w-full h-full object-cover" alt="" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="truncate text-base font-semibold text-white/90">{track.title}</p>
                      <p className="truncate text-sm text-white/60">{formatArtistName(track.artist)}</p>
                    </div>
                    <div className="w-16 text-sm text-white/50 flex justify-end font-medium">
                      {formatTime(track.duration)}
                    </div>
                  </div>
                )) : (
                  <div className="text-white/40 text-lg flex flex-col items-center mt-20 font-medium">
                    Похожие треки не найдены
                  </div>
                )}
              </div>
            )}

            {activeTab === 'visualizer' && (
              <AudioVisualizer />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
