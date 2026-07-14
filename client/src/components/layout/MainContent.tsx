import { useEffect, useState, useMemo } from 'react';
import { fetchAlbums, getGenres } from '../../api/subsonic';
import AlbumCarousel from './AlbumCarousel';
import GenreCarousel from './GenreCarousel';

export default function MainContent() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const randomAlbums = useMemo(() => {
    return [...albums].sort(() => Math.random() - 0.5);
  }, [albums]);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const [albumData, genreData] = await Promise.all([
        fetchAlbums(),
        getGenres()
      ]);
      setAlbums(albumData || []);
      setGenres((genreData || []).slice(0, 15)); // top 15 genres for main page
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">Загрузка музыки...</div>;
  }

  return (
    <div className="flex-1 bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10">
      <AlbumCarousel title="Откройте новое" albums={randomAlbums} variant="hero" />
      <GenreCarousel title="Радио по жанрам" genres={genres} />
      <AlbumCarousel title="Слушают чаще всего" albums={albums} variant="standard" />
    </div>
  );
}
