import { useEffect, useRef } from 'react';
import { Clock, Heart, Download, ListVideo, X, Search, Play } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useUIStore } from '../../store/uiStore';
import { formatArtistName } from '../../utils/formatters';

export default function RightSidebar() {
  const { queue, currentIndex, playTrack } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const { setSearchOpen } = useUIStore();
  const touchTimer = useRef<number | null>(null);

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

  return (
    <div className="hidden md:flex w-80 bg-background border-l border-white/5 flex-col h-full text-sm relative z-10">
      <div className="p-4 flex items-center justify-between text-secondary">
        <div className="flex gap-4">
          <button className="hover:text-foreground"><Download size={18} /></button>
          <button className="hover:text-foreground"><ListVideo size={18} /></button>
          <button className="hover:text-foreground"><X size={18} /></button>
        </div>
        <button onClick={() => setSearchOpen(true)} className="hover:text-foreground"><Search size={18} /></button>
      </div>

      <div className="flex px-4 py-2 text-xs font-semibold tracking-wider text-secondary border-b border-white/5 uppercase">
        <div className="w-8">#</div>
        <div className="flex-1">Title</div>
        <div className="w-10 text-right"><Clock size={14} className="inline-block" /></div>
        <div className="w-8 flex justify-center"><Heart size={14} /></div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1">
        {queue.map((track, idx) => {
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
              className={`flex items-center px-2 py-2 rounded-md cursor-pointer group ${isPlaying ? 'bg-white/10' : 'hover:bg-white/5'}`}
            >
              <div className="w-6 flex justify-center text-secondary text-xs">
                {isPlaying ? <Play size={12} className="text-primary" fill="currentColor" /> : idx + 1}
              </div>
              <div className="w-10 h-10 flex-shrink-0 mx-2">
                <img src={track.coverArt} className="w-full h-full rounded object-cover" alt="" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className={`truncate text-sm font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>{track.title}</p>
                <p className="truncate text-xs text-secondary">{formatArtistName(track.artist)}</p>
              </div>
              <div className="w-10 text-right text-xs text-secondary">
                {formatTime(track.duration)}
              </div>
            </div>
          );
        })}
        {queue.length === 0 && (
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
