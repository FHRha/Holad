import { useEffect, useState } from 'react';
import { fetchStarred, getCoverArtUrl } from '../../api/subsonic';
import { Play, Heart } from 'lucide-react';
import { formatArtistName } from '../../utils/formatters';
import AlbumCard from '../common/AlbumCard';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';

export default function FavoritesView() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { setQueueAndPlay, likedTrackIds, toggleTrackLike } = usePlayerStore();

  useEffect(() => {
    loadStarred();
  }, [likedTrackIds.length]); // Refresh if global liked state changes, though slightly inefficient, it keeps sync

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

  const handlePlayTrack = (index: number) => {
    const mappedTracks: Track[] = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverArt: t.coverArt,
      duration: t.duration
    }));
    setQueueAndPlay(mappedTracks, index);
  };

  if (loading) {
    return (
      <div className="flex-1 bg-background p-8 flex items-center justify-center">
        <div className="animate-pulse text-primary font-bold text-xl">Загрузка любимого...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar">
      <div className="flex items-center gap-6 text-xl font-bold mb-10 text-foreground border-b border-white/5 pb-4">
        <h1 className="text-2xl text-white">Избранное</h1>
      </div>

      {albums.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-bold text-white mb-6">Любимые Альбомы</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xl font-bold text-white mb-6">Любимые Треки</h2>
          <div className="flex flex-col gap-1">
            {tracks.map((track, index) => {
              const isLiked = likedTrackIds.includes(track.id);
              return (
                <div 
                  key={track.id} 
                  className="flex items-center gap-4 p-2 rounded-md hover:bg-white/5 group transition-colors cursor-pointer"
                  onDoubleClick={() => handlePlayTrack(index)}
                >
                  <div className="w-8 flex justify-center text-secondary relative">
                    <span className="group-hover:hidden">{index + 1}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handlePlayTrack(index); }}
                      className="hidden group-hover:flex text-primary"
                    >
                      <Play fill="currentColor" size={14} />
                    </button>
                  </div>
                  
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-white/10 relative">
                    {track.coverArt && <img src={getCoverArtUrl(track.coverArt, 100)} className="w-full h-full object-cover" alt="" loading="lazy" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors">
                      {track.title}
                    </p>
                    <p className="text-xs text-secondary truncate">
                      {formatArtistName(track.artist)} • {track.album}
                    </p>
                  </div>
                  
                  <button 
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleToggleLike(e, track.id)}
                  >
                    <Heart size={16} fill={isLiked ? "currentColor" : "none"} className={isLiked ? "text-primary" : "text-white/30"} />
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
          <p>Вы ещё ничего не добавили в избранное.</p>
        </div>
      )}
    </div>
  );
}
