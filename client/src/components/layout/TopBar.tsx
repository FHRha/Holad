import { useEffect, useState, useRef } from 'react';
import { Search, X, Play, Music, Disc, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchAll, getCoverArtUrl } from '../../api/subsonic';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import { formatTime } from '../../utils/timeFormat';
import { formatArtistName } from '../../utils/formatters';

export default function TopBar() {
  const { isSearchOpen, setSearchOpen } = useUIStore();
  const { setQueueAndPlay } = usePlayerStore();
  const navigate = useNavigate();
  
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{song: any[], album: any[], artist: any[]}>({ song: [], album: [], artist: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [setSearchOpen]);

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const data = await searchAll(query);
          setResults({
            song: data.song || [],
            album: data.album || [],
            artist: data.artist || []
          });
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      } else {
        setResults({ song: [], album: [], artist: [] });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const playTrack = (track: any) => {
    setQueueAndPlay([{
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumId: track.albumId,
      coverArt: getCoverArtUrl(track.coverArt || track.albumId, 300),
      duration: track.duration
    }]);
    setSearchOpen(false);
  };

  const navigateToAlbum = (id: string) => {
    navigate(`/Holad/album/${id}`);
    setSearchOpen(false);
  };

  return (
    <div className="sticky top-0 z-50 h-16 bg-background/95 backdrop-blur-md border-b border-white/5 flex items-center justify-center px-4 w-full">
      <div className="relative w-full max-w-xl" ref={containerRef}>
        <div className="relative flex items-center w-full bg-white/10 rounded-full hover:bg-white/15 transition-colors focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-primary/50">
          <Search size={20} className="text-secondary ml-4" />
          <input 
            ref={inputRef}
            type="text" 
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Что хочешь включить?"
            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground px-4 py-3 placeholder-secondary font-medium rounded-full"
          />
          {query && (
            <button 
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="text-secondary hover:text-foreground p-2 mr-1 transition-colors"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Dropdown Results */}
        {isSearchOpen && (query.trim().length >= 2 || loading) && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl max-h-[70vh] overflow-y-auto hide-scrollbar p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-[60]">
            
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {!loading && results.song.length === 0 && results.album.length === 0 && results.artist.length === 0 && (
              <div className="text-center text-secondary py-8 text-sm">
                Ничего не найдено по запросу «{query}»
              </div>
            )}

            {!loading && (
              <div className="space-y-6">
                {/* Tracks */}
                {results.song.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 flex items-center gap-2">
                      <Music size={14} /> Треки
                    </h3>
                    <div className="flex flex-col gap-1">
                      {results.song.slice(0, 5).map(track => (
                        <div 
                          key={track.id}
                          className="group flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => playTrack(track)}
                        >
                          <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <img src={getCoverArtUrl(track.coverArt || track.albumId, 100)} className="w-full h-full object-cover" alt="" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Play size={16} fill="currentColor" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-foreground truncate">{track.title}</p>
                            <p className="text-xs text-secondary truncate">{formatArtistName(track.artist)} • {track.album}</p>
                          </div>
                          <div className="text-xs text-secondary/50 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 flex items-center gap-2">
                      <Disc size={14} /> Альбомы
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {results.album.slice(0, 3).map(album => (
                        <div 
                          key={album.id}
                          className="group relative rounded-lg overflow-hidden cursor-pointer"
                          onClick={() => navigateToAlbum(album.id)}
                        >
                          <div className="aspect-square bg-white/5">
                            <img src={getCoverArtUrl(album.coverArt || album.id, 300)} loading="lazy" className="w-full h-full object-cover" alt="" />
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                            <p className="font-bold text-xs text-white truncate drop-shadow-md">{album.name}</p>
                            <p className="text-[10px] text-white/80 truncate drop-shadow-md">{formatArtistName(album.artist)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Artists */}
                {results.artist.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 flex items-center gap-2">
                      <Users size={14} /> Исполнители
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {results.artist.map(artist => (
                        <div 
                          key={artist.id}
                          className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer text-xs font-medium transition-colors"
                        >
                          {formatArtistName(artist.name)}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
