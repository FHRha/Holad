import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getArtistInfo, getCoverArtUrl } from '../../api/subsonic';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import type { Track } from '../../types';

interface MobileInfoTabProps {
  currentTrack: Track;
}

export default function MobileInfoTab({ currentTrack }: MobileInfoTabProps) {
  const { t } = useTranslation();
  const [artistBio, setArtistBio] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    
    async function fetchInfo() {
      if (!currentTrack?.artistId) return;
      setLoading(true);
      try {
        const info = await getArtistInfo(currentTrack.artistId);
        if (mounted && info?.biography) {
          // Strip basic HTML if necessary, or dangerouslySetInnerHTML
          setArtistBio(info.biography);
        }
      } catch (err) {
        console.error("Failed to fetch artist info", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchInfo();
    
    return () => {
      mounted = false;
      setArtistBio(null);
    };
  }, [currentTrack?.artistId]);

  if (!currentTrack) return null;

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto hide-scrollbar px-6 pt-4 pb-24">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-24 h-24 rounded-lg overflow-hidden shadow-lg flex-shrink-0 bg-black/20">
          <TrackImage src={getCoverArtUrl(currentTrack.id, 300)} className="w-full h-full object-cover" alt={currentTrack.title} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white mb-1 truncate">{currentTrack.title}</h2>
          <p className="text-base text-primary font-medium truncate">{formatArtistName(currentTrack.artist)}</p>
          <p className="text-sm text-white/60 truncate">{currentTrack.album}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-center items-center">
          <span className="text-xs text-white/40 uppercase font-bold tracking-wider mb-1">{t('player.duration', { defaultValue: 'Duration' })}</span>
          <span className="text-sm font-medium text-white">{formatTime(currentTrack.duration)}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-center items-center">
          <span className="text-xs text-white/40 uppercase font-bold tracking-wider mb-1">{t('player.year', { defaultValue: 'Year' })}</span>
          <span className="text-sm font-medium text-white">{currentTrack.year || '-'}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-center items-center">
          <span className="text-xs text-white/40 uppercase font-bold tracking-wider mb-1">{t('player.format', { defaultValue: 'Format' })}</span>
          <span className="text-sm font-medium text-white">{currentTrack.suffix?.toUpperCase() || 'MP3'}</span>
        </div>
        <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-center items-center">
          <span className="text-xs text-white/40 uppercase font-bold tracking-wider mb-1">{t('player.bitrate', { defaultValue: 'Bitrate' })}</span>
          <span className="text-sm font-medium text-white">{currentTrack.bitRate ? `${currentTrack.bitRate} kbps` : '-'}</span>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-bold text-white mb-3">{t('player.about_artist', { defaultValue: 'About Artist' })}</h3>
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-white/10 rounded w-full"></div>
            <div className="h-4 bg-white/10 rounded w-5/6"></div>
            <div className="h-4 bg-white/10 rounded w-4/6"></div>
          </div>
        ) : artistBio ? (
          <div 
            className="text-sm text-white/70 leading-relaxed text-justify"
            dangerouslySetInnerHTML={{ __html: artistBio }}
          />
        ) : (
          <p className="text-sm text-white/40">{t('player.no_biography', { defaultValue: 'No biography available.' })}</p>
        )}
      </div>
    </div>
  );
}
