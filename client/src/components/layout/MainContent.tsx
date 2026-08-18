import { useEffect, useState, useMemo } from 'react';
import { fetchAlbums, getGenres, fetchFrequentAlbums, fetchRandomTracks } from '../../api/subsonic';
import AlbumCarousel from './AlbumCarousel';
import GenreCarousel from './GenreCarousel';
import TrackCarousel from './TrackCarousel';
import MobileMainContent from './MobileMainContent';
import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useUIStore } from '../../store/uiStore';
import { getDownloadedAlbums, getOfflineTracks } from '../../store/downloadStore';

export default function MainContent() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<any[]>([]);
  const [recentTracks, setRecentTracks] = useState<any[]>([]);
  const [frequentAlbums, setFrequentAlbums] = useState<any[]>([]);
  const [genres, setGenres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { isOffline } = useNetworkStatus();
  const { activeFilter } = useUIStore();

  const isOfflineMode = isOffline || activeFilter === 'Downloaded' || activeFilter === 'Offline';

  const displayAlbums = useMemo(() => {
    if (isOfflineMode) {
      return getDownloadedAlbums();
    }
    return albums;
  }, [albums, isOfflineMode]);

  const randomAlbums = useMemo(() => {
    return [...displayAlbums].sort(() => Math.random() - 0.5);
  }, [displayAlbums]);

  const displayGenres = useMemo(() => {
    if (isOfflineMode) {
      const offline = getOfflineTracks();
      return genres.filter(g => 
        offline.some(t => t.genre?.toLowerCase() === g.value.toLowerCase())
      );
    }
    return genres;
  }, [genres, isOfflineMode]);

  const offlineTracks = useMemo(() => {
    if (isOfflineMode) {
      return getOfflineTracks().sort(() => Math.random() - 0.5);
    }
    return [];
  }, [isOfflineMode]);

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
        <AlbumCarousel 
          title={isOfflineMode ? t('views.downloaded_albums') : t('common.discover_new')} 
          albums={isOfflineMode ? displayAlbums : randomAlbums} 
          variant="hero" 
        />
        <GenreCarousel title={t('views.radio_genres')} genres={displayGenres} />
        {isOfflineMode ? (
          <TrackCarousel title={t('views.downloaded_tracks')} tracks={offlineTracks} />
        ) : (
          <AlbumCarousel title={t('common.most_played')} albums={displayAlbums} variant="standard" />
        )}
      </div>
      <MobileMainContent albums={albums} recentTracks={recentTracks} frequentAlbums={frequentAlbums} genres={genres} />
    </>
  );
}
