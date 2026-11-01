import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Play, Heart, Clock, Search, FilterX, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchTracks, getArtists, fetchAlbums } from '../../api/subsonic';
import { fetchLibraryTracks, fetchLibraryArtists, fetchLibraryAlbums } from '../../api/library';
import { mapSubsonicTracks } from '../../utils/trackMapper';
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

interface TracksViewCache {
  tracks: any[];
  globalArtists: any[];
  globalAlbums: any[];
  hasMore: boolean;
}

let cachedTracksData: TracksViewCache | null = null;

export default function TracksView() {
  const { t } = useTranslation();
  const { isOffline } = useNetworkStatus();
  const [tracks, setTracks] = useState<any[]>(() => cachedTracksData?.tracks || []);
  const [globalArtists, setGlobalArtists] = useState<any[]>(() => cachedTracksData?.globalArtists || []);
  const [globalAlbums, setGlobalAlbums] = useState<any[]>(() => cachedTracksData?.globalAlbums || []);
  const [loading, setLoading] = useState(() => !cachedTracksData);

  const activeFilter = useUIStore(s => s.activeFilter);
  const downloads = useDownloadStore(state => state.downloads);
  const isGuest = usePlayerStore(state => !!state.roomId && state.role !== 'host');

  const regularTracksRef = useRef<any[]>(cachedTracksData?.tracks || []);
  const regularHasMoreRef = useRef<boolean>(cachedTracksData?.hasMore ?? true);
  const isFilterModeRef = useRef<boolean>(false);

  const baseTracks = useMemo(() => {
    let result = tracks;
    if (activeFilter === 'Favorites') {
      result = result.filter(t => t.userRating && t.userRating >= 4);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
      result = result.filter(t => isItemDownloaded(downloads, t.id, t.albumId, t));
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

  const baseAlbums = useMemo(() => {
    let result = globalAlbums;
    if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
      const downloadedAlbums = new Set<string>();
      Object.values(downloads).forEach(d => {
        if (d.status === 'completed' && d.album) {
          downloadedAlbums.add(d.album.toLowerCase());
        }
      });
      const offlineTracks = getOfflineTracks();
      offlineTracks.forEach(t => {
        if (t.album) downloadedAlbums.add(t.album.toLowerCase());
      });
      result = result.filter(a => {
        const name = typeof a === 'string' ? a : (a.name || a.title || '');
        return downloadedAlbums.has(name.toLowerCase());
      });
    }
    return result;
  }, [globalAlbums, activeFilter, isOffline, downloads]);

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
    setSelectedAlbums,
    allArtists,
    filteredArtists,
    filteredAlbums,
    filteredTracks,
    toggleArtist,
    toggleAlbum
  } = useTrackFilters(baseTracks, baseArtists, baseAlbums);

  const [hasMore, setHasMore] = useState(() => cachedTracksData ? cachedTracksData.hasMore : true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      if (!cachedTracksData) {
        setLoading(true);
      }
      try {
        let tracksData: any[] = [];
        try {
          const libRes = await fetchLibraryTracks({ limit: 100, offset: 0 });
          if (libRes && Array.isArray(libRes.tracks) && libRes.tracks.length > 0) {
            tracksData = libRes.tracks;
          }
        } catch (libErr) {
          console.warn('[TracksView] Library cache unavailable, falling back to Subsonic API:', libErr);
        }

        const artistsPromise = (async () => {
          try {
            const res = await fetchLibraryArtists({ limit: 10000 });
            if (res && Array.isArray(res.artists) && res.artists.length > 0) {
              return res.artists;
            }
          } catch (e) {
            console.warn('[TracksView] fetchLibraryArtists failed, falling back to getArtists:', e);
          }
          return await getArtists();
        })();

        const albumsPromise = (async () => {
          try {
            const res = await fetchLibraryAlbums({ limit: 10000 });
            if (res && Array.isArray(res.albums) && res.albums.length > 0) {
              return res.albums;
            }
          } catch (e) {
            console.warn('[TracksView] fetchLibraryAlbums failed, falling back to fetchAlbums:', e);
          }
          const fallbackAlbumsRes = await fetchAlbums(0, 1000);
          return Array.isArray(fallbackAlbumsRes) ? fallbackAlbumsRes : [];
        })();

        const [fallbackTracks, artistsData, albumsData] = await Promise.all([
          tracksData.length === 0 ? searchTracks('', 100, 0) : Promise.resolve(tracksData),
          artistsPromise,
          albumsPromise
        ]);
        const finalInitialTracks = tracksData.length > 0 ? tracksData : fallbackTracks;
        const sorted = finalInitialTracks.sort((a: any, b: any) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
        const more = finalInitialTracks.length >= 100;
        setTracks(sorted);
        setGlobalArtists(artistsData || []);
        setGlobalAlbums(albumsData || []);
        setHasMore(more);
        regularTracksRef.current = sorted;
        regularHasMoreRef.current = more;
        cachedTracksData = {
          tracks: sorted,
          globalArtists: artistsData || [],
          globalAlbums: albumsData || [],
          hasMore: more,
        };
      } catch (e) {
        console.error('Failed to load initial tracks:', e);
        const offlineList = getOfflineTracks();
        if (offlineList.length > 0) {
          setTracks(offlineList);
          regularTracksRef.current = offlineList;
        }
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  // Server-side filter fetch on artist or album filter selection
  useEffect(() => {
    if (selectedArtists.size === 0 && selectedAlbums.size === 0) {
      if (isFilterModeRef.current) {
        isFilterModeRef.current = false;
        setTracks(regularTracksRef.current);
        setHasMore(regularHasMoreRef.current);
      }
      return;
    }

    if (!isFilterModeRef.current) {
      regularTracksRef.current = tracks;
      regularHasMoreRef.current = hasMore;
      isFilterModeRef.current = true;
    }

    let cancelled = false;

    const fetchFiltered = async () => {
      try {
        const artistsList = Array.from(selectedArtists);
        const albumsList = Array.from(selectedAlbums);

        let artistId: string | undefined;
        let artistSearchTerm: string | undefined;
        if (artistsList.length > 0) {
          const matchArtist = allArtists.find(a => a.name.toLowerCase() === artistsList[0].toLowerCase());
          if (matchArtist?.id && !matchArtist.id.startsWith('artist_')) {
            artistId = matchArtist.id;
          } else {
            artistSearchTerm = artistsList[0];
          }
        }

        let albumId: string | undefined;
        let albumSearchTerm: string | undefined;
        if (albumsList.length > 0) {
          const matchAlbum = globalAlbums.find(a => {
            const name = typeof a === 'string' ? a : (a.name || a.title);
            return name && name.toLowerCase() === albumsList[0].toLowerCase();
          });
          if (matchAlbum && typeof matchAlbum !== 'string' && matchAlbum.id) {
            albumId = matchAlbum.id;
          } else {
            albumSearchTerm = albumsList[0];
          }
        }

        const searchTerm = artistSearchTerm || albumSearchTerm;

        let serverTracks: any[] = [];
        try {
          const res = await fetchLibraryTracks({
            artistId,
            albumId,
            search: searchTerm,
            limit: 100,
            offset: 0,
          });
          if (res && Array.isArray(res.tracks)) {
            serverTracks = res.tracks;
          }
        } catch (e) {
          console.warn('[TracksView] Server filter fetch failed, falling back:', e);
        }

        if (serverTracks.length === 0) {
          const fallbackTerm = artistsList[0] || albumsList[0] || '';
          if (fallbackTerm) {
            try {
              serverTracks = await searchTracks(fallbackTerm, 100, 0);
            } catch (err) {
              console.warn('[TracksView] Fallback searchTracks failed:', err);
            }
          }
        }

        if (cancelled) return;

        // Merge with any matching tracks from regularTracksRef
        const existingMatching = regularTracksRef.current.filter((t: any) => {
          if (artistsList.length > 0) {
            const match = artistsList.some(a => t.artist?.toLowerCase().includes(a.toLowerCase()));
            if (!match) return false;
          }
          if (albumsList.length > 0) {
            const match = albumsList.some(a => t.album?.toLowerCase().includes(a.toLowerCase()));
            if (!match) return false;
          }
          return true;
        });

        const seenIds = new Set(serverTracks.map((t: any) => t.id));
        const combined = [...serverTracks];
        for (const t of existingMatching) {
          if (!seenIds.has(t.id)) {
            combined.push(t);
            seenIds.add(t.id);
          }
        }

        setTracks(combined);
        setHasMore(serverTracks.length >= 100);
      } catch (err) {
        console.error('[TracksView] Error fetching filtered tracks:', err);
      }
    };

    fetchFiltered();

    return () => {
      cancelled = true;
    };
  }, [selectedArtists, selectedAlbums, allArtists, globalAlbums]);

  const loadMoreTracks = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      if (isFilterModeRef.current) {
        const artistsList = Array.from(selectedArtists);
        const albumsList = Array.from(selectedAlbums);
        let moreFiltered: any[] = [];
        try {
          const res = await fetchLibraryTracks({
            search: artistsList[0] || albumsList[0],
            limit: 100,
            offset: tracks.length,
          });
          if (res && Array.isArray(res.tracks)) {
            moreFiltered = res.tracks;
          }
        } catch {
          // ignore
        }
        if (moreFiltered.length < 100) {
          setHasMore(false);
        }
        setTracks(prev => {
          const ids = new Set(prev.map(t => t.id));
          const inc = moreFiltered.filter(t => !ids.has(t.id));
          return [...prev, ...inc];
        });
        return;
      }

      let newTracks: any[] = [];
      try {
        const libRes = await fetchLibraryTracks({ limit: 100, offset: tracks.length });
        if (libRes && Array.isArray(libRes.tracks) && libRes.tracks.length > 0) {
          newTracks = libRes.tracks;
        }
      } catch {
        // Fallback to Subsonic
      }

      if (newTracks.length === 0) {
        newTracks = await searchTracks('', 100, tracks.length);
      }

      if (newTracks.length < 100) {
        setHasMore(false);
      }
      setTracks(prev => {
        const existingIds = new Set(prev.map(t => t.id));
        const incoming = (newTracks || []).filter((t: any) => !existingIds.has(t.id));
        const combined = [...prev, ...incoming];
        regularTracksRef.current = combined;
        regularHasMoreRef.current = (newTracks || []).length >= 100;
        if (cachedTracksData) {
          cachedTracksData.tracks = combined;
          cachedTracksData.hasMore = (newTracks || []).length >= 100;
        }
        return combined;
      });
    } catch (e) {
      console.error('Failed to load more tracks:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const finalTracks = filteredTracks;

  const handlePlay = useCallback((index: number) => {
    const mapped: Track[] = mapSubsonicTracks(finalTracks);
    
    const action = useSettingsStore.getState().clickAction;
    
    if (action === 'play_next') {
      usePlayerStore.getState().playNext([mapped[index]]);
    } else {
      usePlayerStore.getState().setQueueAndPlay(mapped, index);
    }
  }, [finalTracks]);

  return (
    <div className="flex h-full bg-transparent md:bg-background text-foreground md:pb-0 relative">
      <div className="hidden md:flex w-64 border-r border-foreground/5 dark:border-0 bg-card flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{t('views.filters')}</h2>
          <button 
            onClick={() => {
              setFilterLiked('all');
              setFilterRated('all');
              setSelectedArtists(new Set());
              setSelectedAlbums(new Set());
              setArtistSearch('');
              setAlbumSearch('');
            }}
            className="text-xs text-secondary hover:text-foreground flex items-center gap-1"
          >
            {t('views.reset')} <FilterX size={12} />
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.liked')}</h3>
          <div className="flex bg-foreground/5 rounded-lg overflow-hidden">
            <button onClick={() => setFilterLiked('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'all' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterLiked('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'yes' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterLiked('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'no' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.no')}</button>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.rated')}</h3>
          <div className="flex bg-foreground/5 rounded-lg overflow-hidden">
            <button onClick={() => setFilterRated('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'all' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterRated('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'yes' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterRated('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'no' ? 'bg-foreground/20 text-foreground' : 'text-secondary hover:bg-foreground/5'}`}>{t('views.no')}</button>
          </div>
        </div>

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
          <div className="hidden md:flex items-center px-6 py-3 border-b border-foreground/5 text-[11px] font-bold tracking-widest text-secondary uppercase bg-background">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 min-w-[200px]">{t('views.title')}</div>
            <div className="w-16 flex justify-center"><Clock size={14} /></div>
            <div className="flex-1 min-w-[150px]">{t('views.album')}</div>
            <div className="w-32 hidden md:block">{t('views.genre')}</div>
            <div className="w-16 text-right hidden lg:block">{t('views.year')}</div>
            {!isGuest && <div className="w-24 flex justify-center gap-4 ml-4"><Heart size={14} /><Ban size={14} /></div>}
          </div>

          <div className="flex-1 overflow-hidden pt-2 px-4 md:px-0 relative">
            {loading ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.loading')}</div>
            ) : finalTracks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.not_found')}</div>
            ) : (
              <Virtuoso
                data={finalTracks}
                computeItemKey={(index) => finalTracks[index]?.id || index}
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