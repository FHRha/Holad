import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Music, Play, Loader2 } from 'lucide-react';
import { getSongsByGenre, getCoverArtUrl } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';

interface GenreCarouselProps {
  title: string;
  genres: any[];
}

export default function GenreCarousel({ title, genres }: GenreCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [loadingStation, setLoadingStation] = useState<string | null>(null);
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);

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

  const mapTracks = (tracks: any[]): Track[] => {
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating
    }));
  };

  const startGenreRadio = async (genreName: string) => {
    setLoadingStation(genreName);
    try {
      const tracks = await getSongsByGenre(genreName, 50);
      if (tracks && tracks.length > 0) {
        setQueueAndPlay(mapTracks(tracks), 0);
      } else {
        alert("Не удалось загрузить треки для этой станции.");
      }
    } catch (error) {
      console.error(error);
      alert("Ошибка при запуске станции.");
    } finally {
      setLoadingStation(null);
    }
  };

  if (!genres || genres.length === 0) return null;

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
        className="flex overflow-x-auto gap-4 snap-x snap-mandatory hide-scrollbar p-4 -m-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {genres.map((genre, idx) => {
          const spotifyColors = [
            'bg-[#E13300]', 'bg-[#1E3264]', 'bg-[#E8115B]', 'bg-[#148A08]', 
            'bg-[#509BF5]', 'bg-[#FF4632]', 'bg-[#BA5D07]', 'bg-[#7358FF]', 
            'bg-[#8D67AB]', 'bg-[#477D95]', 'bg-[#E1118C]', 'bg-[#006450]'
          ];
          const colorClass = spotifyColors[idx % spotifyColors.length];
          const isThisLoading = loadingStation === genre.value;

          return (
            <div key={genre.value} className="snap-start flex-shrink-0 h-[160px]" style={{ width: 'calc(20% - 13px)', minWidth: '160px' }}>
              <div 
                onClick={isThisLoading ? undefined : () => startGenreRadio(genre.value)}
                className={`w-full h-full relative overflow-hidden rounded-xl cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-2xl ${colorClass}`}
              >
                {/* Huge rotated icon in bottom right like Spotify images */}
                <div className="absolute -bottom-6 -right-6 transform rotate-12 opacity-30 group-hover:opacity-40 transition-opacity">
                  <Music size={100} className="text-black drop-shadow-lg" />
                </div>
                
                <div className="relative z-10 p-4 flex flex-col h-full justify-between">
                  <h3 className="text-xl font-black text-white drop-shadow-md line-clamp-2 leading-tight">
                    {genre.value}
                  </h3>
                  
                  <div className="flex justify-between items-end">
                    <p className="text-xs text-white/80 font-bold drop-shadow-md">
                      {genre.songCount} треков
                    </p>
                    <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-xl transform translate-y-2 group-hover:translate-y-0">
                      {isThisLoading ? <Loader2 size={20} className="animate-spin text-black" /> : <Play size={20} fill="currentColor" className="ml-1 text-black" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
