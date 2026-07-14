import { useEffect, useState, useMemo } from 'react';
import { formatArtistName } from '../../utils/formatters';
import { Play, Pause, Heart, Clock, Search, FilterX, Users } from 'lucide-react';
import { searchTracks, getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';

export default function TracksView() {
  const [tracks, setTracks] = useState<any[]>([]);
  const [globalArtists, setGlobalArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterLiked, setFilterLiked] = useState<'all' | 'yes' | 'no'>('all');
  const [filterRated, setFilterRated] = useState<'all' | 'yes' | 'no'>('all');
  const [artistSearch, setArtistSearch] = useState('');
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(new Set());

  const { setQueueAndPlay, queue, currentIndex, likedTrackIds, toggleTrackLike, isPlaying } = usePlayerStore();
  const { openMenu } = useContextMenuStore();

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

  const allArtists = useMemo(() => {
    const artistMap = new Map<string, { id: string, name: string }>(); // lower_name -> {id, original_name}
    
    // First, populate artistMap with precise IDs from global artists list
    globalArtists.forEach(a => {
      if (a.name && a.id) {
        artistMap.set(a.name.toLowerCase(), { id: a.id, name: a.name });
      }
    });

    tracks.forEach(t => {
      if (t.artist) {
        // Split by ;, /, ,, •, feat., ft.
        const parts = t.artist.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i);
        parts.forEach((p: string) => {
          const name = p.trim();
          if (name) {
            const lower = name.toLowerCase();
            if (!artistMap.has(lower)) {
              artistMap.set(lower, { id: t.artistId || '', name });
            } else {
               // Update ID if missing
               const existing = artistMap.get(lower)!;
               if (!existing.id && t.artistId) {
                 existing.id = t.artistId;
               }
            }
          }
        });
      }
    });

    return Array.from(artistMap.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks, globalArtists]);

  const filteredArtists = allArtists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()));

  const filteredTracks = useMemo(() => {
    return tracks.filter(t => {
      // Like filter
      const isLiked = likedTrackIds.includes(t.id);
      if (filterLiked === 'yes' && !isLiked) return false;
      if (filterLiked === 'no' && isLiked) return false;
      
      // Rated filter
      const isRated = (t.userRating || 0) > 0;
      if (filterRated === 'yes' && !isRated) return false;
      if (filterRated === 'no' && isRated) return false;

      // Artist filter
      if (selectedArtists.size > 0) {
        if (!t.artist) return false;
        const parts = t.artist.split(/\s*[;\\/,•]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i).map((p: string) => p.trim().toLowerCase());
        const selectedLower = Array.from(selectedArtists).map(s => s.toLowerCase());
        const hasSelected = parts.some((p: string) => selectedLower.includes(p));
        if (!hasSelected) return false;
      }

      return true;
    });
  }, [tracks, filterLiked, filterRated, selectedArtists, likedTrackIds]);

  const handlePlay = (index: number) => {
    const mapped: Track[] = filteredTracks.map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumId: t.albumId,
      coverArt: getCoverArtUrl(t.coverArt || t.id, 300),
      duration: t.duration
    }));
    setQueueAndPlay(mapped, index);
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleArtist = (artist: string) => {
    const newSet = new Set(selectedArtists);
    if (newSet.has(artist)) newSet.delete(artist);
    else newSet.add(artist);
    setSelectedArtists(newSet);
  };

  return (
    <div className="flex h-full bg-background text-foreground">
      {/* LEFT SIDEBAR: FILTERS */}
      <div className="w-64 border-r border-white/5 bg-[#121212] flex flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Фильтры</h2>
          <button 
            onClick={() => {
              setFilterLiked('all');
              setFilterRated('all');
              setSelectedArtists(new Set());
              setArtistSearch('');
            }}
            className="text-xs text-secondary hover:text-white flex items-center gap-1"
          >
            Сбросить <FilterX size={12} />
          </button>
        </div>

        {/* Liked Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">Любимые</h3>
          <div className="flex bg-black rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setFilterLiked('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'all' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Все</button>
            <button onClick={() => setFilterLiked('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'yes' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Да</button>
            <button onClick={() => setFilterLiked('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterLiked === 'no' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Нет</button>
          </div>
        </div>

        {/* Rated Filter */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">Оценённые</h3>
          <div className="flex bg-black rounded-lg border border-white/10 overflow-hidden">
            <button onClick={() => setFilterRated('all')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'all' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Все</button>
            <button onClick={() => setFilterRated('yes')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'yes' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Да</button>
            <button onClick={() => setFilterRated('no')} className={`flex-1 py-1.5 text-xs font-bold transition-colors ${filterRated === 'no' ? 'bg-white/20 text-white' : 'text-secondary hover:bg-white/5'}`}>Нет</button>
          </div>
        </div>

        {/* Artist Filter */}
        <div className="flex-1 flex flex-col min-h-[200px]">
          <h3 className="text-xs font-semibold text-secondary uppercase mb-3">Исполнитель</h3>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input 
              type="text" 
              placeholder="Поиск..." 
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
                <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                  {artist.id ? (
                    <img src={getCoverArtUrl(artist.id, 100)} loading="lazy" alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Users size={12} className="text-secondary" />
                  )}
                </div>
                <span className={`text-xs truncate ${selectedArtists.has(artist.name) ? 'text-primary font-bold' : 'text-secondary group-hover:text-white'}`}>
                  {artist.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT MAIN CONTENT: TABLE */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black flex items-center gap-3">
            <div className="w-10 h-10 bg-primary text-black rounded-full flex items-center justify-center">
              <Play fill="currentColor" size={20} className="ml-1" />
            </div>
            Треки
            <span className="bg-white/10 text-white/50 text-sm font-semibold px-3 py-1 rounded-full">{filteredTracks.length}</span>
          </h1>
        </div>

        <div className="flex flex-col flex-1 bg-card rounded-xl border border-white/5 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center px-6 py-3 border-b border-white/5 text-[11px] font-bold tracking-widest text-secondary uppercase bg-[#181818]">
            <div className="w-10 text-center">#</div>
            <div className="flex-1 min-w-[200px]">Title</div>
            <div className="w-16 flex justify-center"><Clock size={14} /></div>
            <div className="flex-1 min-w-[150px]">Album</div>
            <div className="w-32 hidden md:block">Genre</div>
            <div className="w-16 text-right hidden lg:block">Year</div>
            <div className="w-16 flex justify-center ml-4"><Heart size={14} /></div>
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center h-full text-secondary">Загрузка...</div>
            ) : filteredTracks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-secondary">Ничего не найдено</div>
            ) : (
              <div className="py-2">
                {filteredTracks.map((track, index) => {
                  const currentPlaying = queue[currentIndex]?.id === track.id;
                  const isTrackLiked = likedTrackIds.includes(track.id);

                  return (
                    <div 
                      key={track.id}
                      onClick={() => handlePlay(index)}
                      onContextMenu={(e) => { 
                        e.preventDefault(); 
                        openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || track.albumId, 300) }, 'track'); 
                      }}
                      className={`flex items-center px-6 py-2 cursor-pointer group hover:bg-white/5 transition-colors ${currentPlaying ? 'bg-white/10' : ''}`}
                    >
                      <div className="w-10 text-center text-xs font-semibold text-secondary flex justify-center">
                        {currentPlaying ? (
                          isPlaying ? <Pause size={14} className="text-primary" fill="currentColor" /> : <Play size={14} className="text-primary" fill="currentColor" />
                        ) : (
                          <>
                            <span className="group-hover:hidden">{index + 1}</span>
                            <Play size={14} className="hidden group-hover:block text-white" fill="currentColor" />
                          </>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-[200px] flex items-center gap-3 pr-4">
                        <img src={getCoverArtUrl(track.coverArt || track.albumId, 300)} loading="lazy" alt="" className="w-10 h-10 rounded object-cover shadow-sm" />
                        <div className="flex flex-col min-w-0">
                          <span className={`text-sm font-semibold truncate ${currentPlaying ? 'text-primary' : 'text-white'}`}>{track.title}</span>
                          <span className="text-xs text-secondary truncate">{formatArtistName(track.artist)}</span>
                        </div>
                      </div>

                      <div className="w-16 flex justify-center text-xs font-medium text-secondary">
                        {formatTime(track.duration)}
                      </div>

                      <div className="flex-1 min-w-[150px] text-xs text-secondary truncate pr-4">
                        {track.album}
                      </div>

                      <div className="w-32 text-xs text-secondary truncate hidden md:block pr-4">
                        {track.genre || '-'}
                      </div>

                      <div className="w-16 text-xs text-secondary text-right hidden lg:block pr-4">
                        {track.year || '-'}
                      </div>

                      <div className="w-16 flex justify-center ml-4">
                        <Heart 
                          size={16} 
                          className={`opacity-0 group-hover:opacity-100 transition-opacity ${isTrackLiked ? 'opacity-100 text-primary' : 'text-white/30 hover:text-white'}`}
                          fill={isTrackLiked ? "currentColor" : "none"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTrackLike(track.id);
                            if (isTrackLiked) unstarItem(track.id);
                            else starItem(track.id);
                          }}
                        />
                      </div>
                    </div>
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
