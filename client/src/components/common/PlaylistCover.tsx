import { useMemo } from 'react';
import { ListMusic } from 'lucide-react';
import TrackImage from './TrackImage';
import { getCoverArtUrl } from '../../api/subsonic';

interface PlaylistCoverProps {
  coverArt?: string | null;
  trackIds?: string[];
  tracks?: any[];
  alt?: string;
  className?: string;
  size?: number;
}

export default function PlaylistCover({
  coverArt,
  trackIds = [],
  tracks = [],
  alt = 'Playlist Cover',
  className = '',
  size = 300
}: PlaylistCoverProps) {
  // If a direct server coverArt is provided (and not custom), use single TrackImage
  const hasDirectCover = Boolean(coverArt && coverArt !== 'null' && coverArt !== 'undefined');

  // Gather available items for collage or fallback
  const items = useMemo(() => {
    if (tracks.length > 0) {
      return tracks.slice(0, 4).map(t => ({
        id: t.id,
        cover: t.coverArt || t.albumId || t.id
      }));
    }
    if (trackIds.length > 0) {
      return trackIds.slice(0, 4).map(id => ({
        id,
        cover: id
      }));
    }
    return [];
  }, [tracks, trackIds]);

  // Case 1: Direct single cover provided (e.g. Subsonic server playlist) and no separate items
  if (hasDirectCover && items.length === 0) {
    return (
      <TrackImage
        src={getCoverArtUrl(coverArt, size)}
        trackId={coverArt || undefined}
        alt={alt}
        className={className}
      />
    );
  }

  // Case 2: 4 or more tracks -> Beautiful 2x2 mosaic collage (like Spotify/Apple Music)
  if (items.length >= 4) {
    const halfSize = Math.max(100, Math.round(size / 2));
    return (
      <div className={`grid grid-cols-2 grid-rows-2 w-full h-full overflow-hidden bg-black/20 ${className}`}>
        {items.map((item, index) => (
          <div key={`${item.id}-${index}`} className="relative w-full h-full overflow-hidden">
            <TrackImage
              src={getCoverArtUrl(item.cover, halfSize)}
              trackId={item.id}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  // Case 3: 1 to 3 tracks -> Single first track cover
  if (items.length > 0) {
    const first = items[0];
    return (
      <TrackImage
        src={getCoverArtUrl(first.cover, size)}
        trackId={first.id}
        alt={alt}
        className={className}
      />
    );
  }

  // Case 4: Server playlist with direct coverArt even if items is empty
  if (hasDirectCover) {
    return (
      <TrackImage
        src={getCoverArtUrl(coverArt, size)}
        trackId={coverArt || undefined}
        alt={alt}
        className={className}
      />
    );
  }

  // Case 5: Empty playlist -> Fallback icon
  return (
    <div className={`w-full h-full bg-black/30 flex items-center justify-center text-foreground/25 ${className}`}>
      <ListMusic size={Math.min(64, Math.max(24, Math.round(size * 0.3)))} />
    </div>
  );
}
