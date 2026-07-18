import { useEffect, useRef, useState } from 'react';
import { Clock, Download, Share, Shuffle, Trash2, Play } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../common/dnd/SortableItem';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useUIStore } from '../../store/uiStore';
import { getShareUrl } from '../../utils/serverConfig';
import { handleDownload } from '../../utils/downloadHelper';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';
import LongPressWrapper from '../common/LongPressWrapper';

export default function RightSidebar() {
  const { t } = useTranslation();
  const { queue, currentIndex, playTrack, toggleShuffle, clearQueue, isProcessing } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const { rightSidebarWidth, setRightSidebarWidth } = useUIStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
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
      handleDownload(idToDownload, queue[currentIndex]?.title || 'track');
    }
    setShowShareMenu(false);
  };

  const handleShareItem = () => {
    if (queue.length === 0 || currentIndex === -1) return;
    const currentTrack = queue[currentIndex];
    if (!currentTrack) return;
    
    const origin = getShareUrl();
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
         const maxWidth = Math.min(500, window.innerWidth * 0.35);
         setRightSidebarWidth(Math.min(newWidth, maxWidth));
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

  if (rightSidebarWidth === 0) return null;

  const isSmall = rightSidebarWidth <= 100;

  return (
    <div 
      className={`hidden md:flex flex-col h-full text-sm relative z-[60] flex-shrink-0 transition-[max-width,background-color] ${isSmall ? 'bg-gradient-to-r from-transparent to-background/90 border-l border-transparent' : 'bg-background border-l border-white/5'}`}
      style={{ width: rightSidebarWidth, maxWidth: '35vw' }}
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
                <button className="hover:text-foreground" title={t('common.album_actions')} onClick={() => setShowShareMenu(!showShareMenu)}>
                  <Share size={16} />
                </button>
                {showShareMenu && (
                  <div className="absolute top-full right-0 mt-2 py-1 bg-[#1c1c1c] border border-white/10 rounded-lg shadow-2xl z-[60] flex flex-col min-w-[180px]">
                    <button onClick={handleDownloadAlbum} className="text-left px-4 py-2 hover:bg-white/10 text-sm text-white font-medium transition-colors flex items-center gap-3 whitespace-nowrap">
                      <Download size={18} className="shrink-0" /> {t('common.download_album')}
                    </button>
                    <button onClick={handleShareItem} className={`text-left px-4 py-2 hover:bg-white/10 text-sm font-medium transition-colors border-t border-white/5 flex items-center gap-3 whitespace-nowrap ${isCopied ? 'text-primary' : 'text-white'}`}>
                      <Share size={18} className="shrink-0" /> {isCopied ? t('common.copied') : t('common.share_album')}
                    </button>
                  </div>
                )}
              </div>
              <button className="hover:text-foreground" title={t('common.shuffle')} onClick={toggleShuffle}><Shuffle size={18} /></button>
              <button className="hover:text-foreground" title={t('common.clear_queue')} onClick={clearQueue}><Trash2 size={18} /></button>
            </div>
          </div>

          <div className="flex pl-4 pr-8 py-2 text-xs font-semibold tracking-wider text-secondary border-b border-white/5 uppercase">
            <div className="w-8">#</div>
            <div className="flex-1">Title</div>
            <div className="w-10 text-right"><Clock size={14} className="inline-block" /></div>
          </div>
        </>
      )}



      <div className={`flex-1 overflow-y-auto overflow-x-hidden ${isSmall ? 'p-1' : 'p-2'} space-y-1 relative`} onScroll={handleScroll}>
        {isProcessing && (
          <div className="absolute inset-0 z-50 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        <SortableContext 
          items={queue.slice(0, visibleCount).map((t, idx) => `${t.id}-${idx}`)}
          strategy={verticalListSortingStrategy}
        >
          {queue.slice(0, visibleCount).map((track, idx) => {
            const isPlaying = idx === currentIndex;
            const sortableId = `${track.id}-${idx}`;
            return (
              <SortableItem key={sortableId} id={sortableId}>
                {({ setNodeRef, attributes, listeners, style, isDragging }) => (
                  <LongPressWrapper 
                    ref={setNodeRef}
                    style={style}
                    id={`queue-item-${idx}`}
                    {...attributes}
                    {...listeners}
                    onClick={() => playTrack(idx)}
                    onLongPress={(e: any) => handleContextMenu(e, track, idx)}
                    className={`flex items-center ${isSmall ? 'justify-center p-1 hover:scale-105 transition-transform' : `px-2 py-2 rounded-md ${isPlaying ? 'bg-white/10' : 'hover:bg-white/5'}`} cursor-grab active:cursor-grabbing group ${isDragging ? 'opacity-30' : ''}`}
                    title={isSmall ? `${track.title} • ${formatArtistName(track.artist)}` : undefined}
                  >
                    {!isSmall && (
                      <div className="w-6 flex justify-center text-secondary text-xs select-none pointer-events-none">
                        {isPlaying ? <Play size={12} className="text-primary" fill="currentColor" /> : idx + 1}
                      </div>
                    )}
                    <div className={`relative group rounded overflow-hidden shadow-sm flex-shrink-0 ${isSmall ? 'w-14 h-14' : 'w-10 h-10 mx-2'}`}>
                      <TrackImage src={track.coverArt} className="w-full h-full rounded object-cover pointer-events-none" alt="" />
                      {isSmall && (
                        <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} pointer-events-none`}>
                          <Play size={16} className={isPlaying ? "text-primary" : "text-white"} fill="currentColor" />
                        </div>
                      )}
                    </div>
                    {!isSmall && (
                      <>
                        <div className="flex-1 min-w-0 flex flex-col justify-center select-none pointer-events-none">
                          <p className={`truncate text-sm font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                          <p className="truncate text-xs text-secondary">{formatArtistName(track.artist)}</p>
                        </div>
                        <div className="w-10 text-right text-xs text-secondary select-none pointer-events-none">
                          {formatTime(track.duration)}
                        </div>
                      </>
                    )}
                  </LongPressWrapper>
                )}
              </SortableItem>
            );
          })}
        </SortableContext>
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
