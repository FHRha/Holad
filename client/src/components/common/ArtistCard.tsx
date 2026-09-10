import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import ArtistAvatar from './ArtistAvatar';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../store/uiStore';
import { isJamPath } from '../../utils/basePath';

interface ArtistCardProps {
  artist: {
    id: string;
    name: string;
    albumCount?: number;
  };
  onClick?: () => void;
}

const ArtistCard = memo(function ArtistCard({ artist, onClick }: ArtistCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSearchOpen } = useUIStore();

  const slug = `${encodeURIComponent(artist.name)}-${artist.id}`;

  return (
    <div 
      onClick={() => {
        if (onClick) {
          onClick();
        } else {
          setSearchOpen(false);
          const isJam = isJamPath();
          const searchParams = new URLSearchParams(window.location.search);
          const room = searchParams.get('room');
          if (isJam && room) {
            navigate(`/jam/artist/${slug}?room=${room}`);
          } else {
            navigate(`/artist/${slug}`);
          }
        }
      }}
      className="group relative bg-card hover:bg-accent rounded-xl cursor-pointer flex flex-col p-4 flex-shrink-0 transition-colors duration-300 shadow-sm hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden rounded-full shadow-lg mb-4 mx-2">
        <ArtistAvatar 
          artistName={artist.name} 
          artistId={artist.id} 
          className="w-full h-full flex items-center justify-center bg-foreground/5" 
          fallbackSize={48}
        />
      </div>

      <div className="text-left mt-auto px-1">
        <p className="text-base font-bold truncate text-foreground">{artist.name}</p>
        <p className="text-sm truncate mt-1 font-medium text-foreground/60">
          {t('common.artist')}
        </p>
      </div>
    </div>
  );
});

export default ArtistCard;

