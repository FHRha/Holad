/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useCallback } from 'react';
import { fetchStarred, getCoverArtUrl, getAlbum } from '../../api/subsonic';
import { Heart, Search, CloudOff, Download, LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import TrackImage from '../common/TrackImage';
import TrackRow from '../common/TrackRow';
import AlbumCard from '../common/AlbumCard';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { getOfflineTracks, getDownloadedAlbums } from '../../store/downloadStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import LongPressWrapper from '../common/LongPressWrapper';
import { Virtuoso } from 'react-virtuoso';

function FilterChip({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-all border ${
        isActive ? 'bg-primary text-white border-transparent shadow-md' : 'bg-zinc-200 dark:bg-zinc-800 text-[#b3b3b3] hover:bg-zinc-300 dark:hover:bg-zinc-700 hover:text-foreground border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function FavoritesView() {
  const { t } = useTranslation();
  const { setSearchOpen } = useUIStore();
  const [albums, setAlbums] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
    try {
      const data = await fetchStarred();
      setAlbums(data.album || []);
      setTracks(data.song || []);
    } catch (error) {
      console.error('Failed to load favorites from server, checking local offline items:', error);
      const offlineTracks = getOfflineTracks();
      const offlineAlbums = getDownloadedAlbums();
      const currentLiked = usePlayerStore.getState().likedTrackIds;
      const likedOfflineTracks = offlineTracks.filter(t => currentLiked.includes(t.id));
      setTracks(likedOfflineTracks.length > 0 ? likedOfflineTracks : offlineTracks);
      setAlbums(offlineAlbums);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = useCallback((index: number, trackList: any[]) => {
    const mappedTracks: Track[] = trackList.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating,
      bitRate: t.bitRate,
      suffix: t.suffix
    }));
    
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
      {/* DESKTOP UI */}
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

      {/* MOBILE UI */}
      <div ref={setMobileScrollParent} className="flex md:hidden flex-1 bg-transparent overflow-y-auto flex-col pb-32 w-full">
        <div className="px-4 pt-4 pb-2 sticky top-0 bg-black/40 backdrop-blur-xl z-10 w-full">
          <div 
            className="flex items-center bg-[#282828] rounded-xl px-3 py-2.5 mb-4 w-full border border-white/5 cursor-text"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
            <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
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
              className="absolute right-0 text-[#b3b3b3] hover:text-foreground transition-colors bg-[#282828] p-2 rounded-full z-10"
            >
              {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
          </div>

          <div className="flex bg-[#282828] rounded-xl overflow-hidden w-full p-1 mb-2">
             <button onClick={() => setMobileTab('tracks')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'tracks' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>{t('views.tab_tracks')}</button>
             <button onClick={() => setMobileTab('albums')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'albums' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>{t('views.tab_albums')}</button>
             <button onClick={() => setMobileTab('artists')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'artists' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>{t('views.tab_artists')}</button>
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
                    <LongPressWrapper 
                      key={album.id} 
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => {
                        if (window.innerWidth < 768) {
                          usePlayerStore.getState().setIsProcessing(true);
                          getAlbum(album.id).then(tracks => {
                            const mappedTracks = tracks.map((t: any) => ({
                              id: t.id,
                              title: t.title,
                              artist: t.artist,
                              album: album.title || album.name,
                              albumId: album.id,
                              artistId: t.artistId || album.artistId,
                              coverArt: getCoverArtUrl(album.coverArt || album.id, 300),
                              duration: t.duration,
                              bitRate: t.bitRate,
                              suffix: t.suffix
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
                    >
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full rounded-md object-cover" alt={album.name} />
                      </div>
                      <div className="flex flex-col flex-1 overflow-hidden">
                        <span className="text-[15px] text-foreground font-bold truncate">{album.name || album.title}</span>
                        <span className="text-[#b3b3b3] text-[13px] truncate">{album.artist}</span>
                      </div>
                    </LongPressWrapper>
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
