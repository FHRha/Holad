import { useEffect, useState, useRef } from 'react';
import { fetchAlbums, getCoverArtUrl } from '../../api/subsonic';
import { useTranslation } from 'react-i18next';
import AlbumCard from '../common/AlbumCard';
import TrackImage from '../common/TrackImage';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useDownloadStore, isItemDownloaded, getDownloadedAlbums } from '../../store/downloadStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import LongPressWrapper from '../common/LongPressWrapper';
import { VirtuosoGrid } from 'react-virtuoso';

export default function AlbumsView({ viewMode = 'grid' }: { viewMode?: 'grid' | 'list' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeFilter = useUIStore(s => s.activeFilter);
  const { isOffline } = useNetworkStatus();
  const downloads = useDownloadStore(state => state.downloads);
  const { openMenu } = useContextMenuStore();
  const [albums, setAlbums] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const virtuosoRef = useRef<any>(null);

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      try {
        const data = await fetchAlbums(0, 50);
        const sorted = [...(data || [])].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
        setAlbums(sorted);
        if (data.length < 50) setHasMore(false);
      } catch (err) {
        console.error('Failed to fetch albums, falling back to downloaded albums:', err);
        const downloaded = getDownloadedAlbums().map(d => ({
          id: d.id,
          name: d.name,
          title: d.name,
          artist: d.artist || 'Unknown Artist',
          coverArt: d.localCoverArtUri || d.coverArt || d.id,
          songCount: d.totalTrackCount || d.completedTrackCount || 0
        }));
        setAlbums(downloaded);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };
    loadInitial();
  }, []);

  const loadMoreAlbums = async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const data = await fetchAlbums(albums.length, 50);
      if (data.length < 50) setHasMore(false);
      setAlbums(prev => {
        const combined = [...prev, ...data];
        const unique = Array.from(new Map(combined.map(a => [a.id, a])).values());
        return unique.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''));
      });
    } catch (err) {
      console.error('Failed to load more albums:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.loading_albums')}</div>;
  }

  const finalAlbums = (() => {
    let result = albums;
    if (activeFilter === 'Favorites') {
      result = albums.filter(a => a.userRating && a.userRating >= 4);
    } else if (activeFilter === 'Downloaded' || activeFilter === 'Offline' || isOffline) {
      result = albums.filter(a => isItemDownloaded(downloads, a.id, a.id));
    }
    return result;
  })();

  // Generate unique first letters for the scrollbar
  const letters = Array.from(new Set(finalAlbums.map(a => {
    const title = a.name || a.title || '';
    const firstChar = title.charAt(0).toUpperCase();
    return /[A-ZА-Я]/.test(firstChar) ? firstChar : '#';
  }))).sort();


  const scrollToLetter = (letter: string) => {
    const index = finalAlbums.findIndex(a => {
      const firstChar = (a.name || a.title || '').charAt(0).toUpperCase();
      const l = /[A-ZА-Я]/.test(firstChar) ? firstChar : '#';
      return l === letter;
    });
    if (index !== -1 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index, behavior: 'smooth', align: 'start' });
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-transparent relative">
      <div className="px-4 pt-4 md:px-8 shrink-0">
        <h1 className="text-2xl font-bold mb-8 text-foreground hidden md:block">{t('views.albums')}</h1>
      </div>
      
      <div className="flex-1 overflow-hidden px-4 md:px-8 md:pb-8">
        <VirtuosoGrid
          ref={virtuosoRef}
          data={finalAlbums}
          endReached={loadMoreAlbums}
          className="h-full custom-scrollbar"
          listClassName={
            viewMode === 'grid' 
              ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 pr-6 md:pr-0 pb-[80px] md:pb-0"
              : "flex flex-col gap-4 pr-6 md:pr-0 pb-[80px] md:pb-0"
          }
          itemContent={(index: number, album: any) => {
            const firstChar = (album.name || album.title || '').charAt(0).toUpperCase();
          const letter = /[A-ZА-Я]/.test(firstChar) ? firstChar : '#';
          const prevFirstChar = index > 0 ? (finalAlbums[index-1].name || finalAlbums[index-1].title || '').charAt(0).toUpperCase() : '';
          const prevLetter = /[A-ZА-Я]/.test(prevFirstChar) ? prevFirstChar : '#';
          const isFirstOfLetter = index === 0 || letter !== prevLetter;

          if (viewMode === 'list') {
            return (
              <LongPressWrapper 
                key={album.id} 
                id={isFirstOfLetter ? `letter-${letter}` : undefined} 
                className="flex items-center gap-4 cursor-pointer scroll-mt-24 w-full"
                onClick={() => navigate(`/Holad/album/${album.id}`)}
                onLongPress={(e: any) => {
                  e.preventDefault?.();
                  openMenu(e.clientX, e.clientY, album, 'album');
                }}
              >
                <div className="relative w-16 h-16 flex-shrink-0">
                  <TrackImage src={getCoverArtUrl(album.coverArt || album.id, 300)} className="w-full h-full rounded-md object-cover" trackId={album.id} />
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <span className="text-[15px] text-white font-bold truncate">{album.name || album.title}</span>
                  <span className="text-[#b3b3b3] text-[13px] truncate">{album.artist}</span>
                </div>
              </LongPressWrapper>
            );
          }

          return (
            <div key={album.id} id={isFirstOfLetter ? `letter-${letter}` : undefined} className="scroll-mt-24 w-full">
              <AlbumCard album={album} />
            </div>
          );
        }}
      />
      </div>

      {/* Mobile Alphabetical Scrollbar */}
      <div className="md:hidden fixed right-0 top-[220px] bottom-[180px] w-6 flex flex-col items-center justify-between z-20 pointer-events-none">
        <div className="flex flex-col items-center gap-1 my-auto pointer-events-auto h-full overflow-y-auto hide-scrollbar py-2">
          {letters.map((letter, idx) => (
            <button 
              key={idx} 
              onClick={() => scrollToLetter(letter)}
              className="text-[10px] font-bold text-primary hover:scale-125 transition-transform py-0.5"
            >
              {letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

