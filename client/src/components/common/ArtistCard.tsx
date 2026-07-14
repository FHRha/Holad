import { useNavigate } from 'react-router-dom';
import ArtistAvatar from './ArtistAvatar';

interface ArtistCardProps {
  artist: {
    id: string;
    name: string;
    albumCount?: number;
  };
}

export default function ArtistCard({ artist }: ArtistCardProps) {
  const navigate = useNavigate();

  const slug = `${encodeURIComponent(artist.name)}-${artist.id}`;

  return (
    <div 
      onClick={() => {
        const isJam = window.location.pathname.startsWith('/jam');
        const searchParams = new URLSearchParams(window.location.search);
        const room = searchParams.get('room');
        if (isJam && room) {
          navigate(`/jam/library/artist/${slug}?room=${room}`);
        } else {
          navigate(`/Holad/artist/${slug}`);
        }
      }}
      className="group relative bg-[#181818] hover:bg-[#282828] rounded-xl cursor-pointer flex flex-col p-4 flex-shrink-0 transition-colors duration-300 shadow-sm hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden rounded-full shadow-lg mb-4 mx-2">
        <ArtistAvatar 
          artistName={artist.name} 
          artistId={artist.id} 
          className="w-full h-full flex items-center justify-center bg-white/5" 
          fallbackSize={48}
        />
      </div>

      <div className="text-left mt-auto px-1">
        <p className="text-base font-bold truncate text-white">{artist.name}</p>
        <p className="text-sm truncate mt-1 font-medium text-white/60">
          Исполнитель
        </p>
      </div>
    </div>
  );
}
