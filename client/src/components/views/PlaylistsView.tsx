import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ListMusic, Play } from 'lucide-react';
import { getPlaylists } from '../../api/subsonic/playlists';
import { getCoverArtUrl } from '../../api/subsonic';

export default function PlaylistsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllPlaylists = async () => {
      try {
        const data = await getPlaylists();
        setPlaylists(data || []);
      } catch (err) {
        console.error('Failed to fetch playlists:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAllPlaylists();
  }, []);

  const handlePlaylistClick = (id: string) => {
    const isJam = window.location.pathname.startsWith('/jam');
    const searchParams = new URLSearchParams(window.location.search);
    const room = searchParams.get('room');
    if (isJam && room) {
      navigate(`/jam/library/playlist/${id}?room=${room}`);
    } else {
      navigate(`/Holad/playlist/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-secondary">
        {t('views.loading_playlists', 'Loading playlists...')}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent md:bg-card hide-scrollbar md:custom-scrollbar relative pb-24 px-4 pt-4 md:p-6">
      <div className="hidden md:flex sticky top-0 z-20 bg-card/90 backdrop-blur p-6 pb-4 border-b border-white/5 items-center justify-between -mx-6 -mt-6 mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('views.my_playlists', 'My Playlists')}</h1>
      </div>

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-[#b3b3b3]">
          <p className="text-lg font-bold mb-2">{t('views.no_playlists')}</p>
          <p className="text-sm">{t('views.no_playlists_desc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
          {playlists.map(playlist => (
            <div
              key={playlist.id}
              onClick={() => handlePlaylistClick(playlist.id)}
              className="group relative bg-card hover:bg-accent rounded-xl cursor-pointer flex flex-col p-4 flex-shrink-0 transition-colors duration-300 shadow-sm hover:shadow-lg h-full"
            >
              <div className="relative aspect-square overflow-hidden rounded-t-lg bg-black/20 flex items-center justify-center">
                {playlist.coverArt ? (
                  <img
                    src={getCoverArtUrl(playlist.coverArt, 300)}
                    alt={playlist.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <ListMusic size={64} className="text-white/20" />
                )}
                
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center bg-black/40">
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
