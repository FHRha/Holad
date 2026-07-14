import { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { useAudioStore } from '../../store/audioStore';
import { Play, ChevronDown } from 'lucide-react';
import { getCoverArtUrl, getLyrics, getSimilarSongs, getLyricsBySongId } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from './TrackImage';
import AudioVisualizer from './AudioVisualizer';

interface LyricLine {
  time: number;
  text: string;
  isInterlude?: boolean;
}

function injectInterludes(lines: LyricLine[]): LyricLine[] {
  const result: LyricLine[] = [];
  
  // Check for intro interlude
  if (lines.length > 0 && lines[0].time >= 7) {
    result.push({
      time: Math.max(0, lines[0].time - 3), // Start up to 3 seconds before first line
      text: '...',
      isInterlude: true
    });
  }

  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    if (i < lines.length - 1) {
      const curr = lines[i];
      const next = lines[i + 1];
      const gap = next.time - curr.time;
      if (gap >= 7) { // If gap is >= 7 seconds
        result.push({
          time: next.time - 3, // Start the dots exactly 3 seconds BEFORE the next line starts!
          text: '...',
          isInterlude: true
        });
      }
    }
  }
  return result;
}

function parseLRC(lrc: string): LyricLine[] {
  const lines = lrc.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{2}):(\d{2})(?:[:\.](\d{1,3}))?\](.*)/;

  lines.forEach(line => {
    const match = regex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3], 10) : 0;
      const milliseconds = match[3] ? (match[3].length === 1 ? ms * 100 : match[3].length === 2 ? ms * 10 : ms) : 0;
      const time = minutes * 60 + seconds + milliseconds / 1000;
      const text = match[4].trim();
      if (text) {
        result.push({ time, text });
      }
    }
  });

  return injectInterludes(result.sort((a, b) => a.time - b.time));
}

