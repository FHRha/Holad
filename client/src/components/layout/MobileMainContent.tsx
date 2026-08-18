import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, CloudOff, Download, Heart, Music, Clock, Users, Flame, Shuffle, RefreshCw, ChevronRight, ChevronLeft, Star, Loader2, Play } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import * as subsonicApi from '../../api/subsonic';
import TrackImage from '../common/TrackImage';
import { getCoverArtUrl, fetchRandomTracks, getSongsByGenre } from '../../api/subsonic';
import { useUIStore } from '../../store/uiStore';
import type { Track } from '../../store/playerStore';
import { useHistoryStore, getFilteredHistory, calculateStats } from '../../store/historyStore';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDownloadStore, isItemDownloaded, getOfflineTracks, getDownloadedAlbums } from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { toggleOfflineMode } from '../../utils/networkStatus';
import MobileJamModal from '../modals/MobileJamModal';
import { useContextMenuStore } from '../../store/contextMenuStore';
import LongPressWrapper from '../common/LongPressWrapper';


function ScrollableSection({ title, children, onRefresh }: { title: string, children: React.ReactNode, onRefresh?: () => void }) {
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
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
        <div className="flex items-center gap-3 text-[#b3b3b3]">
          {onRefresh && (
            <button onClick={() => {
              onRefresh();
              scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
            }} className="hover:text-white transition-colors active:scale-95">
              <RefreshCw size={20} />
            </button>
          )}
          {canScrollLeft && (
            <button onClick={() => scroll('left')} className="hover:text-white transition-colors active:scale-95">
              <ChevronLeft size={24} />
            </button>
          )}
          <button 
            onClick={() => scroll('right')} 
            className={`transition-colors active:scale-95 ${canScrollRight ? 'hover:text-white' : 'opacity-30 cursor-not-allowed'}`}
            disabled={!canScrollRight}
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-4 overflow-x-auto hide-scrollbar pb-4 -mx-4 px-4 snap-x snap-mandatory scroll-pl-4"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {children}
      </div>
    </section>
  );
}

interface MobileMainContentProps {
  albums: any[];
  recentTracks: any[];
  frequentAlbums: any[];
  genres: any[];
}

