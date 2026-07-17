import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AlbumCard from '../common/AlbumCard';
import HeroAlbumCard from '../common/HeroAlbumCard';

interface AlbumCarouselProps {
  title: string;
  albums: any[];
  variant?: 'hero' | 'standard';
}

export default function AlbumCarousel({ title, albums, variant = 'standard' }: AlbumCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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
        {albums.map((album) => (
          <div key={album.id} className="snap-start flex-shrink-0 h-full transition-all" style={{ 
            width: variant === 'hero' ? 'calc(25% - 12px)' : 'calc(20% - 13px)', 
            minWidth: variant === 'hero' ? '220px' : '150px',
            maxWidth: variant === 'hero' ? '320px' : '220px'
          }}>
            {variant === 'hero' ? <HeroAlbumCard album={album} /> : <AlbumCard album={album} />}
          </div>
        ))}
      </div>
    </div>
  );
}
