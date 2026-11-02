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
import { isMobileDevice } from '../../App';

interface MainContentCache {
  albums: any[];
  recentTracks: any[];
  frequentAlbums: any[];
  genres: any[];
}

let cachedMainContent: MainContentCache | null = null;

export default function MainContent() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<any[]>(() => cachedMainContent?.albums || []);
  const [recentTracks, setRecentTracks] = useState<any[]>(() => cachedMainContent?.recentTracks || []);
  const [frequentAlbums, setFrequentAlbums] = useState<any[]>(() => cachedMainContent?.frequentAlbums || []);
  const [genres, setGenres] = useState<any[]>(() => cachedMainContent?.genres || []);
  const [loading, setLoading] = useState(() => !cachedMainContent);
  const [isMobile, setIsMobile] = useState(isMobileDevice);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (displayAlbums.length === 0) return [];
    // Stable pseudo-random shuffle based on album ID to eliminate mid-transition layout reordering
    return [...displayAlbums].sort((a, b) => {
      const idA = String(a.id || a.title || '');
      const idB = String(b.id || b.title || '');
      let hA = 0;
      for (let i = 0; i < idA.length; i++) hA = ((hA << 5) - hA + idA.charCodeAt(i)) | 0;
      let hB = 0;
      for (let i = 0; i < idB.length; i++) hB = ((hB << 5) - hB + idB.charCodeAt(i)) | 0;
      return hA - hB;
    });
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
      if (!cachedMainContent) {
        setLoading(true);
      }
      const [albumData, recentData, frequentData, genreData] = await Promise.all([
        fetchAlbums(),
        fetchRandomTracks(15), // Mocking recent tracks with random tracks for now
        fetchFrequentAlbums(),
        getGenres()
      ]);
      const newAlbums = albumData || [];
      const newRecent = recentData || [];
      const newFrequent = frequentData || [];
      const newGenres = (genreData || []).slice(0, 15); // top 15 genres for main page

      setAlbums(newAlbums);
      setRecentTracks(newRecent);
      setFrequentAlbums(newFrequent);
      setGenres(newGenres);

      cachedMainContent = {
        albums: newAlbums,
        recentTracks: newRecent,
        frequentAlbums: newFrequent,
        genres: newGenres,
      };
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('common.loading_music')}</div>;
  }

  if (isMobile) {
    return <MobileMainContent albums={albums} recentTracks={recentTracks} frequentAlbums={frequentAlbums} genres={genres} />;
  }

  return (
    <div className="flex flex-1 flex-col bg-background overflow-y-auto p-4 lg:p-8 hide-scrollbar pt-10">
      {(displayAlbums.length === 0 && offlineTracks.length === 0) ? (
        <div className="animate-home-section flex flex-col items-center justify-center flex-1 h-full min-h-[50vh] text-center opacity-70">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{t('empty_state.title', 'Здесь пока пусто')}</h2>
          <p className="text-sm text-secondary">{t('empty_state.description', 'Добавьте музыку на сервер или загрузите для оффлайна')}</p>
        </div>
      ) : (
        <>
          <div className="animate-home-section" style={{ animationDelay: '0ms' }}>
            <AlbumCarousel 
              title={isOfflineMode ? t('views.downloaded_albums') : t('common.discover_new')} 
              albums={isOfflineMode ? displayAlbums : randomAlbums} 
              variant="hero" 
              baseDelay={0}
            />
          </div>
          <div className="animate-home-section" style={{ animationDelay: '70ms' }}>
            <GenreCarousel title={t('views.radio_genres')} genres={displayGenres} baseDelay={60} />
          </div>
          <div className="animate-home-section" style={{ animationDelay: '140ms' }}>
            {isOfflineMode ? (
              <TrackCarousel title={t('views.downloaded_tracks')} tracks={offlineTracks} baseDelay={120} />
            ) : (
              <AlbumCarousel title={t('common.most_played')} albums={displayAlbums} variant="standard" baseDelay={120} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
