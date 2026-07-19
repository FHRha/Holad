import { useEffect, useState } from 'react';
import { fetchAlbums, getCoverArtUrl } from '../../api/subsonic';
import { useTranslation } from 'react-i18next';
import AlbumCard from '../common/AlbumCard';
import TrackImage from '../common/TrackImage';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';

export default function AlbumsView({ viewMode = 'grid' }: { viewMode?: 'grid' | 'list' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeFilter = useUIStore(s => s.activeFilter);
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlbums().then(data => {
      // Sort alphabetically by default for library
      const sorted = [...data].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
      setAlbums(sorted);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.loading_albums')}</div>;
  }

  const finalAlbums = (() => {
    let result = albums;
    if (activeFilter === 'Favorites') {
      result = albums.filter(a => a.userRating && a.userRating >= 4);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline') {
      result = [];
    }
    return result;
  })();

  // Generate unique first letters for the scrollbar
  const letters = Array.from(new Set(finalAlbums.map(a => {
    const title = a.name || a.title || '';
    const firstChar = title.charAt(0).toUpperCase();
    return /[A-ZА-Я]/.test(firstChar) ? firstChar : '#';
  }))).sort();

  const scrollToLetter = (letter: string) => {
    const el = document.getElementById(`letter-${letter}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent px-4 pt-4 pb-32 md:p-8 relative scroll-smooth">
      <h1 className="text-2xl font-bold mb-8 text-foreground hidden md:block">{t('views.albums')}</h1>
      
      <div className={viewMode === 'grid' 
        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 pr-6 md:pr-0"
        : "flex flex-col gap-4 pr-6 md:pr-0"
      }>
        {finalAlbums.map((album, index) => {
          const firstChar = (album.name || album.title || '').charAt(0).toUpperCase();
          const letter = /[A-ZА-Я]/.test(firstChar) ? firstChar : '#';
          const prevFirstChar = index > 0 ? (finalAlbums[index-1].name || finalAlbums[index-1].title || '').charAt(0).toUpperCase() : '';
          const prevLetter = /[A-ZА-Я]/.test(prevFirstChar) ? prevFirstChar : '#';
          const isFirstOfLetter = index === 0 || letter !== prevLetter;

          if (viewMode === 'list') {
            return (
              <div 
                key={album.id} 
                id={isFirstOfLetter ? `letter-${letter}` : undefined} 
                className="flex items-center gap-4 cursor-pointer scroll-mt-24"
                onClick={() => navigate(`/Holad/album/${album.id}`)}
              >
                <div className="relative w-16 h-16 flex-shrink-0">
                  <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full rounded-md object-cover" trackId={album.id} />
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <span className="text-[15px] text-white font-bold truncate">{album.name || album.title}</span>
                  <span className="text-[#b3b3b3] text-[13px] truncate">{album.artist}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={album.id} id={isFirstOfLetter ? `letter-${letter}` : undefined} className="scroll-mt-24 w-full">
              <AlbumCard album={album} />
            </div>
          );
        })}
      </div>

      {/* Mobile Alphabetical Scrollbar */}
      <div className="md:hidden fixed right-0 top-[220px] bottom-[180px] w-6 flex flex-col items-center justify-between z-20 pointer-events-none">
        <div className="flex flex-col items-center gap-1 my-auto pointer-events-auto h-full overflow-y-auto hide-scrollbar py-2">
          {letters.map((letter, idx) => (
            <button 
              key={idx} 
              onClick={() => scrollToLetter(letter)}
              className="text-[10px] font-bold text-primary hover:scale-125 transition-transform py-0.5"
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

