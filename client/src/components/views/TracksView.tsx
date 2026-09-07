import { useEffect, useState, useMemo, useCallback } from 'react';
import { Play, Heart, Clock, Search, FilterX, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchTracks, getCoverArtUrl, getArtists } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { useDownloadStore, isItemDownloaded, getOfflineTracks } from '../../store/downloadStore';
import ArtistAvatar from '../common/ArtistAvatar';
import TrackRow from '../common/TrackRow';
import { useTrackFilters } from '../../hooks/useTrackFilters';
import { useSettingsStore } from '../../store/settingsStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { Virtuoso } from 'react-virtuoso';

export default function TracksView() {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const [tracks, setTracks] = useState<any[]>([]);
  const [globalArtists, setGlobalArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const activeFilter = useUIStore(s => s.activeFilter);
  const downloads = useDownloadStore(state => state.downloads);
  const isGuest = usePlayerStore(state => !!state.roomId && state.role !== 'host');

  const baseTracks = useMemo(() => {
    let result = tracks;
    if (activeFilter === 'Favorites') {
      result = result.filter(t => t.userRating && t.userRating >= 4);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
      result = result.filter(t => isItemDownloaded(downloads, t.id, t.albumId));
    }
    return result;
  }, [tracks, activeFilter, isOffline, downloads]);

  const baseArtists = useMemo(() => {
    let result = globalArtists;
    if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
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
    return result;
  }, [globalArtists, activeFilter, isOffline, downloads]);

  const {
    filterLiked,
    setFilterLiked,
    filterRated,
    setFilterRated,
    artistSearch,
    setArtistSearch,
    albumSearch,
    setAlbumSearch,
    selectedArtists,
    setSelectedArtists,
    selectedAlbums,
    filteredArtists,
    filteredAlbums,
    filteredTracks,
    toggleArtist,
    toggleAlbum
  } = useTrackFilters(baseTracks, baseArtists);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        const [tracksData, artistsData] = await Promise.all([
          searchTracks('', 50, 0),
          getArtists()
        ]);
        const sorted = tracksData.sort((a: any, b: any) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
        setTracks(sorted);
        setGlobalArtists(artistsData);
        if (tracksData.length < 50) setHasMore(false);
      } catch (e) {
        console.error('Failed to load initial tracks:', e);
        const offlineList = getOfflineTracks();
        if (offlineList.length > 0) {
          setTracks(offlineList);
        }
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  const loadMoreTracks = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const newTracks = await searchTracks('', 50, tracks.length);
      if (newTracks.length < 50) {
        setHasMore(false);
      }
      setTracks(prev => {
        const combined = [...prev, ...newTracks];
        // optional: deduplicate by id if search3 gives weird results
        const unique = Array.from(new Map(combined.map(t => [t.id, t])).values());
        return unique.sort((a: any, b: any) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
      });
    } catch (e) {
      console.error('Failed to load more tracks:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const finalTracks = filteredTracks;

  const handlePlay = useCallback((index: number) => {
    const mapped: Track[] = finalTracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
      duration: t.duration,
      userRating: t.userRating,
      bitRate: t.bitRate,
      suffix: t.suffix
    }));
    
    const action = useSettingsStore.getState().clickAction;
    
    if (action === 'play_next') {
      usePlayerStore.getState().playNext([mapped[index]]);
    } else {
      usePlayerStore.getState().setQueueAndPlay(mapped, index);
    }
  }, [finalTracks]);

  return (
    <div className="flex h-full bg-transparent md:bg-background text-foreground md:pb-0 relative">
      {/* LEFT SIDEBAR: FILTERS */}
      <div className="hidden md:flex w-64 border-r border-foreground/5 dark:border-0 bg-card flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{t('views.filters')}</h2>
          <button 
            onClick={() => {
              setFilterLiked('all');
              setFilterRated('all');
              setSelectedArtists(new Set());
              setArtistSearch('');
            }}
            className="text-xs text-secondary hover:text-foreground flex items-center gap-1"
          >
            {t('views.reset')} <FilterX size={12} />
          </button>
        </div>

        {/* Liked Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.liked')}</h3>
          <div className="flex bg-foreground/5 rounded-lg overflow-hidden">
            <button onClick={() => setFilterLiked('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'all' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterLiked('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'yes' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterLiked('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'no' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.no')}</button>
          </div>
        </div>

        {/* Rated Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.rated')}</h3>
          <div className="flex bg-foreground/5 rounded-lg overflow-hidden">
            <button onClick={() => setFilterRated('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'all' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterRated('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'yes' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterRated('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'no' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.no')}</button>
          </div>
        </div>

        {/* Artist Filter */}
        <div className="flex flex-col min-h-[160px] mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.artist')}</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input 
              type="text" 
              placeholder={t('views.search_tracks')} 
              value={artistSearch}
              onChange={e => setArtistSearch(e.target.value)}
              className="w-full bg-foreground/5 rounded-md py-1.5 pl-9 pr-3 text-xs text-foreground focus:outline-none transition-colors"
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {filteredArtists.slice(0, 100).map(artist => (
              <div 
                key={artist.name}
                onClick={() => toggleArtist(artist.name)}
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors group ${selectedArtists.has(artist.name) ? 'bg-primary/20 border border-primary/30' : 'hover:bg-foreground/5 border border-transparent'}`}
              >
                <ArtistAvatar 
                  artistName={artist.name} 
                  artistId={artist.id} 
                  className="w-6 h-6 rounded-full overflow-hidden bg-foreground/10 flex-shrink-0 flex items-center justify-center" 
                  fallbackSize={12} 
                />
                <span className={`text-xs truncate ${selectedArtists.has(artist.name) ? 'text-primary font-bold' : 'text-secondary group-hover:text-foreground'}`}>
                  {artist.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Album Filter */}
        <div className="flex-1 flex flex-col min-h-[160px]">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.albums')}</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input 
              type="text" 
              placeholder={t('views.search_albums')} 
              value={albumSearch}
              onChange={e => setAlbumSearch(e.target.value)}
              className="w-full bg-foreground/5 rounded-md py-1.5 pl-9 pr-3 text-xs text-foreground focus:outline-none transition-colors"
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {filteredAlbums.slice(0, 100).map(album => (
              <div 
                key={album}
                onClick={() => toggleAlbum(album)}
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors group ${selectedAlbums.has(album) ? 'bg-primary/20 border border-primary/30' : 'hover:bg-foreground/5 border border-transparent'}`}
              >
                <span className={`text-xs truncate ${selectedAlbums.has(album) ? 'text-primary font-bold' : 'text-secondary group-hover:text-foreground'}`}>
                  {album}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT: TABLE / MOBILE LIST */}
      <div className="flex-1 flex flex-col p-0 md:p-6 overflow-hidden">
        <div className="hidden md:flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black flex items-center gap-3">
            <div className="w-10 h-10 bg-primary text-black rounded-full flex items-center justify-center">
              <Play fill="currentColor" size={20} className="ml-1" />
            </div>
            {t('views.tracks')}
            <span className="bg-foreground/10 text-foreground/50 text-sm font-semibold px-3 py-1 rounded-full">{hasMore ? `${finalTracks.length}+` : finalTracks.length}</span>
          </h1>
        </div>

        <div className="flex flex-col flex-1 bg-transparent md:bg-card md:rounded-xl md:border border-foreground/5 dark:border-0 overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:flex items-center px-6 py-3 border-b border-foreground/5 text-[11px] font-bold tracking-widest text-secondary uppercase bg-background">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 min-w-[200px]">{t('views.title')}</div>
            <div className="w-16 flex justify-center"><Clock size={14} /></div>
            <div className="flex-1 min-w-[150px]">{t('views.album')}</div>
            <div className="w-32 hidden md:block">{t('views.genre')}</div>
            <div className="w-16 text-right hidden lg:block">{t('views.year')}</div>
            {!isGuest && <div className="w-24 flex justify-center gap-4 ml-4"><Heart size={14} /><Ban size={14} /></div>}
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-hidden pt-2 px-4 md:px-0 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.loading')}</div>
            ) : finalTracks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.not_found')}</div>
            ) : (
              <Virtuoso
                data={finalTracks}
                endReached={loadMoreTracks}
                overscan={300}
                className="h-full custom-scrollbar hide-scrollbar-mobile"
                components={{
                  Footer: () => <div className="h-[80px] md:hidden" />
                }}
                itemContent={(index: number, track: any) => (
                  <TrackRow 
                    key={track.id}
                    track={track}
                    index={index}
                    onPlay={handlePlay}
                    variant="tracks"
                  />
                )}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
