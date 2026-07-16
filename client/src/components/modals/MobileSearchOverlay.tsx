import { useRef, useEffect } from 'react';
import { X, Play, Music, Disc, Users, ArrowLeft, Search } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { formatTime } from '../../utils/timeFormat';
import { formatArtistName } from '../../utils/formatters';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { useUIStore } from '../../store/uiStore';
import { useTranslation } from 'react-i18next';
import TrackImage from '../common/TrackImage';
import ArtistCard from '../common/ArtistCard';

export default function MobileSearchOverlay() {
  const { t } = useTranslation();
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    handlePlaySong,
    navigateToAlbum
  } = useGlobalSearch(inputRef, containerRef, sessionRef);

  useEffect(() => {
    if (isSearchOpen && window.innerWidth < 768) {
      // Auto focus after a short delay to allow transition
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      if (query.trim() === '') {
        setQuery('');
      }
    }
  }, [isSearchOpen, setQuery]);

  if (!isSearchOpen) return null;

  return (
    <div 
      className="md:hidden fixed inset-0 z-[100] flex flex-col animate-in slide-in-from-bottom-4 duration-300 bg-gradient-to-b from-black via-black/95 to-primary/30"
    >
      {/* Top Search Bar */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5 bg-background">
        <button 
          onClick={() => setSearchOpen(false)}
          className="p-2 text-secondary hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 relative flex items-center bg-white/10 rounded-xl px-3 py-2">
          <input 
            ref={inputRef}
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('topbar.search', { defaultValue: 'Поиск...' })}
            className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder-secondary font-medium"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 text-secondary hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 hide-scrollbar">
        {!query && (
          <div className="h-full flex flex-col items-center justify-center opacity-70 px-8 text-center -mt-20">
            <Search size={56} className="mb-6 text-primary" />
            <h3 className="text-xl font-bold mb-2 text-white">Найдите любимую музыку</h3>
            <p className="text-sm text-secondary font-medium">Введите название трека, исполнителя или альбома для поиска.</p>
          </div>
        )}
        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {!loading && query.trim().length >= 2 && results.song.length === 0 && results.album.length === 0 && results.artist.length === 0 && (
          <div className="text-center text-secondary py-12 text-sm">
            {t('common.search_not_found')} «{query}»
          </div>
        )}

        {!loading && (
          <div className="space-y-8 pb-32">
            {/* Tracks */}
            {results.song.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-widest text-secondary mb-4 flex items-center gap-2">
                  <Music size={16} /> {t('sidebar.tracks', { defaultValue: 'Треки' })}
                </h3>
                <div className="flex flex-col gap-2">
                  {results.song.slice(0, 5).map(track => (
                    <div 
                      key={track.id}
                      className="group flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors active:scale-[0.98]"
                      onClick={() => {
                        handlePlaySong(track);
                        setSearchOpen(false);
                      }}
                    >
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                        <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId, 100)} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0">
                          <Play size={16} fill="currentColor" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[15px] text-white truncate">{track.title}</p>
                        <p className="text-[13px] text-secondary truncate">{formatArtistName(track.artist)} • {track.album}</p>
                      </div>
                      <div className="text-[13px] text-secondary font-medium">
                        {formatTime(track.duration)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Albums */}
            {results.album.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-widest text-secondary mb-4 flex items-center gap-2">
                  <Disc size={16} /> {t('sidebar.albums', { defaultValue: 'Альбомы' })}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {results.album.slice(0, 4).map(album => (
                    <div 
                      key={album.id}
                      className="group relative rounded-xl overflow-hidden active:scale-[0.98] transition-transform"
                      onClick={() => {
                        navigateToAlbum(album.id);
                        setSearchOpen(false);
                      }}
                    >
                      <div className="aspect-square bg-[#282828]">
                        <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
                        <p className="font-bold text-sm text-white truncate drop-shadow-md">{album.name}</p>
                        <p className="text-xs text-white/80 truncate drop-shadow-md">{formatArtistName(album.artist)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Artists */}
            {results.artist.length > 0 && (
              <section>
                <h3 className="text-sm font-bold tracking-widest text-secondary mb-4 flex items-center gap-2">
                  <Users size={16} /> {t('sidebar.artists', { defaultValue: 'Исполнители' })}
                </h3>
                <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4 snap-x snap-mandatory">
                  {results.artist.map(artist => (
                    <div key={artist.id} className="w-36 flex-shrink-0 snap-start">
                      <ArtistCard artist={artist} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