export default function NowPlayingModal() {
  const { isNowPlayingOpen, setNowPlayingOpen } = useUIStore();
  const { queue, currentIndex, setQueueAndPlay } = usePlayerStore();
  const { audioElement } = useAudioStore();
  const [activeTab, setActiveTab] = useState<'queue' | 'similar' | 'lyrics' | 'visualizer'>('lyrics');
  
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lrcLines, setLrcLines] = useState<LyricLine[]>([]);
  const [similarTracks, setSimilarTracks] = useState<Track[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  const isAutoScrolling = useRef(false);
  const autoScrollTimeoutRef = useRef<number | null>(null);
  
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const queueContainerRef = useRef<HTMLDivElement>(null);
  
  const currentTrack = queue[currentIndex];

  const coverArtHighRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 1000) : '', [currentTrack?.id]);
  const coverArtLowRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.id, 300) : '', [currentTrack?.id]);


  useEffect(() => {
    if (isNowPlayingOpen && currentTrack) {
      setLoadingLyrics(true);
      setLyricsText(null);
      setLrcLines([]);
      
      // Fetch Lyrics
      getLyricsBySongId(currentTrack.id).then(structuredLine => {
        if (structuredLine && structuredLine.length > 0) {
          const parsed = structuredLine.map((l: any) => ({
            time: (l.start || 0) / 1000,
            text: l.value || ''
          }));
          setLrcLines(injectInterludes(parsed));
          setLoadingLyrics(false);
        } else {
          // Fallback to plain text getLyrics
          getLyrics(currentTrack.artist, currentTrack.title).then(lyric => {
            if (lyric) {
              const parsedLrc = parseLRC(lyric);
              if (parsedLrc.length > 0) {
                setLrcLines(parsedLrc);
              } else {
                setLyricsText(lyric);
              }
            }
            setLoadingLyrics(false);
          });
        }
      });

      // Fetch Similar Songs
      getSimilarSongs(currentTrack.id).then(songs => {
        const mapped = songs.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
          duration: t.duration
        }));
        setSimilarTracks(mapped);
      });
    }
    // Reset scroll state on new track
    setIsUserScrolled(false);
  }, [currentTrack, isNowPlayingOpen]);

  // Karaoke Loop
  useEffect(() => {
    if (!audioElement || lrcLines.length === 0 || activeTab !== 'lyrics' || !isNowPlayingOpen) return;
    
    let rafId: number;
    let lastActiveIndex = activeLyricIndex;

    const updateCurrentLyric = () => {
      const currentTime = audioElement.currentTime;
      let newIndex = -1;
      for (let i = 0; i < lrcLines.length; i++) {
        if (currentTime >= lrcLines[i].time) {
          newIndex = i;
        } else {
          break;
        }
      }
      
      if (newIndex !== -1 && lrcLines[newIndex].isInterlude) {
        const line = lrcLines[newIndex];
        const nextLine = lrcLines[newIndex + 1];
        if (nextLine && lyricsContainerRef.current) {
          const progress = Math.max(0, Math.min(1, (currentTime - line.time) / (nextLine.time - line.time)));
          lyricsContainerRef.current.style.setProperty('--interlude-progress', progress.toString());
        }
      }

      if (newIndex !== lastActiveIndex) {
        lastActiveIndex = newIndex;
        setActiveLyricIndex(newIndex);
        
        if (lyricsContainerRef.current) {
          const activeElement = lyricsContainerRef.current.children[newIndex] as HTMLElement;
          const container = lyricsContainerRef.current.closest('.overflow-y-auto') as HTMLElement;
          if (activeElement && container) {
            // Only auto-scroll if the user hasn't manually scrolled
            if (!isUserScrolled) {
              isAutoScrolling.current = true;
              if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
              
              container.scrollTo({
                top: activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2),
                behavior: 'smooth'
              });
              
              autoScrollTimeoutRef.current = setTimeout(() => {
                isAutoScrolling.current = false;
              }, 1500) as unknown as number; // 1.5s should cover long smooth scrolls
            }
          }
        }
      }
      rafId = requestAnimationFrame(updateCurrentLyric);
    };
    
    rafId = requestAnimationFrame(updateCurrentLyric);
    return () => cancelAnimationFrame(rafId);
  }, [audioElement, lrcLines, activeTab, isNowPlayingOpen]); // intentional omit activeLyricIndex to avoid infinite re-bind

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
    } else if (activeTab === 'lyrics' && lyricsContainerRef.current && activeLyricIndex !== -1) {
      const activeElement = lyricsContainerRef.current.children[activeLyricIndex] as HTMLElement;
      const container = lyricsContainerRef.current.closest('.overflow-y-auto') as HTMLElement;
      if (activeElement && container && !isUserScrolled) {
        isAutoScrolling.current = true;
        if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
        
        container.scrollTo({
          top: activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2),
          behavior: 'smooth'
        });
        
        autoScrollTimeoutRef.current = setTimeout(() => {
          isAutoScrolling.current = false;
        }, 1500) as unknown as number;
      }
    }
  }, [activeTab, currentIndex]); // Removed activeLyricIndex from dependency array so it doesn't trigger on every lyric change

  if (!isNowPlayingOpen || !currentTrack) return null;

  return (
    <div className="absolute inset-0 z-[100] bg-background flex text-foreground overflow-hidden animate-in slide-in-from-bottom-full fade-in-0 duration-500 ease-out">
      
      {/* Blurred Background */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center blur-[80px] opacity-80 saturate-150 scale-110 transition-all duration-1000"
        style={{ backgroundImage: `url(${coverArtLowRes})` }}
      />
      
      <div className="absolute inset-0 z-0 bg-black/20" />

      {/* Top Bar for close button */}
      <div className="absolute top-0 left-0 right-0 p-6 z-50 flex justify-start">
        <button 
          onClick={() => setNowPlayingOpen(false)}
          className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10 shadow-lg"
        >
          <ChevronDown size={28} className="text-white" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 flex w-full h-full p-10 gap-16 pt-24 pb-20 items-stretch justify-center max-w-[1600px] mx-auto">
        
        {/* Left: Large Cover & Info */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-[600px]">
          <div className="w-full aspect-square max-w-[500px] rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)] mb-10 border border-white/20 bg-muted">
            <TrackImage src={coverArtHighRes} className="w-full h-full object-cover" alt={currentTrack.title} />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-3 text-center drop-shadow-xl leading-tight text-white">{currentTrack.title}</h1>
          <h2 className="text-2xl text-white/70 mb-2 text-center drop-shadow-lg font-medium">{formatArtistName(currentTrack.artist)}</h2>
          <p className="text-base text-white/40 mb-8 text-center drop-shadow">{currentTrack.album || 'Unknown Album'}</p>
          
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
              onClick={() => {
                setIsUserScrolled(false);
                // Force a scroll immediately
                if (lyricsContainerRef.current) {
                  const activeElement = lyricsContainerRef.current.children[activeLyricIndex] as HTMLElement;
                  const container = lyricsContainerRef.current.closest('.overflow-y-auto') as HTMLElement;
                  if (activeElement && container) {
                    isAutoScrolling.current = true;
                    if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
                    
                    container.scrollTo({
                      top: activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2),
                      behavior: 'smooth'
                    });
                    
                    autoScrollTimeoutRef.current = setTimeout(() => isAutoScrolling.current = false, 1500) as unknown as number;
                  }
                }
              }}
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
            <button 
              onClick={() => setActiveTab('similar')}
              className={`transition-all rounded-full px-5 py-2 ${activeTab === 'similar' ? 'bg-primary text-background shadow-md' : 'hover:bg-white/10 hover:text-white'}`}
            >
              Похожие
            </button>
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
                if (isAutoScrolling.current) {
                  // If we are currently auto-scrolling, keep extending the timeout 
                  // to prevent it from ending while scroll is still happening
                  if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
                  autoScrollTimeoutRef.current = setTimeout(() => {
                    isAutoScrolling.current = false;
                  }, 200) as unknown as number;
                } else {
                  setIsUserScrolled(true);
                }
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
                  <div className="whitespace-pre-wrap text-xl md:text-2xl font-medium leading-[2.5] tracking-wide text-white/90">
                    {lyricsText}
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
                      className={`flex items-center px-4 py-3 rounded-xl transition-colors cursor-pointer ${isPlayingQueue ? 'bg-primary/20 shadow-lg border border-primary/30' : 'hover:bg-white/10'}`}
                      onDoubleClick={() => setQueueAndPlay(queue, idx)}
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
                    onDoubleClick={() => setQueueAndPlay(similarTracks, idx)}
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
