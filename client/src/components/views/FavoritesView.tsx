/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useCallback } from 'react';
import { fetchStarred, getAlbum } from '../../api/subsonic';
import { Heart, Search, CloudOff, Download, LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TrackRow from '../common/TrackRow';
import AlbumCard from '../common/AlbumCard';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { getOfflineTracks, getDownloadedAlbums } from '../../store/downloadStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { Virtuoso } from 'react-virtuoso';
import FilterChip from '../common/FilterChip';
import AlbumRow from '../common/AlbumRow';
import { mapSubsonicTracks, mapSubsonicTrack } from '../../utils/trackMapper';

interface FavoritesViewCache {
  albums: any[];
  tracks: any[];
}

let cachedFavoritesData: FavoritesViewCache | null = null;

export default function FavoritesView() {
  const { t } = useTranslation();
  const { setSearchOpen } = useUIStore();
  const [albums, setAlbums] = useState<any[]>(() => cachedFavoritesData?.albums || []);
  const [tracks, setTracks] = useState<any[]>(() => cachedFavoritesData?.tracks || []);
  const [loading, setLoading] = useState(() => !cachedFavoritesData);
  const likedCount = usePlayerStore(s => s.likedTrackIds.length);
  const [mobileTab, setMobileTab] = useState<'tracks' | 'albums' | 'artists'>('tracks');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [desktopScrollParent, setDesktopScrollParent] = useState<HTMLDivElement | null>(null);
  const [mobileScrollParent, setMobileScrollParent] = useState<HTMLDivElement | null>(null);
  const { openMenu } = useContextMenuStore();

  useEffect(() => {
    // oxlint-disable-next-line
    loadStarred();
  }, [likedCount]);

  const loadStarred = async () => {
    if (!cachedFavoritesData) {
      setLoading(true);
    }
    try {
      const data = await fetchStarred();
      const newAlbums = data.album || [];
      const newTracks = data.song || [];
      setAlbums(newAlbums);
      setTracks(newTracks);
      cachedFavoritesData = {
        albums: newAlbums,
        tracks: newTracks,
      };
    } catch (error) {
      console.error('Failed to load favorites from server, checking local offline items:', error);
      const offlineTracks = getOfflineTracks();
      const offlineAlbums = getDownloadedAlbums();
      const currentLiked = usePlayerStore.getState().likedTrackIds;
      const likedOfflineTracks = offlineTracks.filter(t => currentLiked.includes(t.id));
      const fallbackTracks = likedOfflineTracks.length > 0 ? likedOfflineTracks : offlineTracks;
      setTracks(fallbackTracks);
      setAlbums(offlineAlbums);
      cachedFavoritesData = {
        albums: offlineAlbums,
        tracks: fallbackTracks,
      };
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = useCallback((index: number, trackList: any[]) => {
    const mappedTracks: Track[] = mapSubsonicTracks(trackList);
    
    const action = useSettingsStore.getState().clickAction;
    
    if (action === 'play_next') {
      usePlayerStore.getState().playNext([mappedTracks[index]]);
    } else {
      usePlayerStore.getState().setQueueAndPlay(mappedTracks, index);
    }
  }, []);

  const searchedTracks = tracks;
  const searchedAlbums = albums;

  if (loading) {
    return (
      <div className="flex-1 bg-background p-8 flex items-center justify-center">
        <div className="animate-pulse text-primary font-bold text-xl">{t('views.loading_favorites')}</div>
      </div>
    );
  }

  return (
    <>
      <div ref={setDesktopScrollParent} className="hidden md:block flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar">
        <div className="flex items-center gap-6 text-xl font-bold mb-10 text-foreground border-b border-white/5 pb-4">
          <h1 className="text-2xl text-foreground">{t('views.favorites')}</h1>
        </div>

        {albums.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-foreground mb-6">{t('views.favorite_albums')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-foreground mb-6">{t('views.favorite_tracks')}</h2>
            <Virtuoso
              customScrollParent={desktopScrollParent || undefined}
              data={tracks}
              overscan={300}
              itemContent={(index: number, track: any) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  onPlay={(idx) => handlePlayTrack(idx, tracks)}
                  variant="favorites"
                />
              )}
            />
          </div>
        )}

        {albums.length === 0 && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-secondary">
            <Heart size={48} className="mb-4 text-[#282828]" />
            <p>{t('views.empty_favorites')}</p>
          </div>
        )}
      </div>

      <div ref={setMobileScrollParent} className="flex md:hidden flex-1 bg-transparent overflow-y-auto flex-col pb-32 w-full">
        <div className="px-4 pt-4 pb-2 sticky top-0 bg-background/80 backdrop-blur-xl border-b border-border z-10 w-full">
          <div 
            className="flex items-center bg-card rounded-xl px-3 py-2.5 mb-4 w-full border border-border cursor-text shadow-xs"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-secondary mr-2 pointer-events-none" />
            <div className="bg-transparent text-secondary outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
              {t('views.search_placeholder')}
            </div>
          </div>
          <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar flex-1 pr-14">
              <FilterChip 
                icon={<CloudOff size={16} />} 
                label={t('views.filter_offline')} 
                isActive={false} 
              />
              <FilterChip 
                icon={<Download size={16} />} 
                label={t('views.filter_downloaded')} 
                isActive={false} 
              />
            </div>
            <button 
              onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
              className="absolute right-0 text-secondary hover:text-foreground transition-colors bg-card border border-border p-2 rounded-full z-10 shadow-xs"
            >
              {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
          </div>

          <div className="flex bg-card rounded-xl border border-border overflow-hidden w-full p-1 mb-2">
             <button onClick={() => setMobileTab('tracks')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'tracks' ? 'bg-background text-foreground shadow-xs rounded-lg' : 'text-secondary hover:text-foreground'}`}>{t('views.tab_tracks')}</button>
             <button onClick={() => setMobileTab('albums')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'albums' ? 'bg-background text-foreground shadow-xs rounded-lg' : 'text-secondary hover:text-foreground'}`}>{t('views.tab_albums')}</button>
             <button onClick={() => setMobileTab('artists')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'artists' ? 'bg-background text-foreground shadow-xs rounded-lg' : 'text-secondary hover:text-foreground'}`}>{t('views.tab_artists')}</button>
          </div>
        </div>
        
        <div ref={setMobileScrollParent} className="w-full flex-1 flex flex-col px-4">
          {mobileTab === 'tracks' && (
            searchedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center w-full mt-20">
                <Heart size={64} className="mb-6 text-primary" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold text-foreground mb-4">{t('views.no_favorite_tracks')}</h2>
                <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                  {t('views.no_favorite_tracks_desc')}
                </p>
              </div>
            ) : (
              <div className="py-4">
                <Virtuoso
                  customScrollParent={mobileScrollParent || undefined}
                  data={searchedTracks}
                  overscan={300}
                  itemContent={(index: number, track: any) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      index={index}
                      onPlay={(idx) => handlePlayTrack(idx, searchedTracks)}
                      variant="favorites"
                    />
                  )}
                />
              </div>
            )
          )}

          {mobileTab === 'albums' && (
            searchedAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center w-full mt-20">
                <Heart size={64} className="mb-6 text-primary" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold text-foreground mb-4">{t('views.no_favorite_albums')}</h2>
                <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                  {t('views.no_favorite_albums_desc')}
                </p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-4 py-4" : "flex flex-col gap-4 py-4"}>
                {searchedAlbums.map((album) => (
                  viewMode === 'list' ? (
                    <AlbumRow
                      key={album.id}
                      album={album}
                      onClick={() => {
                        if (window.innerWidth < 768) {
                          usePlayerStore.getState().setIsProcessing(true);
                          getAlbum(album.id).then(tracks => {
                            const mappedTracks = tracks.map((t: any) => mapSubsonicTrack({
                              ...t,
                              album: album.title || album.name,
                              albumId: album.id,
                              artistId: t.artistId || album.artistId,
                              coverArt: album.coverArt || album.id,
                            }));
                            usePlayerStore.getState().setQueueAndPlay(mappedTracks, 0);
                            usePlayerStore.getState().setIsProcessing(false);
                          });
                        }
                      }}
                      onLongPress={(e: any) => {
                        e.preventDefault?.();
                        openMenu(e.clientX, e.clientY, album, 'album');
                      }}
                    />
                  ) : (
                    <AlbumCard key={album.id} album={album} />
                  )
                ))}
              </div>
            )
          )}

          {mobileTab === 'artists' && (
            <div className="flex flex-col items-center justify-center flex-1 text-center w-full mt-20">
              <Heart size={64} className="mb-6 text-primary" strokeWidth={1.5} />
              <h2 className="text-2xl font-bold text-foreground mb-4">{t('views.no_favorite_artists')}</h2>
              <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                {t('views.no_favorite_artists_desc')}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
