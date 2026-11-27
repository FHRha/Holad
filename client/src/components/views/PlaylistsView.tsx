import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play } from 'lucide-react';
import { getPlaylists } from '../../api/subsonic/playlists';
import { usePlaylistStore } from '../../store/playlistStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useContextMenuStore } from '../../store/contextMenuStore';
import PlaylistCover from '../common/PlaylistCover';
import EmptyState from '../common/EmptyState';
import { CardGridSkeleton, Skeleton } from '../common/Skeleton';
import { isJamPath } from '../../utils/basePath';
import {
  getLibraryCacheEpoch,
  subscribeLibraryInvalidation,
} from '../../utils/libraryCache';

interface PlaylistsViewCache {
  epoch: number;
  playlists: any[];
}

let cachedPlaylistsData: PlaylistsViewCache | null = null;

function getValidPlaylistsCache(): PlaylistsViewCache | null {
  if (cachedPlaylistsData && cachedPlaylistsData.epoch === getLibraryCacheEpoch()) {
    return cachedPlaylistsData;
  }
  cachedPlaylistsData = null;
  return null;
}

export default function PlaylistsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isInsideLibrary = useLocation().pathname.startsWith('/library');
  const { openMenu } = useContextMenuStore();
  const initialCache = getValidPlaylistsCache();
  const [playlists, setPlaylists] = useState<any[]>(() => initialCache?.playlists || []);
  const [loading, setLoading] = useState(() => !initialCache);
  const customPlaylists = usePlaylistStore(state => state.playlists);
  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    let isMounted = true;
    const fetchAllPlaylists = async (isBackground = false) => {
      if (!isBackground && !getValidPlaylistsCache() && isMounted) {
        setLoading(true);
      }
      const currentEpoch = getLibraryCacheEpoch();
      try {
        let serverPlaylists: any[] = [];
        if (!isOffline) {
          try {
            serverPlaylists = await getPlaylists();
          } catch (e) {
            console.error('Failed to fetch server playlists:', e);
          }
        }
        if (!isMounted) return;
        
        // Map custom playlists to match subsonic playlist structure
        const curCustomPlaylists = usePlaylistStore.getState().playlists;
        const mappedCustomPlaylists = curCustomPlaylists.map(cp => {
          const trackIds = Array.isArray(cp.trackIds) ? cp.trackIds : [];
          return {
            id: cp.id,
            name: cp.name,
            comment: cp.description,
            songCount: trackIds.length,
            duration: 0,
            coverArt: trackIds.length > 0 ? trackIds[0] : null, 
            trackIds: trackIds,
            isCustom: true
          };
        });

        if (isMounted) {
          const combined = [...mappedCustomPlaylists, ...(serverPlaylists || [])];
          cachedPlaylistsData = { epoch: currentEpoch, playlists: combined };
          setPlaylists(combined);
        }
      } catch (err) {
        console.error('Failed to process playlists:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    const handleEventRefresh = () => {
      void fetchAllPlaylists(true);
    };
    void fetchAllPlaylists(false);
    window.addEventListener('playlists-updated', handleEventRefresh);
    const unsubscribeLibrary = subscribeLibraryInvalidation(handleEventRefresh);
    return () => {
      isMounted = false;
      window.removeEventListener('playlists-updated', handleEventRefresh);
      unsubscribeLibrary();
    };
  }, [isOffline, customPlaylists]);

  const handlePlaylistClick = (id: string) => {
    const isJam = isJamPath();
    const searchParams = new URLSearchParams(window.location.search);
    const room = searchParams.get('room');
    if (isJam && room) {
      navigate(`/jam/library/playlist/${id}?room=${room}`);
    } else {
      navigate(`/playlist/${id}`);
    }
  };

  const mobileTopPadding = isInsideLibrary ? 'pt-4' : 'pt-[calc(1rem+var(--safe-area-inset-top))]';

  if (loading) {
    return (
      <div className={`flex-1 overflow-y-auto bg-transparent md:bg-card hide-scrollbar md:custom-scrollbar relative pb-[calc(6rem+var(--safe-area-inset-bottom))] md:pb-8 px-4 ${mobileTopPadding} md:p-6`}>
        <div className="hidden md:flex sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 items-center justify-between -mx-6 -mt-6 mb-6">
          <Skeleton className="h-8 w-44" />
        </div>
        <CardGridSkeleton count={10} />
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-y-auto bg-transparent md:bg-card hide-scrollbar md:custom-scrollbar relative pb-[calc(6rem+var(--safe-area-inset-bottom))] md:pb-8 px-4 ${mobileTopPadding} md:p-6`}>
      <div className="hidden md:flex sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 items-center justify-between -mx-6 -mt-6 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('views.my_playlists', 'My Playlists')}</h1>
      </div>

      {playlists.length === 0 ? (
        <EmptyState
          className="h-64"
          title={t('views.no_playlists')}
          description={t('views.no_playlists_desc')}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {playlists.map(playlist => (
            <div
              key={playlist.id}
              onClick={() => handlePlaylistClick(playlist.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, playlist, 'playlist');
              }}
              className="group relative bg-card hover:bg-accent rounded-xl cursor-pointer flex flex-col p-4 flex-shrink-0 transition-colors duration-300 shadow-sm hover:shadow-lg h-full"
            >
              <div className="relative aspect-square overflow-hidden rounded-t-lg bg-black/20 flex items-center justify-center">
                <PlaylistCover
                  coverArt={playlist.coverArt}
                  trackIds={playlist.trackIds}
                  alt={playlist.name}
                  size={300}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center bg-black/40 pointer-events-none">
                  <div className="w-12 h-12 rounded-full bg-primary text-black flex items-center justify-center hover:scale-105 transition-transform shadow-xl">
                    <Play fill="currentColor" size={24} className="ml-1" />
                  </div>
                </div>
              </div>
              <div className="p-3 mt-auto">
                <h3 className="font-semibold text-sm text-foreground truncate leading-normal">{playlist.name}</h3>
                <p className="text-xs text-secondary truncate mt-1">
                  {playlist.songCount || 0} {t('views.tracks', 'tracks')}
                </p>
                <p className="text-[10px] text-foreground/40 mt-1">
                  {playlist.duration ? Math.floor(playlist.duration / 60) + ' ' + t('views.mins_abbr', 'min') : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
