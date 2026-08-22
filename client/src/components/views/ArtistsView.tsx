import { useEffect, useState, useMemo } from 'react';
import { getArtists } from '../../api/subsonic';
import ArtistCard from '../common/ArtistCard';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useDownloadStore, getOfflineTracks } from '../../store/downloadStore';
import { useDebounce } from '../../hooks/useDebounce';
import { VirtuosoGrid } from 'react-virtuoso';

export default function ArtistsView() {
  const { t } = useTranslation();
  const activeFilter = useUIStore(s => s.activeFilter);
  const { isOffline } = useNetworkStatus();
  const downloads = useDownloadStore(state => state.downloads);
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getArtists().then(data => {
      // data is an array of { id, name, albumCount, starred, ... }
      // The user wants artists sorted by importance (e.g. albums/tracks count)
      
      const sorted = [...data].sort((a, b) => {
        // First sort by starred
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        
        // Then by album count (usually correlates with track count)
        const countA = a.albumCount || 0;
        const countB = b.albumCount || 0;
        if (countA !== countB) {
          return countB - countA;
        }
        
        // Finally by name
        return a.name.localeCompare(b.name);
      });
      
      setArtists(sorted);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      
      const offlineTracks = getOfflineTracks();
      const currentDownloads = useDownloadStore.getState().downloads;
      
      const artistMap = new Map<string, any>();
      
      offlineTracks.forEach(t => {
        if (t.artist) {
          const lower = t.artist.toLowerCase();
          if (!artistMap.has(lower)) {
            artistMap.set(lower, {
              id: t.artistId || lower,
              name: t.artist,
              albumCount: 1,
              starred: false
            });
          }
        }
      });
      
      Object.values(currentDownloads).forEach(d => {
        if (d.status === 'completed' && d.artist) {
          const lower = d.artist.toLowerCase();
          if (!artistMap.has(lower)) {
            artistMap.set(lower, {
              id: lower,
              name: d.artist,
              albumCount: d.type === 'album' ? 1 : 0,
              starred: false
            });
          }
        }
      });
      
      const sorted = Array.from(artistMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setArtists(sorted);
      setLoading(false);
    });
  }, []);

  const debouncedSearch = useDebounce(search, 300);

  const filteredArtists = useMemo(() => {
    let result = artists;
    if (activeFilter === 'Favorites') {
      result = result.filter(a => a.starred);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
      const downloadedArtists = new Set<string>();
      Object.values(downloads).forEach(d => {
        if (d.status === 'completed' && d.artist) {
          downloadedArtists.add(d.artist.toLowerCase());
        }
      });
      const offlineTracks = getOfflineTracks();
      offlineTracks.forEach(t => {
        if (t.artist) downloadedArtists.add(t.artist.toLowerCase());
      });
      result = result.filter(a => downloadedArtists.has(a.name?.toLowerCase() || ''));
    }
    
    if (!debouncedSearch.trim()) return result;
    const lower = debouncedSearch.toLowerCase();
    return result.filter(a => a.name?.toLowerCase().includes(lower));
  }, [artists, debouncedSearch, activeFilter, isOffline, downloads]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.loading_artists')}</div>;
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-transparent md:bg-card relative md:p-0">
      {/* Header section similar to Albums */}
      <div className="hidden md:flex sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-foreground">{t('views.artists')}</h1>
        
        <div className="relative w-64 hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input 
            type="text" 
            placeholder={t('views.search_artist')} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-black/50 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white/30 focus:bg-black/80 transition-all"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden flex flex-col px-4 pt-4 md:p-6">
        {/* Mobile search */}
        <div className="relative w-full mb-6 md:hidden shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#b3b3b3]" />
          <input 
            type="text" 
            placeholder={t('views.search_artist')} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#282828] border-none rounded-xl py-2.5 pl-10 pr-4 text-[15px] font-medium text-white placeholder-[#b3b3b3] outline-none transition-all"
          />
        </div>

        {filteredArtists.length === 0 ? (
          <div className="text-center text-secondary py-12">
            {t('views.artists_not_found')}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <VirtuosoGrid
              data={filteredArtists}
              className="h-full custom-scrollbar"
              listClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 md:gap-6 pr-6 md:pr-0 pb-32 md:pb-8"
              itemContent={(_index: number, artist: any) => (
                <ArtistCard key={artist.id} artist={artist} />
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