export default function MobileMainContent({ albums, recentTracks, frequentAlbums, genres }: MobileMainContentProps) {
  const { t } = useTranslation();
  const { setSearchOpen, activeFilter, setActiveFilter, setOfflineModalOpen } = useUIStore();
  const { hideOfflineExplanationModal } = useSettingsStore();
  const { isOffline } = useNetworkStatus();
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const [loadingStation, setLoadingStation] = useState<string | null>(null);
  const [refreshRecentKey, setRefreshRecentKey] = useState(0);
  const [refreshFrequentKey, setRefreshFrequentKey] = useState(0);
  const downloads = useDownloadStore(state => state.downloads);
  const roomId = usePlayerStore(state => state.roomId);
  const [isJamModalOpen, setIsJamModalOpen] = useState(false);
  const { openMenu } = useContextMenuStore();
  
  const prevIsOfflineRef = useRef(isOffline);
  
  useEffect(() => {
    if (prevIsOfflineRef.current === false && isOffline) {
      if (activeFilter !== 'Offline' && activeFilter !== 'Downloaded') {
        setActiveFilter('Downloaded');
      }
    } else if (prevIsOfflineRef.current === true && !isOffline) {
      if (activeFilter === 'Offline' || activeFilter === 'Downloaded') {
        setActiveFilter(null);
      }
    }
    prevIsOfflineRef.current = isOffline;
  }, [isOffline, activeFilter, setActiveFilter]);
  
  const navigate = useNavigate();
  const history = useHistoryStore(s => s.history);
  const stats = useMemo(() => calculateStats(getFilteredHistory(history, 7)), [history]); // 7 day preview on home

  const finalRecent = useMemo(() => {
    if (activeFilter === 'Offline' || activeFilter === 'Downloaded' || isOffline) {
      return getOfflineTracks();
    }
    const displayRecent = activeFilter === 'Favorites' 
      ? recentTracks.filter(t => t.userRating && t.userRating >= 4)
      : recentTracks;
    return displayRecent;
  }, [activeFilter, recentTracks, isOffline]);

  const finalFrequent = useMemo(() => {
    if (activeFilter === 'Offline' || activeFilter === 'Downloaded' || isOffline) {
      return getDownloadedAlbums();
    }
    const displayFrequent = activeFilter === 'Favorites'
      ? frequentAlbums.filter(a => a.userRating && a.userRating >= 4)
      : frequentAlbums;
    return displayFrequent;
  }, [activeFilter, frequentAlbums, isOffline]);

  const actualRecent = useMemo(() => {
    if (activeFilter) return finalRecent;
    return finalRecent.length > 0 ? finalRecent : [...recentTracks].sort(() => Math.random() - 0.5).slice(0, 10);
  }, [recentTracks, finalRecent, refreshRecentKey, activeFilter]);

  const actualFrequent = useMemo(() => {
    if (activeFilter) return finalFrequent;
    return finalFrequent.length > 0 ? finalFrequent : [...albums].sort(() => Math.random() - 0.5).slice(0, 10);
  }, [albums, finalFrequent, refreshFrequentKey, activeFilter]);

  const visibleGenres = useMemo(() => {
    if (activeFilter === 'Offline' || activeFilter === 'Downloaded' || isOffline) {
      const offline = getOfflineTracks();
      return genres.filter(g => 
        offline.some(t => t.genre?.toLowerCase() === g.value.toLowerCase())
      );
    }
    return genres;
  }, [genres, activeFilter, isOffline, downloads]);

  const toggleFilter = (filter: string) => {
    setActiveFilter(activeFilter === filter ? null : filter);
  };

  const handleOfflineFilterClick = () => {
    if (activeFilter === 'Offline' || isOffline) {
      if (!hideOfflineExplanationModal) {
        setOfflineModalOpen(true);
      } else {
        toggleOfflineMode();
        setActiveFilter(null);
      }
    } else {
      toggleOfflineMode();
      setActiveFilter('Downloaded'); // Auto-switch to Downloaded filter
    }
  };

  const mapTracks = (tracks: any[]): Track[] => {
    return tracks.map((t: any) => ({
      id: t.id,
      title: t.title || t.name,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating
    }));
  };

  const startRandomRadio = async () => {
    setLoadingStation('random');
    try {
      let tracks: any[] = [];
      if (activeFilter === 'Offline' || activeFilter === 'Downloaded' || isOffline) {
        tracks = [...getOfflineTracks()].sort(() => Math.random() - 0.5).slice(0, 50);
      } else {
        tracks = await fetchRandomTracks(50);
      }
      if (tracks && tracks.length > 0) setQueueAndPlay(mapTracks(tracks), 0);
    } finally {
      setLoadingStation(null);
    }
  };

  const startGenreRadio = async (genreName: string) => {
    setLoadingStation(genreName);
    try {
      let tracks: any[] = [];
      if (activeFilter === 'Offline' || activeFilter === 'Downloaded' || isOffline) {
        tracks = getOfflineTracks()
          .filter(t => t.genre?.toLowerCase() === genreName.toLowerCase())
          .sort(() => Math.random() - 0.5)
          .slice(0, 50);
      } else {
        tracks = await getSongsByGenre(genreName, 50);
      }
      if (tracks && tracks.length > 0) setQueueAndPlay(mapTracks(tracks), 0);
    } finally {
      setLoadingStation(null);
    }
  };

  const playRecentTrack = (track: any) => {
    const t = mapTracks([track])[0];
    setQueueAndPlay([t], 0);
  };

  return (
    <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto flex-col pb-32">
      {/* Search & Filter Chips */}
      <div className="px-4 pt-4 pb-2 sticky top-0 bg-black/40 backdrop-blur-xl z-10">
        <div className="flex items-center gap-3 mb-4">
          <div 
            className="flex-1 flex items-center bg-[#282828] rounded-xl px-3 py-2.5 border border-white/5 cursor-text"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
            <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
              {t('views.search_tracks')}
            </div>
          </div>
          <button 
            onClick={() => setIsJamModalOpen(true)}
            className={`h-[44px] w-[44px] flex-shrink-0 flex items-center justify-center rounded-full shadow-lg hover:scale-105 active:scale-95 transition-transform ${roomId ? 'bg-primary text-background' : 'bg-[#282828] border border-white/5 text-[#b3b3b3]'}`}
          >
            <Users size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
          <FilterChip 
            icon={<CloudOff size={16} />} 
            label={t('common.offline')} 
            isActive={activeFilter === 'Offline' || isOffline} 
            onClick={handleOfflineFilterClick} 
            testId="mobile-offline-chip"
          />
          <FilterChip 
            icon={<Download size={16} />} 
            label={t('common.downloaded')} 
            isActive={activeFilter === 'Downloaded'} 
            onClick={() => toggleFilter('Downloaded')} 
            testId="mobile-downloaded-chip"
          />
          <FilterChip 
            icon={<Heart size={16} />} 
            label={t('sidebar.favorites')} 
            isActive={activeFilter === 'Favorites'} 
            onClick={() => toggleFilter('Favorites')} 
          />
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-8">
        
        {/* Listening History */}
        <section onClick={() => navigate('/Holad/history')} className="cursor-pointer group">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white tracking-tight group-hover:text-primary transition-colors">{t('views.listening_history')}</h2>
            <ChevronRight size={24} className="text-[#b3b3b3] group-hover:text-white transition-colors" />
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <StatCard icon={<Music size={18} className="text-primary" />} value={stats.totalPlays.toString()} label={t('views.tracks_count_label')} />
            <StatCard icon={<Clock size={18} className="text-primary" />} value={Math.floor(stats.totalListeningSeconds / 3600) + t('views.time_h')} label={t('views.time_label')} />
            <StatCard icon={<Users size={18} className="text-primary" />} value={stats.uniqueArtists.toString()} label={t('views.artists_short')} />
            <StatCard icon={<Flame size={18} className="text-primary" />} value={stats.streak + t('views.days_short')} label={t('views.streak_label')} />
          </div>
        </section>

        {/* On the wave */}
        <ScrollableSection title={t('views.on_the_wave')}>
            <button 
              onClick={startRandomRadio}
              disabled={loadingStation === 'random'}
              className="flex-shrink-0 flex items-center bg-primary text-white border border-transparent rounded-full pl-4 pr-3 py-2 font-bold text-[15px] transition-all hover:scale-105 active:scale-95 shadow-md disabled:opacity-50"
            >
              {loadingStation === 'random' ? <Loader2 size={18} className="animate-spin mr-2" /> : <Shuffle size={18} className="mr-2" />}
              {t('common.shuffle')}
              <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-2"></div>
            </button>
            {visibleGenres.map((g, idx) => {
              const spotifyColors = [
                'bg-[#E13300]', 'bg-[#1E3264]', 'bg-[#E8115B]', 'bg-[#148A08]', 
                'bg-[#509BF5]', 'bg-[#FF4632]', 'bg-[#BA5D07]', 'bg-[#7358FF]', 
                'bg-[#8D67AB]', 'bg-[#477D95]', 'bg-[#E1118C]', 'bg-[#006450]'
              ];
              const colorClass = spotifyColors[idx % spotifyColors.length];

              return (
                <button 
                  key={idx} 
                  onClick={() => startGenreRadio(g.value)}
                  disabled={loadingStation === g.value}
                  className={`flex-shrink-0 flex items-center ${colorClass} text-white hover:brightness-110 border border-transparent rounded-full pl-4 pr-3 py-2 font-bold text-[15px] transition-all hover:scale-105 active:scale-95 disabled:opacity-50`}
                >
                  {loadingStation === g.value && <Loader2 size={14} className="animate-spin mr-2" />}
                  {g.value}
                  <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-2"></div>
                </button>
              );
            })}
        </ScrollableSection>

        {/* Recently Played */}
        <ScrollableSection title={isOffline || activeFilter === 'Downloaded' ? t('views.downloaded_tracks') : t('views.recently_played')} onRefresh={() => setRefreshRecentKey(k => k + 1)}>
            {actualRecent.map(track => (
              <LongPressWrapper 
                key={track.id} 
                className="flex flex-col gap-2 flex-shrink-0 w-36 lg:w-40 cursor-pointer snap-start"
                onClick={() => playRecentTrack(track)}
                onLongPress={(e: any) => {
                  e.preventDefault?.();
                  openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || track.id, 300) }, 'track');
                }}
              >
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#282828]">
                  <TrackImage src={getCoverArtUrl(track.coverArt || track.id, 300)} className="w-full h-full object-cover" alt={track.title || track.name} trackId={track.id} />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center pl-1 text-black">
                      <Play fill="currentColor" size={20} />
                    </div>
                  </div>
                  {(track.userRating > 0) && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-primary text-xs font-bold bg-black/40 px-1.5 py-0.5 rounded-full">
                      <Star size={10} fill="currentColor" />
                      {track.userRating}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-[15px] font-bold text-white truncate">
                    <span className="truncate">{track.title || track.name}</span>
                    {isItemDownloaded(downloads, track.id, track.albumId) && <Download size={14} className="text-primary shrink-0" />}
                  </span>
                  <span className="text-[13px] text-[#b3b3b3] truncate">{track.artist}</span>
                </div>
              </LongPressWrapper>
            ))}
        </ScrollableSection>

        {/* Frequently Listened */}
        <ScrollableSection title={isOffline || activeFilter === 'Downloaded' ? t('views.downloaded_albums') : t('views.frequently_played')} onRefresh={() => setRefreshFrequentKey(k => k + 1)}>
            {actualFrequent.map(album => (
              <LongPressWrapper 
                key={album.id} 
                className="flex flex-col gap-2 flex-shrink-0 w-36 lg:w-40 cursor-pointer snap-start"
                onClick={() => {
                  usePlayerStore.getState().setIsProcessing(true);
                  subsonicApi.getAlbum(album.id).then(tracks => {
                        const mappedTracks = tracks.map((t: any) => ({
                          id: t.id,
                          title: t.title,
                          artist: t.artist,
                          album: album.title || album.name,
                          albumId: album.id,
                          artistId: t.artistId || album.artistId,
                          coverArt: getCoverArtUrl(album.coverArt || album.id, 300),
                          duration: t.duration
                        }));
                        usePlayerStore.getState().setQueueAndPlay(mappedTracks, 0);
                        usePlayerStore.getState().setIsProcessing(false);
                      });
                }}
                onLongPress={(e: any) => {
                  e.preventDefault?.();
                  openMenu(e.clientX, e.clientY, album, 'album');
                }}
              >
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#282828]">
                  <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full object-cover" alt={album.name || album.title} trackId={album.id} />
                  {(album.userRating > 0) && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 text-primary text-xs font-bold bg-black/40 px-1.5 py-0.5 rounded-full">
                      <Star size={10} fill="currentColor" />
                      {album.userRating}
                    </div>
                  )}
                </div>
                <div className="flex flex-col">
                  <span className="text-[15px] font-bold text-white truncate">{album.name || album.title}</span>
                  <span className="text-[13px] text-[#b3b3b3] truncate">{album.artist}</span>
                </div>
              </LongPressWrapper>
            ))}
        </ScrollableSection>

      </div>
      <MobileJamModal isOpen={isJamModalOpen} onClose={() => setIsJamModalOpen(false)} />
    </div>
  );
}

function FilterChip({ icon, label, isActive, onClick, testId }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void, testId?: string }) {
  return (
    <button 
      onClick={onClick}
      data-testid={testId}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-all border ${
        isActive 
          ? 'bg-primary text-white border-transparent shadow-md' 
          : 'bg-white/5 text-[#b3b3b3] hover:bg-white/10 hover:text-white border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode, value: string, label: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-[#181818] rounded-xl p-2 gap-1.5 overflow-hidden">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-0.5">
        {icon}
      </div>
      <span className="text-white font-bold text-sm leading-none truncate w-full text-center px-0.5">{value}</span>
      <span className="text-[#b3b3b3] text-[10px] font-medium leading-none truncate w-full text-center">{label}</span>
    </div>
  );
}
