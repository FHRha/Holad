/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useRef } from 'react';
import { getLyrics, getLyricsBySongId } from '../api/subsonic';
import { parseLRC, injectInterludes } from '../utils/lyrics';
import type { LyricLine } from '../utils/lyrics';
import { usePlayerStore, type Track } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { getAudioEngine } from '../audio/AudioEngine';
import { subscribeWindowVisibility, getIsWindowVisible } from './useWindowVisibility';
import { useHoladStore } from '../store/holadStore';

export function useLyricsSync(currentTrack: Track | undefined, audioElement: HTMLAudioElement | null, isActive: boolean) {
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lrcLines, setLrcLines] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  // unused activeLyricIndex state removed
  const [isUserScrolled, setIsUserScrolled] = useState(false);
  
  const isAutoScrolling = useRef(false);
  const autoScrollTimeoutRef = useRef<number | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (currentTrack) {
      setLoadingLyrics(true);
      setLyricsText(null);
      setLrcLines([]);
      activeLyricIndexRef.current = -1;
      
      getLyricsBySongId(currentTrack.id).then(structuredLine => {
        if (structuredLine && structuredLine.length > 0) {
          const firstLine = structuredLine[0];
          const hasTime = firstLine.start !== undefined || firstLine.offset !== undefined || firstLine.time !== undefined;
          
          if (hasTime) {
            const parsed = structuredLine.map((l: any) => {
              const val = Number(l.start ?? l.offset ?? l.time ?? 0);
              return {
                time: val / 1000,
                text: l.value || l.text || ''
              };
            });
            setLrcLines(injectInterludes(parsed.sort((a: any, b: any) => a.time - b.time)));
          } else {
            const text = structuredLine.map((l: any) => l.value || l.text || '').join('\n');
            setLyricsText(text);
          }
          setLoadingLyrics(false);
        } else {
          // oxlint-disable-next-line
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
    }
    setIsUserScrolled(false);
  }, [currentTrack?.id]);

  const isUserScrolledRef = useRef(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const activeLyricIndexRef = useRef(-1);
  const isResizingRef = useRef(false);
  const resizeDebounceTimeoutRef = useRef<number | null>(null);

  const handleUserScroll = () => {
    if (isAutoScrolling.current || isResizingRef.current) {
      if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
      autoScrollTimeoutRef.current = setTimeout(() => {
        isAutoScrolling.current = false;
      }, 200) as unknown as number;
    } else {
      if (!isUserScrolledRef.current) {
        isUserScrolledRef.current = true;
        setIsUserScrolled(true);
      }
      
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      
      if (usePlayerStore.getState().isPlaying) {
        userScrollTimeoutRef.current = setTimeout(() => {
          setIsUserScrolled(false);
          isUserScrolledRef.current = false;
          
          if (lyricsContainerRef.current) {
            const targetIndex = Math.max(0, activeLyricIndexRef.current);
            const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
            if (activeElement) {
              scrollToActiveElement(activeElement);
            }
          }
        }, 5000) as unknown as number;
      }
    }
  };

  const scrollToActiveElement = (activeElement: HTMLElement, behavior: ScrollBehavior = 'smooth') => {
    isAutoScrolling.current = true;
    if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
    
    if (lyricsContainerRef.current) {
      const container = lyricsContainerRef.current.closest('.overflow-y-auto') as HTMLElement;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = activeElement.getBoundingClientRect();
        const targetScroll = container.scrollTop + (elementRect.top - containerRect.top) - (containerRect.height / 2) + (elementRect.height / 2);
        
        container.scrollTo({
          top: Math.round(targetScroll),
          behavior
        });
      }
    }
    
    autoScrollTimeoutRef.current = setTimeout(() => {
      isAutoScrolling.current = false;
    }, behavior === 'smooth' ? 500 : 100) as unknown as number;
  };

  // Re-center active line on window resize
  useEffect(() => {
    const handleResize = () => {
      isResizingRef.current = true;
      if (resizeDebounceTimeoutRef.current) clearTimeout(resizeDebounceTimeoutRef.current);
      resizeDebounceTimeoutRef.current = setTimeout(() => {
        isResizingRef.current = false;
        if (lyricsContainerRef.current) {
          const targetIndex = Math.max(0, activeLyricIndexRef.current);
          const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
          if (activeElement && !isUserScrolledRef.current) {
            scrollToActiveElement(activeElement, 'auto');
          }
        }
      }, 120) as unknown as number;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeDebounceTimeoutRef.current) clearTimeout(resizeDebounceTimeoutRef.current);
    };
  }, [lrcLines.length, isActive]);

  // Karaoke Loop
  useEffect(() => {
    if (!audioElement || lrcLines.length === 0 || !isActive) return;
    
    let rafId: number | null = null;
    // oxlint-disable-next-line
    let lastActiveIndex = activeLyricIndexRef.current;

    const updateCurrentLyric = () => {
      if (!usePlayerStore.getState().isPlaying || !getIsWindowVisible()) {
        rafId = null;
        return;
      }

      const audioStore = useAudioStore.getState();
      const duration = currentTrack?.duration || 1;
      let currentTime = (audioStore.progress / 100) * duration;
      const engine = getAudioEngine();
      const engDur = engine.getDuration();
      const holadState = useHoladStore.getState();
      const isLocalActive = !holadState.roomId || holadState.activeDeviceId === holadState.deviceId;
      if (isLocalActive && engDur > 0) {
        const engTime = engine.getCurrentTime();
        if (typeof engTime === 'number' && !isNaN(engTime) && engTime >= 0) {
          currentTime = engTime;
        }
      }

      let newIndex = 0;
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
        // Comment out setState to decouple rAF from React state
        // setActiveLyricIndex(newIndex);
        activeLyricIndexRef.current = newIndex;
        
        if (lyricsContainerRef.current) {
          const targetIndex = Math.max(0, newIndex);
          const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
          
          // Direct DOM manipulation for lyric classes
          Array.from(lyricsContainerRef.current.children).forEach((child, idx) => {
            const isSectionHeader = child.textContent?.trim().startsWith('[') || child.textContent?.trim().startsWith('(');
            
            if (idx === newIndex) {
              child.classList.add('text-primary', 'opacity-100');
              child.classList.remove('text-white/40', 'text-white/30', 'hover:text-white/50', 'text-primary/40', 'text-primary/70', 'opacity-40', 'opacity-30', 'scale-105', '[text-shadow:0_0_15px_rgba(var(--color-primary-rgb),0.5)]');
            } else if (idx < newIndex) {
              child.classList.remove('text-primary', 'opacity-100', 'text-primary/70', 'scale-105', '[text-shadow:0_0_15px_rgba(var(--color-primary-rgb),0.5)]');
              child.classList.add('opacity-40');
              if (isSectionHeader) {
                child.classList.add('text-primary/40');
              } else {
                child.classList.add('text-white/40');
              }
            } else {
              child.classList.remove('text-primary', 'opacity-100', 'text-white/40', 'text-primary/40', 'scale-105', '[text-shadow:0_0_15px_rgba(var(--color-primary-rgb),0.5)]');
              child.classList.add('opacity-30');
              if (isSectionHeader) {
                child.classList.add('text-primary/70');
              } else {
                child.classList.add('text-white/30', 'hover:text-white/50');
              }
            }
          });

          if (activeElement && !isUserScrolledRef.current) {
            scrollToActiveElement(activeElement);
          }
        }
      }
      rafId = requestAnimationFrame(updateCurrentLyric);
    };
    
    if (usePlayerStore.getState().isPlaying && getIsWindowVisible()) {
      rafId = requestAnimationFrame(updateCurrentLyric);
    }

    const unsub = usePlayerStore.subscribe((state, prevState) => {
      if (state.isPlaying && !prevState.isPlaying) {
        if (!rafId && getIsWindowVisible()) {
          rafId = requestAnimationFrame(updateCurrentLyric);
        }
      }
    });

    const unsubVis = subscribeWindowVisibility((visible) => {
      if (visible && usePlayerStore.getState().isPlaying) {
        if (!rafId) {
          rafId = requestAnimationFrame(updateCurrentLyric);
        }
      } else if (!visible && rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      unsub();
      unsubVis();
    };
  }, [audioElement, lrcLines, isActive]);

  // Jump to current active line when switching back to lyrics tab or when lyrics finish loading
  useEffect(() => {
    if (isActive && lyricsContainerRef.current && lrcLines.length > 0) {
      // oxlint-disable-next-line
      const targetIndex = Math.max(0, activeLyricIndexRef.current);
      const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
      if (activeElement && !isUserScrolledRef.current) {
        scrollToActiveElement(activeElement, 'auto');
      }
    }
  }, [isActive, lrcLines.length]);

  const forceSync = () => {
    setIsUserScrolled(false);
    isUserScrolledRef.current = false;
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);

    if (lyricsContainerRef.current) {
      const targetIndex = Math.max(0, activeLyricIndexRef.current);
      const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
      if (activeElement) {
        scrollToActiveElement(activeElement);
      }
    }
  };

  const handleLyricClick = (time: number) => {
    if (currentTrack) {
      getAudioEngine().seek(time);
      setIsUserScrolled(false);
    }
  };



  return {
    lyricsText,
    lrcLines,
    loadingLyrics,
    activeLyricIndexRef,
    isUserScrolled,
    lyricsContainerRef,
    handleUserScroll,
    handleLyricClick,
    forceSync,
    setIsUserScrolled
  };
}
