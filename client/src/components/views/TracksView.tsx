import { useEffect, useState } from 'react';
import { formatArtistName } from '../../utils/formatters';
import { Play, Pause, Heart, Clock, Search, FilterX, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { searchTracks, getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import ArtistAvatar from '../common/ArtistAvatar';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useTrackFilters } from '../../hooks/useTrackFilters';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import LongPressWrapper from '../common/LongPressWrapper';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';

export default function TracksView() {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState<any[]>([]);
  const [globalArtists, setGlobalArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [visibleCount, setVisibleCount] = useState(50);

  const activeFilter = useUIStore(s => s.activeFilter);

  const { setQueueAndPlay, queue, currentIndex, likedTrackIds, toggleTrackLike, isPlaying } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const downloads = useDownloadStore(state => state.downloads);

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
  } = useTrackFilters(tracks, globalArtists);

  useEffect(() => {
    const loadTracks = async () => {
      setLoading(true);
      try {
        const [tracksData, artistsData] = await Promise.all([
          searchTracks('', 3000),
          import('../../api/subsonic').then(m => m.getArtists())
        ]);
        const sorted = tracksData.sort((a: any, b: any) => a.title.localeCompare(b.title));
        setTracks(sorted);
        setGlobalArtists(artistsData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadTracks();
  }, []);

  const finalTracks = (() => {
    let result = filteredTracks;
    if (activeFilter === 'Favorites') {
      result = filteredTracks.filter(t => t.userRating && t.userRating >= 4);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline') {
      result = [];
    }
    return result;
  })();

  const handlePlay = (index: number) => {
    const mapped: Track[] = finalTracks.map(t => ({
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
      usePlayerStore.getState().playNext([mapped[index]]);
    } else {
      setQueueAndPlay(mapped, index);
    }
  };

  return (
    <div className="flex h-full bg-transparent md:bg-background text-foreground pb-24 md:pb-0 relative">
      {/* LEFT SIDEBAR: FILTERS */}
      <div className="hidden md:flex w-64 border-r border-white/5 bg-[#121212] flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">{t('views.filters')}</h2>
          <button 
            onClick={() => {
              setFilterLiked('all');
              setFilterRated('all');
              setSelectedArtists(new Set());
              setArtistSearch('');
            }}
            className="text-xs text-secondary hover:text-white flex items-center gap-1"
          >
            {t('views.reset')} <FilterX size={12} />
          </button>
        </div>

        {/* Liked Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.liked')}</h3>
          <div className="flex bg-black rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setFilterLiked('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'all' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterLiked('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'yes' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterLiked('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'no' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.no')}</button>
          </div>
        </div>

        {/* Rated Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">{t('views.rated')}</h3>
          <div className="flex bg-black rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setFilterRated('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'all' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.all')}</button>
            <button onClick={() => setFilterRated('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'yes' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.yes')}</button>
            <button onClick={() => setFilterRated('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'no' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>{t('views.no')}</button>
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
              className="w-full bg-black border border-white/10 rounded-md py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {filteredArtists.map(artist => (
              <div 
                key={artist.name}
                onClick={() => toggleArtist(artist.name)}
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors group ${selectedArtists.has(artist.name) ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}`}
              >
                <ArtistAvatar 
                  artistName={artist.name} 
                  artistId={artist.id} 
                  className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center" 
                  fallbackSize={12} 
                />
                <span className={`text-xs truncate ${selectedArtists.has(artist.name) ? 'text-primary font-bold' : 'text-secondary group-hover:text-white'}`}>
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
              placeholder={t('views.search_albums', { defaultValue: 'Поиск альбома...' })} 
              value={albumSearch}
              onChange={e => setAlbumSearch(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-md py-1.5 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
            {filteredAlbums.map(album => (
              <div 
                key={album}
                onClick={() => toggleAlbum(album)}
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-colors group ${selectedAlbums.has(album) ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/5 border border-transparent'}`}
              >
                <span className={`text-xs truncate ${selectedAlbums.has(album) ? 'text-primary font-bold' : 'text-secondary group-hover:text-white'}`}>
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
            <span className="bg-white/10 text-white/50 text-sm font-semibold px-3 py-1 rounded-full">{finalTracks.length}</span>
          </h1>
        </div>

        <div className="flex flex-col flex-1 bg-transparent md:bg-card md:rounded-xl md:border border-white/5 overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:flex items-center px-6 py-3 border-b border-white/5 text-[11px] font-bold tracking-widest text-secondary uppercase bg-[#181818]">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 min-w-[200px]">{t('views.title', { defaultValue: 'Title' })}</div>
            <div className="w-16 flex justify-center"><Clock size={14} /></div>
            <div className="flex-1 min-w-[150px]">{t('views.album', { defaultValue: 'Album' })}</div>
            <div className="w-32 hidden md:block">{t('views.genre', { defaultValue: 'Genre' })}</div>
            <div className="w-16 text-right hidden lg:block">{t('views.year', { defaultValue: 'Year' })}</div>
            <div className="w-16 flex justify-center ml-4"><Heart size={14} /></div>
          </div>

          {/* Table Body */}
          <div 
            className="flex-1 overflow-y-auto hide-scrollbar md:custom-scrollbar pt-2 px-4 md:px-0"
            onScroll={(e) => {
              const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 200;
              if (bottom && visibleCount < finalTracks.length) {
                setVisibleCount(prev => prev + 50);
              }
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.loading')}</div>
            ) : finalTracks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-secondary">{t('views.not_found')}</div>
            ) : (
              <div className="py-2 flex flex-col gap-3 md:gap-0">
                {finalTracks.slice(0, visibleCount).map((track, index) => {
                  const currentPlaying = queue[currentIndex]?.id === track.id;
                  const isTrackLiked = likedTrackIds.includes(track.id);

                  return (
                    <LongPressWrapper 
                      key={track.id}
                      onClick={() => handlePlay(index)}
                      onLongPress={(e: any) => { 
                        e.preventDefault(); 
                        openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || track.albumId, 300) }, 'track'); 
                      }}
                      className={`flex items-center md:px-6 md:py-2 cursor-pointer group hover:bg-white/5 transition-colors ${currentPlaying ? 'md:bg-white/10' : ''}`}
                    >
                      <div className="w-10 hidden md:flex text-center text-xs font-semibold text-secondary justify-center">
                        {currentPlaying ? (
                          isPlaying ? <Pause size={14} className="text-primary" fill="currentColor" /> : <Play size={14} className="text-primary" fill="currentColor" />
                        ) : (
                          <>
                            <span className="group-hover:hidden">{index + 1}</span>
                            <Play size={14} className="hidden group-hover:block text-white" fill="currentColor" />
                          </>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0 md:min-w-[200px] flex items-center gap-3 pr-2 md:pr-4">
                        <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId, 300)} alt="" className="w-12 h-12 md:w-10 md:h-10 rounded-md md:rounded object-cover shadow-sm flex-shrink-0" trackId={track.id} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className={`flex items-center gap-2 text-[15px] md:text-sm font-bold md:font-semibold truncate ${currentPlaying ? 'text-primary' : 'text-white'}`}>
                            <span className="truncate">{track.title}</span>
                            {isItemDownloaded(downloads, track.id, track.albumId) && <Download size={14} className="text-primary shrink-0" />}
                          </span>
                          <span className="text-[13px] md:text-xs text-[#b3b3b3] md:text-secondary truncate">{formatArtistName(track.artist)}{track.album ? ` • ${track.album}` : ''}</span>
                        </div>
                      </div>

                      <div className="w-16 hidden md:flex justify-center text-xs font-medium text-secondary">
                        {formatTime(track.duration)}
                      </div>

                      <div className="flex-1 min-w-[150px] text-xs text-secondary truncate hidden md:block pr-4">
                        {track.album}
                      </div>

                      <div className="w-32 text-xs text-secondary truncate hidden md:block pr-4">
                        {track.genre || '-'}
                      </div>

                      <div className="w-16 text-xs text-secondary text-right hidden lg:block pr-4">
                        {track.year || '-'}
                      </div>

                      <div className="w-10 md:w-16 flex items-center justify-end md:justify-center md:ml-4">
                        <Heart 
                          size={18} 
                          className={`md:opacity-0 group-hover:opacity-100 transition-opacity ${isTrackLiked ? 'opacity-100 text-primary' : 'text-[#b3b3b3] md:text-white/30 hover:text-white'}`}
                          fill={isTrackLiked ? "currentColor" : "none"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTrackLike(track.id);
                            if (isTrackLiked) unstarItem(track.id);
                            else starItem(track.id);
                          }}
                        />
                      </div>
                    </LongPressWrapper>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
