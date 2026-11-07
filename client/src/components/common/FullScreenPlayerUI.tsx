import { useState, useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { Play, ChevronDown, Download, ListMusic, Radio, MessageSquareQuote, Activity, Users } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { preloadAndDecodeImage } from '../../utils/assetPreloader';
import { getCachedImageUrl } from '../../utils/imageCache';
import { StorageManager } from '../../utils/StorageManager';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

import { formatTime } from '../../utils/timeFormat';
import TrackImage from './TrackImage';
import ArtistLinks from './ArtistLinks';
import AudioVisualizer from './AudioVisualizer';
import { useLyricsSync } from '../../hooks/useLyricsSync';
import { useSimilarTracks } from '../../hooks/useSimilarTracks';
import { useTranslation } from 'react-i18next';
import LanguageSelector from './LanguageSelector';
import ThemeSelector from './ThemeSelector';
import { getAudioEngine } from '../../audio/AudioEngine';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from './dnd/SortableItem';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import JamSessionControl from '../jam/JamSessionControl';
import { jamSocket } from '../../api/socket';
import { getBasePath, isJamPath } from '../../utils/basePath';

export default function FullScreenPlayerUI({ 
  onClose,
  isClosing: externalIsClosing,
  extraControls
}: { 
  onClose?: () => void,
  isClosing?: boolean,
  extraControls?: React.ReactNode
}) {
  const { t } = useTranslation();
  const queue = usePlayerStore(state => state.queue);
  const currentIndex = usePlayerStore(state => state.currentIndex);
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const role = usePlayerStore(state => state.role);
  const roomId = usePlayerStore(state => state.roomId);
  const currentTrack = queue[currentIndex];
  const audioElement = useAudioStore(state => state.audioElement);
  const downloads = useDownloadStore(state => state.downloads);
  const openMenu = useContextMenuStore(state => state.openMenu);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'similar' | 'lyrics' | 'visualizer'>('lyrics');
  const [localIsClosing, setLocalIsClosing] = useState(false);
  const isClosing = externalIsClosing ?? localIsClosing;
  const [showJamMenu, setShowJamMenu] = useState(false);
  const jamMenuRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    if (isClosing) return;
    if (externalIsClosing !== undefined) {
      onClose?.();
    } else if (onClose) {
      setLocalIsClosing(true);
      setTimeout(() => {
        onClose();
      }, 250);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (jamMenuRef.current && !jamMenuRef.current.contains(e.target as Node)) {
        setShowJamMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const isJamRoute = isJamPath();
  const searchParams = new URLSearchParams(window.location.search);
  const isStandaloneQuery = (searchParams.has('track') && !!searchParams.get('track')) ||
                            (searchParams.has('album') && !!searchParams.get('album')) ||
                            (searchParams.has('playlist') && !!searchParams.get('playlist'));
  const base = getBasePath();
  const normPath = base && window.location.pathname.startsWith(base) ? window.location.pathname.slice(base.length) : window.location.pathname;
  const isStandalonePath = normPath.startsWith('/jam/track/') ||
                           normPath.startsWith('/jam/album/') ||
                           normPath.startsWith('/jam/playlist/');
  const isStandalone = isJamRoute && (isStandaloneQuery || isStandalonePath);
  const isListenerPage = isStandalone || (isJamRoute && role === 'listener');
  const readOnlyControls = isJamRoute && role === 'listener';
  

  
  // oxlint-disable-next-line
  const coverArtHighRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 1000) : '', [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);
  // oxlint-disable-next-line
  const coverArtLowRes = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 300) : '', [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);
  // Lightweight 120px resolution for blurred background
  // oxlint-disable-next-line
  const coverArtBg = useMemo(() => currentTrack ? getCoverArtUrl(currentTrack.coverArt || currentTrack.albumId || currentTrack.id, 120) : '', [currentTrack?.id, currentTrack?.albumId, currentTrack?.coverArt]);

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

  const [bgA, setBgA] = useState(coverArtBg);
  const [bgB, setBgB] = useState('');
  const [activeBg, setActiveBg] = useState<'A' | 'B'>('A');

  useEffect(() => {
    let isMounted = true;
    if (!currentTrack?.id) return;

    const resolveBackground = async () => {
      let candidate = '';
      try {
        const uri = await StorageManager.getLocalCoverUri(currentTrack.id);
        if (uri && isMounted) {
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
        if (activeBg === 'A') {
          if (bgA !== candidate) {
            setBgB(candidate);
            setActiveBg('B');
          }
        } else {
          if (bgB !== candidate) {
            setBgA(candidate);
            setActiveBg('A');
          }
        }
      }
    };

    resolveBackground();

    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, coverArtBg, activeBg, bgA, bgB]);

  const {
    lyricsText,
    lrcLines,
    loadingLyrics,
    activeLyricIndexRef,
    isUserScrolled,
    lyricsContainerRef,
    handleUserScroll,
    forceSync,
    setIsUserScrolled
  } = useLyricsSync(currentTrack, audioElement, activeTab === 'lyrics');

  const { similarTracks } = useSimilarTracks(currentTrack?.id);

  useEffect(() => {
    if (activeTab === 'queue' && currentIndex >= 0 && currentIndex < queue.length) {
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: currentIndex,
          align: 'center',
          behavior: 'auto'
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, currentIndex, queue.length]);

  const displayTrack = currentTrack || {
    id: 'empty',
    title: t('player.waiting_track'),
    artist: t('player.nothing_playing'),
    album: '',
    coverArt: '',
    duration: 0
  } as import('../../types').Track;

  return (
    <div 
      className={`absolute inset-0 bg-background flex text-foreground overflow-hidden z-[100] transform-gpu will-change-transform ${
        isClosing ? 'animate-fullscreen-exit pointer-events-none' : 'animate-fullscreen-enter'
      }`}
      style={{ clipPath: 'inset(0)' }}
    >
      
      {/* Blurred Background with Pure Hardware CSS Crossfade */}
      <div 
        className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
        style={{ clipPath: 'inset(0)' }}
      >
        {bgA && (
          <div 
            className="absolute inset-0 bg-cover bg-center scale-110 blur-[30px] transform-gpu will-change-transform transition-opacity duration-700 ease-in-out"
            style={{ 
              backgroundImage: `url("${bgA}")`,
              opacity: activeBg === 'A' ? 0.75 : 0
            }}
          />
        )}
        {bgB && (
          <div 
            className="absolute inset-0 bg-cover bg-center scale-110 blur-[30px] transform-gpu will-change-transform transition-opacity duration-700 ease-in-out"
            style={{ 
              backgroundImage: `url("${bgB}")`,
              opacity: activeBg === 'B' ? 0.75 : 0
            }}
          />
        )}
      </div>
      <div className="absolute inset-0 z-0 bg-black/35 pointer-events-none" />

      <div className="absolute top-0 left-0 right-0 p-6 z-50 flex justify-between items-start pointer-events-none">
        <div className="flex-1 pointer-events-auto flex items-center gap-4">
          {onClose && !isListenerPage && (
            <button 
              onClick={handleClose}
              className="p-2 bg-black/40 hover:bg-black/60 rounded-full transition-colors border border-white/10 shadow-lg"
              title={t('player.close')}
              aria-label={t('player.close')}
            >
              <ChevronDown size={28} className="text-secondary" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          {isJamRoute && (role === 'listener' || role === 'cohost') && (
            <div className="relative" ref={jamMenuRef}>
              <button 
                onClick={() => setShowJamMenu(!showJamMenu)} 
                className={`flex items-center gap-2 px-3.5 h-10 rounded-full transition-all border shadow-lg ${
                  showJamMenu 
                    ? 'bg-primary text-background border-primary' 
                    : roomId 
                      ? 'bg-primary/20 text-primary hover:bg-primary/30 border-primary/30' 
                      : 'bg-black/20 hover:bg-black/40 text-white/80 border-white/10'
                }`}
                title={t('common.jam_session')}
              >
                <Users size={18} className="shrink-0" />
                <span className="text-sm font-bold">{t('common.jam_session')}</span>
              </button>
              
              {showJamMenu && (
                <div className="absolute top-full right-0 mt-3 p-4 bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl w-80 z-[70] animate-in fade-in slide-in-from-top-2 duration-200 text-foreground">
                  <h3 className="font-bold text-center mb-1">{t('common.jam_session_title')}</h3>
                  <p className="text-xs text-secondary text-center mb-2">{t('common.jam_session_desc')}</p>
                  <JamSessionControl hideCreate={true} />
                </div>
              )}
            </div>
          )}
          {extraControls}
        </div>
      </div>

      <div className="relative z-10 flex w-full h-full p-8 md:p-10 gap-8 lg:gap-16 pt-20 md:pt-24 pb-20 items-stretch justify-center max-w-[1600px] mx-auto">
        
        <div className="flex-1 flex flex-col items-center justify-center max-w-[600px]">
          <div 
            className="w-full aspect-square max-w-[500px] rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] mb-10 border border-white/20 bg-muted transform-gpu"
          >
            <TrackImage 
              src={activeCoverSrc} 
              trackId={displayTrack.id}
              className="w-full h-full object-cover" 
              alt={displayTrack.title} 
              priority={true}
            />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-3 text-center [text-shadow:0_4px_16px_rgba(0,0,0,0.6)] leading-tight text-white">{displayTrack.title}</h1>
          <ArtistLinks 
            artistString={displayTrack.artist} 
            artistId={(displayTrack as any).artistId} 
            className="text-2xl text-white/70 mb-2 text-center [text-shadow:0_2px_8px_rgba(0,0,0,0.5)] font-medium" 
          />
          <p className="text-base text-white/40 mb-8 text-center [text-shadow:0_1px_4px_rgba(0,0,0,0.4)]">{displayTrack.album || 'Unknown Album'}</p>
          
          <div className="flex gap-4">
            <span className="px-4 py-1.5 bg-primary/20 text-primary rounded-full text-xs font-bold tracking-widest border border-primary/30 shadow-md">
              {(displayTrack.suffix || 'MP3').toUpperCase()}
            </span>
            <span className="px-4 py-1.5 bg-primary/20 text-primary rounded-full text-xs font-bold tracking-widest border border-primary/30 shadow-md">
              {displayTrack.bitRate 
                ? `${displayTrack.bitRate}kbps` 
                : 'UNKNOWN'}
            </span>
          </div>
        </div>

        <div className="flex-1 h-full w-full max-w-[800px] flex flex-col bg-foreground/10 rounded-3xl border border-white/20 backdrop-blur-2xl overflow-hidden shadow-2xl relative transform-gpu isolation-isolate">
          
          {activeTab === 'lyrics' && isUserScrolled && lrcLines.length > 0 && (
            <button 
              onClick={forceSync}
              className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 px-8 py-3 bg-primary text-background rounded-full font-bold shadow-[0_10px_30px_rgba(var(--color-primary-rgb),0.4)] hover:scale-105 hover:bg-primary/90 transition-all duration-300 animate-in slide-in-from-bottom-5 fade-in flex items-center gap-2"
            >
              {t('player.sync')}
            </button>
          )}
          
          <div className="relative flex items-center justify-center gap-2 px-6 py-6 border-b border-white/10 text-sm font-bold tracking-wider text-white/60">
            <div className="absolute left-6">
              <LanguageSelector align="left" />
            </div>
            <div className="absolute right-6">
              <ThemeSelector align="right" />
            </div>
            <button 
              onClick={() => setActiveTab('queue')}
              className={`transition-all rounded-full px-4 md:px-5 py-2 flex items-center justify-center gap-2 ${activeTab === 'queue' ? 'bg-primary text-background shadow-md' : 'hover:bg-foreground/10 hover:text-foreground'}`}
              title={t('player.queue')}
            >
              <ListMusic size={18} className="md:hidden" />
              <span className="hidden md:inline">{t('player.queue')}</span>
            </button>
            {!isStandalone && !readOnlyControls && (
              <button 
                onClick={() => setActiveTab('similar')}
                className={`transition-all rounded-full px-4 md:px-5 py-2 flex items-center justify-center gap-2 ${activeTab === 'similar' ? 'bg-primary text-background shadow-md' : 'hover:bg-foreground/10 hover:text-foreground'}`}
                title={t('player.similar')}
              >
                <Radio size={18} className="md:hidden" />
                <span className="hidden md:inline">{t('player.similar')}</span>
              </button>
            )}
            <button 
              onClick={() => setActiveTab('lyrics')}
              className={`transition-all rounded-full px-4 md:px-5 py-2 flex items-center justify-center gap-2 ${activeTab === 'lyrics' ? 'bg-primary text-background shadow-md' : 'hover:bg-foreground/10 hover:text-foreground'}`}
              title={t('player.lyrics')}
            >
              <MessageSquareQuote size={18} className="md:hidden" />
              <span className="hidden md:inline">{t('player.lyrics')}</span>
            </button>
            <button 
              onClick={() => setActiveTab('visualizer')}
              className={`transition-all rounded-full px-4 md:px-5 py-2 flex items-center justify-center gap-2 ${activeTab === 'visualizer' ? 'bg-primary text-background shadow-md' : 'hover:bg-foreground/10 hover:text-foreground'}`}
              title={t('player.visualizer')}
            >
              <Activity size={18} className="md:hidden" />
              <span className="hidden md:inline">{t('player.visualizer')}</span>
            </button>
          </div>

          {activeTab === 'lyrics' && (
            <div 
              className="flex-1 overflow-y-auto custom-scrollbar p-6 relative transform-gpu will-change-scroll"
              onScroll={handleUserScroll}
              onWheel={handleUserScroll}
              onTouchMove={handleUserScroll}
            >
              <div className="min-h-full flex flex-col items-center justify-start text-center max-w-[600px] mx-auto py-10 relative">
                {loadingLyrics ? (
                  <p className="text-white/50 animate-pulse text-lg">{t('player.loading_lyrics')}</p>
                ) : lrcLines.length > 0 ? (
                  <div ref={lyricsContainerRef} className="flex flex-col gap-6 pt-[350px] pb-[350px] w-full transform-gpu">
                    {lrcLines.map((line, idx) => {
                      const isActive = idx === activeLyricIndexRef.current;
                      const isPast = idx < activeLyricIndexRef.current;
                      
                      if (line.isInterlude) {
                        return (
                          <div key={idx} className={`flex justify-center items-center gap-4 transition-all duration-300 py-6 ${isActive ? 'scale-105' : 'opacity-40'}`}>
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
                        );
                      }
                      
                      return (
                        <div 
                          key={idx} 
                          className={`text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight cursor-pointer px-4 transition-[color,transform,opacity] duration-300 ease-out transform-gpu origin-center ${
                            isActive 
                              ? 'text-primary scale-105 [text-shadow:0_0_15px_rgba(var(--color-primary-rgb),0.5)]' 
                              : isPast 
                                ? 'text-white/40 scale-100' 
                                : 'text-white/30 hover:text-foreground/50 scale-100'
                          }`}
                          onClick={() => {
                            if (role === 'listener') return;
                            if (getAudioEngine()) {
                              getAudioEngine().resume().catch(console.error);
                              usePlayerStore.getState().setIsPlaying(true);
                              const curDur = useAudioStore.getState().duration || currentTrack?.duration || 1;
                              useAudioStore.getState().setIsSeeking(true);
                              useAudioStore.getState().setProgress(Math.max(0, Math.min(100, (line.time / curDur) * 100)));
                              getAudioEngine().seek(line.time);
                              const pState = usePlayerStore.getState();
                              if (pState.roomId && (pState.role === 'host' || pState.role === 'cohost')) {
                                jamSocket.syncSeek(line.time);
                              }
                              setTimeout(() => {
                                useAudioStore.getState().setIsSeeking(false);
                              }, 150);
                            }
                            setIsUserScrolled(false);
                          }}
                        >
                          {line.text}
                        </div>
                      );
                    })}
                  </div>
                ) : lyricsText ? (
                  <div className="w-full flex flex-col items-center gap-5 pb-32 pt-10 px-4 text-center">
                    {lyricsText.split('\n').map((line, idx) => {
                      const text = line.trim();
                      if (!text) return <div key={idx} className="h-2" />;
                      
                      const isSectionHeader = (text.startsWith('[') && text.endsWith(']')) || (text.startsWith('(') && text.endsWith(')'));
                      
                      return (
                        <div 
                          key={idx}
                          className={
                            isSectionHeader 
                              ? 'text-sm md:text-base font-bold text-primary tracking-[0.2em] uppercase mt-8 mb-2 opacity-80 drop-shadow-md' 
                              : 'text-2xl md:text-3xl font-bold tracking-tight text-white/70 hover:text-foreground transition-colors cursor-default'
                          }
                        >
                          {text}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-white/40 text-lg flex flex-col items-center gap-4 mt-20">
                    <p>{t('player.lyrics_not_found')}</p>
                    <p className="text-sm">Provided by My Server</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="flex-1 min-h-0 relative p-4 overflow-hidden">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-white/50">
                  <p>{t('player.queue_is_empty')}</p>
                </div>
              ) : (
                <SortableContext 
                  items={queue.map((t, idx) => `${t.id}-${idx}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <Virtuoso
                    ref={virtuosoRef}
                    className="h-full custom-scrollbar"
                    data={queue}
                    initialTopMostItemIndex={Math.max(0, currentIndex - 1)}
                    overscan={300}
                    components={{
                      Footer: () => <div className="h-10 flex-shrink-0" />
                    }}
                    itemContent={(idx: number, track: any) => {
                      const isPlayingQueue = idx === currentIndex;
                      const sortableId = `${track.id}-${idx}`;
                      const isInitialBatch = idx < 12;
                      return (
                        <div 
                          key={sortableId} 
                          className={`pb-2 ${isInitialBatch ? 'animate-cascade-track' : ''}`}
                          style={isInitialBatch ? { animationDelay: `${idx * 25}ms` } : undefined}
                        >
                          <SortableItem id={sortableId}>
                            {({ setNodeRef, attributes, listeners, style, isDragging }) => (
                              <div 
                                ref={setNodeRef}
                                style={style}
                                {...(!readOnlyControls ? attributes : {})}
                                {...(!readOnlyControls ? listeners : {})}
                                className={`flex items-center px-4 py-3 rounded-xl transition-colors ${isPlayingQueue ? 'bg-primary/20 shadow-sm border border-primary/30' : 'hover:bg-foreground/10'} ${!readOnlyControls ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-30' : ''}`}
                                onClick={() => {
                                  // Only handle play if it wasn't a drag
                                  if (!readOnlyControls && !isDragging) setQueueAndPlay(queue, idx);
                                }}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  openMenu(e.clientX, e.clientY, { ...track, queueIndex: idx, coverArt: getCoverArtUrl(track.coverArt || track.albumId || track.id, 300) }, 'track');
                                }}
                              >
                                <div className="w-8 flex justify-center text-white/50 text-sm font-medium select-none pointer-events-none">
                                  {isPlayingQueue ? <Play size={14} className="text-primary stroke-none" fill="currentColor" /> : idx + 1}
                                </div>
                                <div className="w-12 h-12 flex-shrink-0 mx-4 rounded-lg overflow-hidden shadow-md select-none pointer-events-none">
                                  <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId || track.id, 100)} className="w-full h-full object-cover" alt="" trackId={track.id} />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-center select-none pointer-events-none">
                                  <p className={`flex items-center gap-2 truncate text-base font-semibold ${isPlayingQueue ? 'text-primary drop-shadow-md' : 'text-white/90'}`}>
                                    <span className="truncate">{track.title}</span>
                                    {isItemDownloaded(downloads, track.id, track.albumId, track) && <Download size={14} className="text-primary shrink-0" />}
                                  </p>
                                  <ArtistLinks artistString={track.artist} artistId={(track as any).artistId} className="truncate text-sm text-white/60" />
                                </div>
                                <div className="w-16 text-sm text-white/50 flex justify-end font-medium select-none pointer-events-none">
                                  {formatTime(track.duration)}
                                </div>
                              </div>
                            )}
                          </SortableItem>
                        </div>
                      );
                    }}
                  />
                </SortableContext>
              )}
            </div>
          )}

          {activeTab === 'similar' && (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="space-y-2">
                {similarTracks.length > 0 ? similarTracks.map((track, idx) => (
                  <div 
                    key={idx} 
                    className="animate-cascade-track flex items-center px-4 py-3 rounded-xl transition-colors hover:bg-foreground/10 cursor-pointer"
                    style={{ animationDelay: `${Math.min(idx * 25, 200)}ms` }}
                    onClick={() => !readOnlyControls && setQueueAndPlay(similarTracks, idx)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || track.albumId || track.id, 300) }, 'track');
                    }}
                  >
                    <div className="w-12 h-12 flex-shrink-0 mr-4 rounded-lg overflow-hidden shadow-md">
                      <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId || track.id, 100)} className="w-full h-full object-cover" alt="" trackId={track.id} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <p className="flex items-center gap-2 truncate text-base font-semibold text-white/90">
                        <span className="truncate">{track.title}</span>
                        {isItemDownloaded(downloads, track.id, track.albumId, track) && <Download size={14} className="text-primary shrink-0" />}
                      </p>
                      <ArtistLinks artistString={track.artist} artistId={(track as any).artistId} className="truncate text-sm text-white/60" />
                    </div>
                    <div className="w-16 text-sm text-white/50 flex justify-end font-medium">
                      {formatTime(track.duration)}
                    </div>
                  </div>
                )) : (
                  <div className="text-white/40 text-lg flex flex-col items-center mt-20 font-medium">
                    {t('player.similar_not_found')}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'visualizer' && (
            <div className="flex-1 h-full p-6">
              <AudioVisualizer />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
