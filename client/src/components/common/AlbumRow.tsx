import LongPressWrapper from './LongPressWrapper';
import TrackImage from './TrackImage';
import { getCoverArtUrl } from '../../api/subsonic';

export interface AlbumRowProps {
  album: any;
  onClick?: () => void;
  onLongPress?: (e: any) => void;
  id?: string;
  className?: string;
}

export function AlbumRow({
  album,
  onClick,
  onLongPress = () => {},
  id,
  className = '',
}: AlbumRowProps) {
  const coverUrl = getCoverArtUrl(album.coverArt || album.id, 300);
  const albumTitle = album.name || album.title;

  return (
    <LongPressWrapper
      id={id}
      className={`flex items-center gap-4 cursor-pointer ${className}`.trim()}
      onClick={onClick}
      onLongPress={onLongPress}
    >
      <div className="relative w-16 h-16 flex-shrink-0">
        <TrackImage
          src={coverUrl}
          className="w-full h-full rounded-md object-cover"
          alt={albumTitle}
          trackId={album.id}
        />
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <span className="text-[15px] text-foreground font-bold truncate">
          {albumTitle}
        </span>
        <span className="text-secondary text-[13px] truncate">
          {album.artist}
        </span>
      </div>
    </LongPressWrapper>
  );
}

export default AlbumRow;
