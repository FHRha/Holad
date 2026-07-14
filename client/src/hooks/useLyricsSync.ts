import { useState, useEffect, useRef } from 'react';
import { getLyrics, getLyricsBySongId } from '../api/subsonic';
import { parseLRC, injectInterludes } from '../utils/lyrics';
import type { LyricLine } from '../utils/lyrics';
import type { Track } from '../store/playerStore';

export function useLyricsSync(currentTrack: Track | undefined, audioElement: HTMLAudioElement | null, isActive: boolean) {
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lrcLines, setLrcLines] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
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

  const handleUserScroll = () => {
    if (isAutoScrolling.current) {
      if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
      autoScrollTimeoutRef.current = setTimeout(() => {
        isAutoScrolling.current = false;
      }, 200) as unknown as number;
    } else {
      setIsUserScrolled(true);
    }
  };

  const scrollToActiveElement = (activeElement: HTMLElement) => {
    isAutoScrolling.current = true;
    if (autoScrollTimeoutRef.current) clearTimeout(autoScrollTimeoutRef.current);
    
    if (lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const containerHeight = container.clientHeight;
      const elementOffsetTop = activeElement.offsetTop;
      const elementHeight = activeElement.offsetHeight;
      
      const targetScroll = elementOffsetTop - (containerHeight / 2) + (elementHeight / 2);
      
      container.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
    
    autoScrollTimeoutRef.current = setTimeout(() => {
      isAutoScrolling.current = false;
    }, 600) as unknown as number;
  };

  // Karaoke Loop
  useEffect(() => {
    if (!audioElement || lrcLines.length === 0 || !isActive) return;
    
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
          const targetIndex = Math.max(0, newIndex);
          const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
          if (activeElement && !isUserScrolled) {
            scrollToActiveElement(activeElement);
          }
        }
      }
      rafId = requestAnimationFrame(updateCurrentLyric);
    };
    
    rafId = requestAnimationFrame(updateCurrentLyric);
    return () => cancelAnimationFrame(rafId);
  }, [audioElement, lrcLines, isActive]);

  // Jump to current active line when switching back to lyrics tab
  useEffect(() => {
    if (isActive && lyricsContainerRef.current) {
      const targetIndex = Math.max(0, activeLyricIndex);
      const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
      if (activeElement && !isUserScrolled) {
        scrollToActiveElement(activeElement);
      }
    }
  }, [isActive]);

  const forceSync = () => {
    setIsUserScrolled(false);
    if (lyricsContainerRef.current) {
      const targetIndex = Math.max(0, activeLyricIndex);
      const activeElement = lyricsContainerRef.current.children[targetIndex] as HTMLElement;
      if (activeElement) {
        scrollToActiveElement(activeElement);
      }
    }
  };

  const handleLyricClick = (time: number) => {
    if (audioElement && currentTrack) {
      audioElement.currentTime = time;
      setIsUserScrolled(false);
    }
  };



  return {
    lyricsText,
    lrcLines,
    loadingLyrics,
    activeLyricIndex,
    isUserScrolled,
    lyricsContainerRef,
    handleUserScroll,
    handleLyricClick,
    forceSync,
    setIsUserScrolled
  };
}
