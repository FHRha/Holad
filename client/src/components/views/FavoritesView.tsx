import { useEffect, useState } from 'react';
import { fetchStarred, getCoverArtUrl } from '../../api/subsonic';
import { Play, Heart, Search, CloudOff, Download, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from '../common/TrackImage';
import AlbumCard from '../common/AlbumCard';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { List } from 'lucide-react';

function FilterChip({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors ${
        isActive ? 'bg-primary text-primary-foreground' : 'bg-[#282828] text-[#b3b3b3] hover:text-white'
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
  const { setQueueAndPlay, likedTrackIds, toggleTrackLike } = usePlayerStore();
  const [mobileTab, setMobileTab] = useState<'tracks' | 'albums' | 'artists'>('tracks');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadStarred();
  }, [likedTrackIds.length]);

  const handleToggleLike = (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    const isLiked = likedTrackIds.includes(trackId);
    toggleTrackLike(trackId);
    if (isLiked) {
      import('../../api/subsonic').then(m => m.unstarItem(trackId));
    } else {
      import('../../api/subsonic').then(m => m.starItem(trackId));
    }
  };

  const loadStarred = async () => {
    try {
      const data = await fetchStarred();
      setAlbums(data.album || []);
      setTracks(data.song || []);
    } catch (error) {
      console.error('Failed to load favorites', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = (index: number, trackList: any[]) => {
    const mappedTracks: Track[] = trackList.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      artistId: t.artistId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration,
      userRating: t.userRating
    }));
    
    const action = useSettingsStore.getState().clickAction;
    
    if (action === 'play_next') {
      usePlayerStore.getState().playNext([mappedTracks[index]]);
    } else {
      setQueueAndPlay(mappedTracks, index);
    }
  };

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
      <div className="hidden md:block flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar">
        <div className="flex items-center gap-6 text-xl font-bold mb-10 text-foreground border-b border-white/5 pb-4">
          <h1 className="text-2xl text-white">{t('views.favorites')}</h1>
        </div>

        {albums.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-bold text-white mb-6">{t('views.favorite_albums')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          </div>
        )}

        {tracks.length > 0 && (
          <div className="mb-10">
            <h2 className="text-xl font-bold text-white mb-6">{t('views.favorite_tracks')}</h2>
            <div className="flex flex-col gap-1">
              {tracks.map((track, index) => {
                const isLiked = likedTrackIds.includes(track.id);
                return (
                  <div 
                    key={track.id} 
                    className="flex items-center gap-4 p-2 rounded-md hover:bg-white/5 group transition-colors cursor-pointer"
                    onDoubleClick={() => handlePlayTrack(index, tracks)}
                  >
                    <div className="w-8 flex justify-center text-secondary relative">
                      <span className="group-hover:hidden">{index + 1}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handlePlayTrack(index, tracks); }}
                        className="hidden group-hover:flex text-primary"
                      >
                        <Play fill="currentColor" size={14} />
                      </button>
                    </div>
                    
                    <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-white/10 relative shadow-sm">
                      {track.coverArt && <TrackImage src={getCoverArtUrl(track.coverArt, 100)} className="w-full h-full object-cover" alt="" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">
                        {track.title}
                      </p>
                      <p className="text-xs text-secondary truncate">
                        {formatArtistName(track.artist)}{track.album ? ` • ${track.album}` : ''}
                      </p>
                    </div>
                    
                    <button 
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleToggleLike(e, track.id)}
                    >
                      <Heart size={16} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-primary" : "text-white/30 hover:text-white"} />
                    </button>

                    <div className="w-12 text-right text-xs text-secondary">
                      {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {albums.length === 0 && tracks.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-secondary">
            <Heart size={48} className="mb-4 text-white/10" />
            <p>{t('views.empty_favorites')}</p>
          </div>
        )}
      </div>

      {/* MOBILE UI */}
      <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto flex-col pb-32 w-full">
        <div className="px-4 pt-4 pb-2 sticky top-0 bg-black/40 backdrop-blur-xl z-10 w-full">
          <div 
            className="flex items-center bg-[#282828] rounded-xl px-3 py-2.5 mb-4 w-full border border-white/5 cursor-text"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
            <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
              Поиск...
            </div>
          </div>
          <div className="flex items-center justify-between mb-4 relative">
            <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar flex-1 pr-14">
              <FilterChip 
                icon={<CloudOff size={16} />} 
                label="Офлайн" 
                isActive={false} 
              />
              <FilterChip 
                icon={<Download size={16} />} 
                label="Загружено" 
                isActive={false} 
              />
            </div>
            <button 
              onClick={() => setViewMode(prev => prev === 'grid' ? 'list' : 'grid')}
              className="absolute right-0 text-[#b3b3b3] hover:text-white transition-colors bg-[#282828] p-2 rounded-full z-10"
            >
              {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
            </button>
          </div>

          <div className="flex bg-[#282828] rounded-xl overflow-hidden w-full p-1 mb-2">
             <button onClick={() => setMobileTab('tracks')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'tracks' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>Песни</button>
             <button onClick={() => setMobileTab('albums')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'albums' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>Альбомы</button>
             <button onClick={() => setMobileTab('artists')} className={`flex-1 py-2 text-[15px] font-bold transition-colors ${mobileTab === 'artists' ? 'bg-[#3e3e3e] text-white rounded-xl' : 'text-[#b3b3b3]'}`}>Исполнители</button>
          </div>
        </div>
        
        <div className="w-full flex-1 flex flex-col px-4">
          {mobileTab === 'tracks' && (
            searchedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center w-full mt-20">
                <Heart size={64} className="mb-6 text-primary" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold text-white mb-4">Нет избранных песен</h2>
                <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                  Отметьте ваши любимые песни, и они появятся здесь или проверьте фильтры
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-4">
                {searchedTracks.map((track, index) => {
                  const isLiked = likedTrackIds.includes(track.id);
                  return (
                    <div 
                      key={track.id} 
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => handlePlayTrack(index, searchedTracks)}
                    >
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-white/10 relative shadow-sm">
                        {track.coverArt && <TrackImage src={getCoverArtUrl(track.coverArt, 100)} className="w-full h-full object-cover" alt="" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold text-white truncate">
                          {track.title}
                        </p>
                        <p className="text-[13px] text-[#b3b3b3] truncate">
                          {formatArtistName(track.artist)}{track.album ? ` • ${track.album}` : ''}
                        </p>
                      </div>
                      
                      <button 
                        onClick={(e) => handleToggleLike(e, track.id)}
                      >
                        <Heart size={18} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-primary" : "text-[#b3b3b3] hover:text-white"} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {mobileTab === 'albums' && (
            searchedAlbums.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-center w-full mt-20">
                <Heart size={64} className="mb-6 text-primary" strokeWidth={1.5} />
                <h2 className="text-2xl font-bold text-white mb-4">Нет избранных альбомов</h2>
                <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                  Отметьте ваши любимые альбомы, и они появятся здесь или проверьте фильтры
                </p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-2 gap-4 py-4" : "flex flex-col gap-4 py-4"}>
                {searchedAlbums.map((album) => (
                  viewMode === 'list' ? (
                    <div 
                      key={album.id} 
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => {
                        if (window.innerWidth < 768) {
                          import('../../store/playerStore').then(m => {
                            m.usePlayerStore.getState().setIsProcessing(true);
                            import('../../api/subsonic').then(api => {
                               api.getAlbum(album.id).then(tracks => {
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
                                 m.usePlayerStore.getState().setQueueAndPlay(mappedTracks, 0);
                                 m.usePlayerStore.getState().setIsProcessing(false);
                               });
                            });
                          });
                        }
                      }}
                    >
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full rounded-md object-cover" alt={album.name} />
                      </div>
                      <div className="flex flex-col flex-1 overflow-hidden">
                        <span className="text-[15px] text-white font-bold truncate">{album.name || album.title}</span>
                        <span className="text-[#b3b3b3] text-[13px] truncate">{album.artist}</span>
                      </div>
                    </div>
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
              <h2 className="text-2xl font-bold text-white mb-4">Нет избранных исполнителей</h2>
              <p className="text-[#b3b3b3] text-[15px] leading-relaxed max-w-[280px]">
                Отметьте ваших любимых исполнителей, и они появятся здесь или проверьте фильтры
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
