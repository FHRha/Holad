import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Share, Shuffle, Trash2, X, Search, Play } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useUIStore } from '../../store/uiStore';
import { getDownloadUrl } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';

export default function RightSidebar() {
  const { queue, currentIndex, playTrack, toggleShuffle, clearQueue } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const { setSearchOpen, rightSidebarWidth, setRightSidebarWidth } = useUIStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDownloadAlbum = () => {
    if (queue.length === 0 || currentIndex === -1) return;
    const currentTrack = queue[currentIndex];
    if (!currentTrack) return;
    const idToDownload = currentTrack.albumId || currentTrack.id;
    if (idToDownload) {
      const url = getDownloadUrl(idToDownload);
      window.open(url, '_blank');
    }
    setShowShareMenu(false);
  };

  const handleShareItem = () => {
    if (queue.length === 0 || currentIndex === -1) return;
    const currentTrack = queue[currentIndex];
    if (!currentTrack) return;
    
    const origin = window.location.origin;
    const url = `${origin}/jam/?album=${currentTrack.albumId || currentTrack.album}`;
      
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
      setShowShareMenu(false);
    }, 2000);
  };

  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = rightSidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = startWidth.current - (e.clientX - startX.current);
      if (newWidth < 40) {
         setRightSidebarWidth(0);
         isResizing.current = false;
         document.body.style.cursor = 'default';
         document.body.style.userSelect = '';
      } else if (newWidth < 200) {
         setRightSidebarWidth(80); // Snap to small mode
      } else {
         setRightSidebarWidth(Math.min(newWidth, 500));
      }
    };
    
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [rightSidebarWidth, setRightSidebarWidth]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 200;
    if (bottom && visibleCount < queue.length) {
      setVisibleCount(prev => prev + 50);
    }
  };

  useEffect(() => {
    const activeEl = document.getElementById(`queue-item-${currentIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  const handleContextMenu = (e: React.MouseEvent, track: any, idx: number) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY, { ...track, queueIndex: idx }, 'track');
  };

  const handleTouchStart = (e: React.TouchEvent, track: any, idx: number) => {
    const touch = e.touches[0];
    touchTimer.current = setTimeout(() => {
      openMenu(touch.clientX, touch.clientY, { ...track, queueIndex: idx }, 'track');
    }, 500);
  };

  const handleTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
  };

  if (rightSidebarWidth === 0) return null;

  const isSmall = rightSidebarWidth <= 100;

  return (
    <div 
      className="hidden md:flex bg-background border-l border-white/5 flex-col h-full text-sm relative z-[60] flex-shrink-0"
      style={{ width: rightSidebarWidth }}
    >
      {/* Resizer */}
      <div 
        className="absolute top-0 left-0 w-2 h-full cursor-col-resize hover:bg-white/10 active:bg-white/20 transition-colors z-20"
        onMouseDown={handleMouseDown}
      />

      {!isSmall && (
        <>
          <div className="p-4 flex items-center text-secondary">
            <div className="flex gap-4">
              <div className="relative flex" ref={shareRef}>
                <button className="hover:text-foreground" title="Действия с альбомом" onClick={() => setShowShareMenu(!showShareMenu)}>
                  <Share size={16} />
                </button>
                {showShareMenu && (
                  <div className="absolute top-full right-0 mt-2 py-1 bg-[#1c1c1c] border border-white/10 rounded-lg shadow-2xl z-[60] flex flex-col min-w-[180px]">
                    <button onClick={handleDownloadAlbum} className="text-left px-4 py-2 hover:bg-white/10 text-sm text-white font-medium transition-colors flex items-center gap-3 whitespace-nowrap">
                      <Download size={18} className="shrink-0" /> Скачать альбом
                    </button>
                    <button onClick={handleShareItem} className={`text-left px-4 py-2 hover:bg-white/10 text-sm font-medium transition-colors border-t border-white/5 flex items-center gap-3 whitespace-nowrap ${isCopied ? 'text-primary' : 'text-white'}`}>
                      <Share size={18} className="shrink-0" /> {isCopied ? 'Скопировано!' : 'Поделиться альбомом'}
                    </button>
                  </div>
                )}
              </div>
              <button className="hover:text-foreground" title="Перемешать" onClick={toggleShuffle}><Shuffle size={18} /></button>
              <button className="hover:text-foreground" title="Очистить" onClick={clearQueue}><Trash2 size={18} /></button>
            </div>
          </div>

          <div className="flex pl-4 pr-8 py-2 text-xs font-semibold tracking-wider text-secondary border-b border-white/5 uppercase">
            <div className="w-8">#</div>
            <div className="flex-1">Title</div>
            <div className="w-10 text-right"><Clock size={14} className="inline-block" /></div>
          </div>
        </>
      )}



      <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isSmall ? 'p-1' : 'p-2'} space-y-1`} onScroll={handleScroll}>
        {queue.slice(0, visibleCount).map((track, idx) => {
          const isPlaying = idx === currentIndex;
          return (
            <div 
              id={`queue-item-${idx}`}
              key={idx} 
              onClick={() => playTrack(idx)}
              onContextMenu={(e) => handleContextMenu(e, track, idx)}
              onTouchStart={(e) => handleTouchStart(e, track, idx)}
              onTouchEnd={handleTouchEnd}
              onTouchMove={handleTouchEnd}
              className={`flex items-center ${isSmall ? 'justify-center p-1' : 'px-2 py-2'} rounded-md cursor-pointer group ${isPlaying ? 'bg-white/10' : 'hover:bg-white/5'}`}
              title={isSmall ? `${track.title} • ${formatArtistName(track.artist)}` : undefined}
            >
              {!isSmall && (
                <div className="w-6 flex justify-center text-secondary text-xs">
                  {isPlaying ? <Play size={12} className="text-primary" fill="currentColor" /> : idx + 1}
                </div>
              )}
              <div className={`relative group rounded overflow-hidden shadow-sm flex-shrink-0 ${isSmall ? 'w-14 h-14' : 'w-10 h-10 mx-2'}`}>
                <TrackImage src={track.coverArt} className="w-full h-full rounded object-cover" alt="" />
                {isSmall && (
                  <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Play size={16} className={isPlaying ? "text-primary" : "text-white"} fill="currentColor" />
                  </div>
                )}
              </div>
              {!isSmall && (
                <>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className={`truncate text-sm font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                    <p className="truncate text-xs text-secondary">{formatArtistName(track.artist)}</p>
                  </div>
                  <div className="w-10 text-right text-xs text-secondary">
                    {formatTime(track.duration)}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {queue.length === 0 && !isSmall && (
          <div className="text-center mt-10 text-secondary text-sm">Queue is empty</div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
