import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, Star, Download } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { getCoverArtUrl } from '../../api/subsonic';
import TrackImage from '../common/TrackImage';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import LongPressWrapper from '../common/LongPressWrapper';

interface TrackCarouselProps {
  title: string;
  tracks: any[];
}

export default function TrackCarousel({ title, tracks }: TrackCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const { openMenu } = useContextMenuStore();
  const downloads = useDownloadStore(state => state.downloads);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const clientWidth = scrollRef.current.clientWidth;
      const scrollAmount = direction === 'left' ? -clientWidth : clientWidth;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const playTrack = (track: any) => {
    const mappedTrack = {
      id: track.id,
      title: track.title || track.name,
      artist: track.artist,
      album: track.album,
      albumId: track.albumId,
      artistId: track.artistId,
      coverArt: track.coverArt || track.id,
      duration: track.duration,
      path: track.path
    };
    setQueueAndPlay([mappedTrack], 0);
  };

  return (
    <div className="mb-10 relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          {title}
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={() => scroll('left')} 
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors ${!canScrollLeft ? 'opacity-30 cursor-not-allowed' : ''}`}
            disabled={!canScrollLeft}
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={() => scroll('right')} 
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors ${!canScrollRight ? 'opacity-30 cursor-not-allowed' : ''}`}
            disabled={!canScrollRight}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto gap-4 snap-x snap-mandatory hide-scrollbar py-4 -my-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {tracks.map((track) => (
          <LongPressWrapper 
            key={track.id} 
            className="snap-start flex flex-col gap-2 flex-shrink-0 cursor-pointer group transition-all"
            style={{ 
              width: 'calc(20% - 13px)', 
              minWidth: '150px',
              maxWidth: '220px'
            }}
            onClick={() => playTrack(track)}
            onLongPress={(e: any) => {
              e.preventDefault?.();
              openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || track.id, 300) }, 'track');
            }}
          >
            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#282828] shadow-md group-hover:shadow-xl transition-all duration-300">
              <TrackImage src={getCoverArtUrl(track.coverArt || track.id, 300)} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={track.title || track.name} trackId={track.id} />
              
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center pl-1 text-black shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-300">
                  <Play fill="currentColor" size={24} />
                </div>
              </div>

              {(track.userRating > 0) && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 text-primary text-xs font-bold bg-black/60 backdrop-blur-md px-2 py-1 rounded-full">
                  <Star size={10} fill="currentColor" />
                  {track.userRating}
                </div>
              )}
            </div>
            
            <div className="flex flex-col mt-1 px-1">
              <span className="flex items-center gap-1.5 text-[15px] font-bold text-white truncate">
                <span className="truncate">{track.title || track.name}</span>
                {isItemDownloaded(downloads, track.id, track.albumId) && <Download size={14} className="text-primary shrink-0" />}
              </span>
              <span className="text-[13px] text-[#b3b3b3] truncate">{track.artist}</span>
            </div>
          </LongPressWrapper>
        ))}
      </div>
    </div>
  );
}
