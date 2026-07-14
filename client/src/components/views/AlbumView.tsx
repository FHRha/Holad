import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause, Heart, Star, MoreHorizontal, Clock, Radio, Music, ListPlus } from 'lucide-react';
import { getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import { formatArtistName } from '../../utils/formatters';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useAlbumData } from '../../hooks/useAlbumData';

export default function AlbumView() {
  const { id } = useParams();
  const observerTarget = useRef<HTMLDivElement>(null);
  
  const { queue, currentIndex, likedTrackIds, toggleTrackLike, isPlaying } = usePlayerStore();
  const { openMenu } = useContextMenuStore();

  const {
    album,
    dominantColor,
    visibleCount,
    isLiked,
    handlePlayAll,
    handlePlayNext,
    handleAddToEnd,
    handleLike,
    handleRate,
    handlePlaySong
  } = useAlbumData(id, observerTarget);

  if (!album) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;

  const coverUrl = getCoverArtUrl(album.coverArt || album.id, 600);
  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} Ч ${m} М`;
    return `${m} МИН`;
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 overflow-y-auto relative h-full bg-background custom-scrollbar">
      {/* Background Gradient */}
      <div 
        className="absolute top-0 left-0 right-0 h-[500px] opacity-30 pointer-events-none transition-colors duration-1000"
        style={{ background: `linear-gradient(to bottom, ${dominantColor}, transparent)` }}
      />

      <div className="relative z-10 px-8 py-10 flex flex-col gap-10 min-h-full">
        {/* Header Section */}
        {(() => {
          const firstSong = album.song?.[0];
          const displayYear = album.year || firstSong?.year || '2023';
          
          return (
            <div className="flex flex-col md:flex-row gap-8 items-end">
              <img src={coverUrl} alt="Album Cover" className="w-48 h-48 md:w-64 md:h-64 rounded-xl shadow-2xl object-cover" />
              
              <div className="flex flex-col gap-2 flex-1 w-full">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-white/70">Альбом</span>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white tracking-tight leading-none mb-2 line-clamp-2">{album.name}</h1>
                
                <div className="flex flex-wrap items-center gap-2 text-sm text-white/70 font-medium mb-1">
                  <Music size={14} className="mr-1" />
                  <span>{displayYear}</span>
                  <span>•</span>
              <span>{album.songCount} треков</span>
              <span>•</span>
              <span>{formatDuration(album.duration)}</span>
              <span>•</span>
              <span>{album.playCount || 0} прослушиваний</span>
            </div>
            
            <div className="text-xl font-bold text-white mb-4 hover:underline cursor-pointer w-max">{formatArtistName(album.artist)}</div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handlePlayAll} className="bg-white text-black px-8 py-3 rounded-full font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform">
                <Play fill="currentColor" size={18} /> Играть
              </button>
              
              <button onClick={handlePlayNext} className="bg-white/10 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-white/20 transition-colors flex items-center gap-2">
                <ListPlus size={18} /> Воспроизвести следующим
              </button>
              
              <button onClick={handleAddToEnd} className="bg-white/10 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-white/20 transition-colors">
                В конец
              </button>
              
              <button className="bg-white/10 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-white/20 transition-colors flex items-center gap-2">
                <Radio size={16} /> Радио по альбому
              </button>
              
              <div className="flex-1" />
              
              <div className="flex gap-1 text-yellow-400 mr-4">
                {[1, 2, 3, 4, 5].map(v => (
                  <Star 
                    key={v} 
                    size={20} 
                    fill={v <= (album.userRating || 0) ? 'currentColor' : 'transparent'} 
                    className={`cursor-pointer hover:scale-125 transition-transform ${v > (album.userRating || 0) ? 'text-white/30' : ''}`}
                    onClick={() => handleRate(v)}
                  />
                ))}
              </div>
              
              <button onClick={handleLike} className="hover:scale-110 transition-transform">
                <Heart size={28} className={isLiked ? "text-primary" : "text-white/70 hover:text-white"} fill={isLiked ? "currentColor" : "none"} />
              </button>
              
              <button 
                onClick={(e) => openMenu(e.clientX, e.clientY, album, 'album')}
                className="text-white/70 hover:text-white transition-colors ml-2"
              >
                <MoreHorizontal size={28} />
              </button>
            </div>
          </div>
        </div>
        );
        })()}

        {/* Content Section */}
        <div className="flex flex-col lg:flex-row gap-10 mt-6">
          {/* Tracks List */}
          <div className="flex-1 flex flex-col">
            <div className="flex px-4 py-2 text-xs font-semibold tracking-widest text-secondary border-b border-white/10 uppercase mb-2">
              <div className="w-12 text-center">#</div>
              <div className="flex-1">Title</div>
              <div className="w-16 flex justify-center"><Heart size={14} /></div>
              <div className="w-16 text-right"><Clock size={14} className="inline-block" /></div>
            </div>
            
            {album.song?.slice(0, visibleCount).map((track: any, index: number) => {
              const currentPlaying = queue[currentIndex]?.id === track.id;
              const isTrackLiked = likedTrackIds.includes(track.id);
              
              return (
                <div 
                  key={track.id}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    openMenu(e.clientX, e.clientY, { ...track, coverArt: getCoverArtUrl(track.coverArt || album.id, 300), albumId: album.id }, 'track'); 
                  }}
                  onClick={() => {
                     handlePlaySong(index);
                  }}
                  className={`flex items-center px-4 py-3 rounded-lg cursor-pointer group hover:bg-white/5 transition-colors ${currentPlaying ? 'bg-white/10' : ''}`}
                >
                  <div className="w-12 text-center text-sm font-medium text-secondary">
                    {currentPlaying ? (
                      isPlaying ? <Pause size={14} className="text-primary mx-auto" fill="currentColor" /> : <Play size={14} className="text-primary mx-auto" fill="currentColor" />
                    ) : (
                      <>
                        <span className="group-hover:hidden">{index + 1}</span>
                        <Play size={14} className="hidden group-hover:block mx-auto text-white" fill="currentColor" />
                      </>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col min-w-0 pr-4">
                    <span className={`text-sm font-semibold truncate ${currentPlaying ? 'text-primary' : 'text-white'}`}>{track.title}</span>
                    <span className="text-xs text-secondary truncate">{formatArtistName(track.artist || album.artist)}</span>
                  </div>
                  <div className="w-16 flex justify-center">
                    <Heart 
                      size={16} 
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${isTrackLiked ? 'opacity-100 text-primary' : 'text-white/50 hover:text-white'}`}
                      fill={isTrackLiked ? "currentColor" : "none"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackLike(track.id);
                        if (isTrackLiked) unstarItem(track.id);
                        else starItem(track.id);
                      }}
                    />
                  </div>
                  <div className="w-16 text-right text-sm text-secondary font-medium">
                    {formatTime(track.duration)}
                  </div>
                </div>
              );
            })}
            
            {album.song && visibleCount < album.song.length && (
              <div ref={observerTarget} className="h-20 w-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          {/* Metadata Sidebar */}
          {(() => {
            const firstSong = album.song?.[0];
            const displayGenre = album.genre || firstSong?.genre;
            
            return (
              <div className="w-full lg:w-80 flex flex-col gap-8">
                {displayGenre && (
                  <div>
                    <h3 className="text-xs font-bold tracking-widest text-secondary uppercase mb-3">Жанр</h3>
                    <div className="inline-block bg-white/5 border border-white/10 px-4 py-1.5 rounded-full text-sm font-semibold text-white">
                      {displayGenre}
                    </div>
                  </div>
                )}
                
                <div>
              <h3 className="text-xs font-bold tracking-widest text-secondary uppercase mb-3">Теги</h3>
              <div className="flex flex-wrap gap-2">
                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-md text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition-colors">Альбом</span>
                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-md text-xs font-semibold text-white/80 hover:text-white hover:bg-white/10 cursor-pointer transition-colors">official</span>
              </div>
            </div>
            
            <div>
              <h3 className="text-xs font-bold tracking-widest text-secondary uppercase mb-3">Лейбл звукозаписи</h3>
              <div className="inline-block bg-white/5 border border-white/10 px-4 py-1.5 rounded text-sm font-semibold text-white">
                Unknown Label
              </div>
            </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
