import { useEffect, useState, useMemo } from 'react';
import { fetchAlbums, getGenres, fetchFrequentAlbums, fetchRandomTracks } from '../../api/subsonic';
import AlbumCarousel from './AlbumCarousel';
import GenreCarousel from './GenreCarousel';
import MobileMainContent from './MobileMainContent';
import { useTranslation } from 'react-i18next';

export default function MainContent() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<any[]>([]);
  const [recentTracks, setRecentTracks] = useState<any[]>([]);
  const [frequentAlbums, setFrequentAlbums] = useState<any[]>([]);
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
      const [albumData, recentData, frequentData, genreData] = await Promise.all([
        fetchAlbums(),
        fetchRandomTracks(15), // Mocking recent tracks with random tracks for now
        fetchFrequentAlbums(),
        getGenres()
      ]);
      setAlbums(albumData || []);
      setRecentTracks(recentData || []);
      setFrequentAlbums(frequentData || []);
      setGenres((genreData || []).slice(0, 15)); // top 15 genres for main page
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('common.loading_music')}</div>;
  }

  return (
    <>
      <div className="hidden md:flex flex-1 flex-col bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10">
        <AlbumCarousel title={t('common.discover_new')} albums={randomAlbums} variant="hero" />
        <GenreCarousel title={t('views.radio_genres')} genres={genres} />
        <AlbumCarousel title={t('common.most_played')} albums={albums} variant="standard" />
      </div>
      <MobileMainContent albums={albums} recentTracks={recentTracks} frequentAlbums={frequentAlbums} genres={genres} />
    </>
  );
}
