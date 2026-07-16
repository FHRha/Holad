import { useParams, useNavigate } from 'react-router-dom';
import ArtistAvatar from '../common/ArtistAvatar';
import AlbumCard from '../common/AlbumCard';
import TrackImage from '../common/TrackImage';
import { Play, Shuffle, ArrowLeft } from 'lucide-react';
import { formatTime } from '../../utils/timeFormat';
import { useTranslation } from 'react-i18next';
import { useArtistData } from '../../hooks/useArtistData';
import { useContextMenuStore } from '../../store/contextMenuStore';

export default function ArtistView() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { openMenu } = useContextMenuStore();
  
  const {
    artist,
    artistInfo,
    topSongs,
    loading,
    handlePlayArtist,
    handleShuffleArtist,
    handlePlaySong
  } = useArtistData(id);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.loading_artist')}</div>;
  }

  if (!artist) {
    return <div className="flex-1 flex items-center justify-center text-secondary">{t('views.artist_not_found')}</div>;
  }

  const albums = artist.album || [];

  return (
    <div className="flex-1 overflow-y-auto bg-transparent md:bg-card custom-scrollbar relative pb-24">
      
      {/* Header section */}
      <div className="relative w-full h-80 sm:h-96">
        <div className="absolute inset-0 z-0">
          <div className="w-full h-full overflow-hidden blur-3xl opacity-30">
            <ArtistAvatar artistName={artist.name} artistId={artist.id} fallbackSize={120} className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent" />
        </div>
        
        <div className="relative z-10 p-6 sm:p-10 h-full flex flex-col justify-end">
          <button 
            onClick={() => navigate(-1)}
            className="absolute top-6 left-6 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-8 text-center sm:text-left mt-auto">
            <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-full shadow-2xl overflow-hidden flex-shrink-0 bg-white/5 mx-auto sm:mx-0">
               <ArtistAvatar artistName={artist.name} artistId={artist.id} fallbackSize={60} className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="hidden sm:block text-xs sm:text-sm font-bold uppercase tracking-widest text-white/80 mb-1 sm:mb-2 drop-shadow-md">
                {t('views.artist')}
              </span>
              <h1 className="text-3xl sm:text-6xl md:text-8xl font-black text-white drop-shadow-lg truncate pb-1">
                {artist.name}
              </h1>
              <p className="text-sm sm:text-base text-white/60 font-medium mt-2">
                {t('views.albums_count')} {artist.albumCount || albums.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 sm:p-6 sm:px-10 flex items-center justify-center sm:justify-start gap-4">
        <button 
          onClick={handlePlayArtist}
          className="w-14 h-14 bg-primary text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
        >
          <Play size={24} fill="currentColor" className="ml-1" />
        </button>
        <button 
          onClick={handleShuffleArtist}
          className="text-secondary hover:text-white p-3 transition-colors"
        >
          <Shuffle size={24} />
        </button>
      </div>

      <div className="px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        {/* Top Songs */}
        <div className="lg:col-span-2">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-6">{t('views.popular_tracks')}</h2>
          {topSongs.length === 0 ? (
            <p className="text-secondary text-sm">{t('views.no_track_data')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {topSongs.slice(0, 10).map((track, index) => (
                <div 
                  key={track.id}
                  onClick={() => handlePlaySong(index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, track, 'track');
                  }}
                  className="group flex items-center gap-4 p-2 sm:p-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="w-6 text-center text-sm font-medium text-secondary/70 group-hover:text-white">
                    {index + 1}
                  </div>
                  
                  {/* Track Cover */}
                  <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-white/5">
                    <TrackImage 
                      src={track.coverArt} 
                      className="w-full h-full object-cover" 
                      alt="" 
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play size={16} fill="currentColor" className="text-white" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm sm:text-base text-foreground truncate">{track.title}</p>
                  </div>
                  
                  <div className="text-xs sm:text-sm text-secondary/70 font-medium">
                    {formatTime(track.duration)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Biography & Extra Info */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {artistInfo && artistInfo.biography && (
            <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
              <h3 className="text-sm font-bold uppercase tracking-widest text-secondary mb-4">{t('views.about_artist')}</h3>
              <div 
                className="text-sm text-foreground/80 leading-relaxed line-clamp-12"
                dangerouslySetInnerHTML={{ __html: artistInfo.biography }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Albums Grid */}
      <div className="p-6 sm:p-10 mt-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-6">{t('views.albums')}</h2>
        {albums.length === 0 ? (
          <p className="text-secondary text-sm">{t('views.no_albums')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {albums.map((album: any) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
