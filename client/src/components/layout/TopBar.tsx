import { useRef } from 'react';
import { Search, X, Play, Music, Disc, Users } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { formatTime } from '../../utils/timeFormat';
import { formatArtistName } from '../../utils/formatters';
import JamSessionControl from '../jam/JamSessionControl';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { useUIStore, LEFT_SIDEBAR_DEFAULT_WIDTH, RIGHT_SIDEBAR_DEFAULT_WIDTH } from '../../store/uiStore';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';

export default function TopBar() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<HTMLDivElement>(null);

  const {
    query,
    setQuery,
    results,
    loading,
    isSearchOpen,
    setSearchOpen,
    showSession,
    setShowSession,
    roomId,
    handlePlaySong,
    navigateToAlbum,
    navigateToArtist
  } = useGlobalSearch(inputRef, containerRef, sessionRef);

  const { leftSidebarWidth, setLeftSidebarWidth, rightSidebarWidth, setRightSidebarWidth } = useUIStore();

  const toggleLeftSidebar = () => {
    if (leftSidebarWidth < 80) {
      setLeftSidebarWidth(LEFT_SIDEBAR_DEFAULT_WIDTH);
    } else {
      setLeftSidebarWidth(0);
    }
  };

  const toggleRightSidebar = () => {
    if (rightSidebarWidth < 40) {
      setRightSidebarWidth(RIGHT_SIDEBAR_DEFAULT_WIDTH);
    } else {
      setRightSidebarWidth(0);
    }
  };

  return (
    <div className="sticky top-0 z-50 h-16 bg-background/95 backdrop-blur-md transform-gpu border-b border-white/5 flex items-center justify-between px-4 w-full">
      <div className="w-10 flex justify-center items-center">
        <button 
          onClick={toggleLeftSidebar} 
          className="text-secondary hover:text-foreground transition-colors p-2"
          title={t('common.toggle_menu')}
        >
          <PanelLeft size={20} />
        </button>
      </div>
      <div className="flex items-center gap-2 w-full max-w-xl">
        <div className="relative w-full" ref={containerRef}>
          <div className="relative flex items-center w-full bg-white/10 rounded-full hover:bg-white/15 transition-colors focus-within:bg-white/15 focus-within:ring-2 focus-within:ring-primary/50">
          <Search size={20} className="text-secondary ml-4" />
          <input 
            ref={inputRef}
            type="text" 
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder={t('topbar.search')}
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
          <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-xl transform-gpu border border-white/10 rounded-xl shadow-2xl max-h-[70vh] overflow-y-auto hide-scrollbar p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-[60]">
            
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {!loading && results.song.length === 0 && results.album.length === 0 && results.artist.length === 0 && (
              <div className="text-center text-secondary py-8 text-sm">
                {t('common.search_not_found')} «{query}»
              </div>
            )}

            {!loading && (
              <div className="space-y-6">
                {/* Tracks */}
                {results.song.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-secondary mb-3 flex items-center gap-2">
                      <Music size={14} /> {t('sidebar.tracks')}
                    </h3>
                    <div className="flex flex-col gap-1">
                      {results.song.slice(0, 5).map(track => (
                        <div 
                          key={track.id}
                          className="group flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                          onClick={() => handlePlaySong(track)}
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
                      <Disc size={14} /> {t('sidebar.albums')}
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
                      <Users size={14} /> {t('sidebar.artists')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {results.artist.map(artist => (
                        <div 
                          key={artist.id}
                          onClick={() => navigateToArtist(artist)}
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
      <LanguageSelector />
    </div>

      <div className="relative flex items-center gap-2" ref={sessionRef}>
        <div className="relative">
          <button 
            onClick={() => setShowSession(!showSession)}
            className={`h-10 px-4 rounded-full flex items-center justify-center gap-2 transition-colors ${showSession ? 'bg-primary/20 text-primary' : roomId ? 'bg-primary text-background hover:scale-105' : 'bg-white/5 hover:bg-white/10 text-secondary hover:text-white'}`}
            title={t('common.jam_session')}
          >
            <Users size={18} />
            <span className="text-sm font-bold hidden sm:inline">{t('common.jam_session')}</span>
          </button>
          
          {showSession && (
            <div className="absolute top-full right-0 mt-2 p-4 bg-card/95 backdrop-blur-xl transform-gpu border border-white/10 rounded-xl shadow-2xl w-80 z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
              <h3 className="font-bold text-center mb-1">{t('common.jam_session_title')}</h3>
              <p className="text-xs text-secondary text-center mb-2">{t('common.jam_session_desc')}</p>
              <JamSessionControl />
            </div>
          )}
        </div>
        
        <button 
          onClick={toggleRightSidebar} 
          className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-secondary hover:text-white transition-colors"
          title={t('common.toggle_queue')}
        >
          <PanelRight size={18} />
        </button>
      </div>
    </div>
  );
}
