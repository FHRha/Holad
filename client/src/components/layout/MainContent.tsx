import { useEffect, useState, useMemo, useRef } from 'react';
import { fetchAlbums, getGenres, fetchFrequentAlbums, fetchRandomTracks } from '../../api/subsonic';
import AlbumCarousel from './AlbumCarousel';
import GenreCarousel from './GenreCarousel';
import TrackCarousel from './TrackCarousel';
import MobileMainContent from './MobileMainContent';
import { HomeSectionSkeleton, Skeleton } from '../common/Skeleton';
import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useUIStore } from '../../store/uiStore';
import { getDownloadedAlbums, getOfflineTracks } from '../../store/downloadStore';
import { isMobileDevice } from '../../App';

interface MainContentCache {
  albums: any[];
  randomAlbums: any[];
  recentTracks: any[];
  frequentAlbums: any[];
  genres: any[];
}

let cachedMainContent: MainContentCache | null = null;

function shuffleList<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function MainContent() {
  const { t } = useTranslation();
  const [albums, setAlbums] = useState<any[]>(() => cachedMainContent?.albums || []);
  const [randomAlbums, setRandomAlbums] = useState<any[]>(() => cachedMainContent?.randomAlbums || []);
  const [recentTracks, setRecentTracks] = useState<any[]>(() => cachedMainContent?.recentTracks || []);
  const [frequentAlbums, setFrequentAlbums] = useState<any[]>(() => cachedMainContent?.frequentAlbums || []);
  const [genres, setGenres] = useState<any[]>(() => cachedMainContent?.genres || []);
  const [albumsSettled, setAlbumsSettled] = useState(() => Boolean(cachedMainContent));
  const [recentSettled, setRecentSettled] = useState(() => Boolean(cachedMainContent));
  const [genresSettled, setGenresSettled] = useState(() => Boolean(cachedMainContent));
  const [isMobile, setIsMobile] = useState(isMobileDevice);
  const mountedRef = useRef(true);

  useEffect(() => {
    const handleResize = () => setIsMobile(isMobileDevice());
    handleResize();

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    let mql: MediaQueryList | null = null;
    if (typeof window.matchMedia === 'function') {
      try {
        mql = window.matchMedia('(max-width: 768px)');
        if (mql.addEventListener) {
          mql.addEventListener('change', handleResize);
        } else if ((mql as any).addListener) {
          (mql as any).addListener(handleResize);
        }
      } catch {}
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (mql) {
        if (mql.removeEventListener) {
          mql.removeEventListener('change', handleResize);
        } else if ((mql as any).removeListener) {
          (mql as any).removeListener(handleResize);
        }
      }
    };
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

  const loadContent = () => {
    const updateCache = (patch: Partial<MainContentCache>) => {
      cachedMainContent = {
        albums: patch.albums ?? cachedMainContent?.albums ?? [],
        randomAlbums: patch.randomAlbums ?? cachedMainContent?.randomAlbums ?? [],
        recentTracks: patch.recentTracks ?? cachedMainContent?.recentTracks ?? [],
        frequentAlbums: patch.frequentAlbums ?? cachedMainContent?.frequentAlbums ?? [],
        genres: patch.genres ?? cachedMainContent?.genres ?? [],
      };
    };

    // Load each section independently so slow endpoints (like frequent size=500) never block the whole Home view
    fetchAlbums()
      .then((albumData) => {
        if (!mountedRef.current) return;
        const newAlbums = albumData || [];
        const newRandom = cachedMainContent?.randomAlbums?.length ? cachedMainContent.randomAlbums : shuffleList(newAlbums);
        setAlbums(newAlbums);
        setRandomAlbums(newRandom);
        updateCache({ albums: newAlbums, randomAlbums: newRandom });
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (mountedRef.current) setAlbumsSettled(true);
      });

    fetchRandomTracks(15)
      .then((recentData) => {
        if (!mountedRef.current) return;
        const newRecent = recentData || [];
        setRecentTracks(newRecent);
        updateCache({ recentTracks: newRecent });
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (mountedRef.current) setRecentSettled(true);
      });

    fetchFrequentAlbums()
      .then((frequentData) => {
        if (!mountedRef.current) return;
        const newFrequent = frequentData || [];
        setFrequentAlbums(newFrequent);
        updateCache({ frequentAlbums: newFrequent });
      })
      .catch((e) => console.error(e));

    getGenres()
      .then((genreData) => {
        if (!mountedRef.current) return;
        const newGenres = (genreData || []).slice(0, 15);
        setGenres(newGenres);
        updateCache({ genres: newGenres });
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (mountedRef.current) setGenresSettled(true);
      });
  };

  useEffect(() => {
    mountedRef.current = true;
    loadContent();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // On mobile UA, Android WebView, or screen <= 768px, always render MobileMainContent
  const effectiveIsMobile = isMobile || isMobileDevice();

  const hasInitialContent = isOfflineMode
    ? true
    : effectiveIsMobile
      ? (albums.length > 0 || recentTracks.length > 0 || (albumsSettled && recentSettled))
      : (displayAlbums.length > 0 || albumsSettled);

  if (!hasInitialContent) {
    return <HomeSectionSkeleton isMobile={effectiveIsMobile} />;
  }

  if (effectiveIsMobile) {
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
              albums={isOfflineMode ? displayAlbums : (randomAlbums.length > 0 ? randomAlbums : displayAlbums)} 
              variant="hero" 
              baseDelay={0}
            />
          </div>
          <div className="animate-home-section" style={{ animationDelay: '70ms' }}>
            {!genresSettled && displayGenres.length === 0 ? (
              <div className="mb-8 flex flex-col gap-3">
                <Skeleton className="h-6 w-40" />
                <div className="flex gap-3 overflow-hidden">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-36 rounded-xl shrink-0" />
                  ))}
                </div>
              </div>
            ) : (
              <GenreCarousel title={t('views.radio_genres')} genres={displayGenres} baseDelay={60} />
            )}
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
