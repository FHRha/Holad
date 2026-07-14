import { useEffect, useState, useMemo } from 'react';
import { Play } from 'lucide-react';
import { fetchAlbums, fetchRandomTracks, getCoverArtUrl } from '../../api/subsonic';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import AlbumCarousel from './AlbumCarousel';

export default function MainContent() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const setQueue = usePlayerStore(state => state.setQueue);

  const randomAlbums = useMemo(() => {
    return [...albums].sort(() => Math.random() - 0.5);
  }, [albums]);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const data = await fetchAlbums();
      setAlbums(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRandomPlay = async () => {
    const tracks = await fetchRandomTracks(20);
    const mappedTracks: Track[] = tracks.map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      coverArt: getCoverArtUrl(t.coverArt || t.id),
      duration: t.duration
    }));
    setQueue(mappedTracks);
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">Загрузка музыки...</div>;
  }

  return (
    <div className="flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar">
      {/* Header section */}
      <div className="flex items-center gap-6 text-xl font-bold mb-10 text-foreground border-b border-white/5 pb-4">
        <h1 className="text-2xl cursor-pointer hover:text-white transition-colors">Главная</h1>
        <button 
          onClick={handleRandomPlay}
          className="bg-primary text-background px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform drop-shadow-lg"
        >
          <Play fill="currentColor" size={14} />
          Случайное Радио
        </button>
      </div>

      <AlbumCarousel title="Откройте новое" albums={randomAlbums} variant="hero" />
      <AlbumCarousel title="Слушают чаще всего" albums={albums} variant="standard" />
    </div>
  );
}
