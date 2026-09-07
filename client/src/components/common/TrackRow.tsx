import React, { memo, useCallback } from 'react';
import { Play, Pause, Heart, Ban, Download } from 'lucide-react';
import { usePlayerStore } from '../../store/playerStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import { useUIStore } from '../../store/uiStore';
import { getCoverArtUrl, starItem, unstarItem } from '../../api/subsonic';
import { formatTime } from '../../utils/timeFormat';
import { formatArtistName } from '../../utils/formatters';
import TrackImage from './TrackImage';
import ArtistLinks from './ArtistLinks';
import LongPressWrapper from './LongPressWrapper';

export interface TrackRowProps {
  track: any;
  index: number;
  onPlay?: (index: number) => void;
  onClick?: (e?: any) => void;
  variant?: 'tracks' | 'playlist' | 'album' | 'favorites';
  contextMenuExtra?: Record<string, any>;
  albumArtist?: string;
  albumArtistId?: string;
  className?: string;
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  onPlay,
  onClick,
  variant = 'tracks',
  contextMenuExtra,
  albumArtist,
  albumArtistId,
  className = ''
}: TrackRowProps) {
  const isCurrentPlaying = usePlayerStore(s => s.queue[s.currentIndex]?.id === track.id);
  const isPlaying = usePlayerStore(s => s.isPlaying && isCurrentPlaying);
  const isTrackLiked = usePlayerStore(s => s.likedTrackIds.includes(track.id));
  const isExcluded = usePlayerStore(s => s.excludedTrackIds.includes(track.id));
  const openUnignoreModal = useUIStore(s => s.openUnignoreModal);

  const toggleTrackLike = usePlayerStore(s => s.toggleTrackLike);
  const toggleTrackExclude = usePlayerStore(s => s.toggleTrackExclude);
  const isGuest = usePlayerStore(s => !s.roomId && s.role !== 'host');
  const isDownloaded = useDownloadStore(s => isItemDownloaded(s.downloads, track.id, track.albumId));
  const openMenu = useContextMenuStore(s => s.openMenu);

  const handlePlay = useCallback((e?: React.MouseEvent) => {
    if (isExcluded) {
      openUnignoreModal(track, () => {
        if (onClick) {
          onClick(e);
        } else if (onPlay) {
          onPlay(index);
        }
      });
      return;
    }
    if (onClick) {
      onClick(e);
    } else if (onPlay) {
      onPlay(index);
    }
  }, [onClick, onPlay, index, isExcluded, track, openUnignoreModal]);

  const handleContextMenu = useCallback((e: any) => {
    e?.preventDefault?.();
    const coverArtUrl = getCoverArtUrl(track.coverArt || track.albumId || track.id, 300);
    const clientX = e?.clientX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
    const clientY = e?.clientY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
    openMenu(clientX, clientY, {
      ...track,
      coverArt: coverArtUrl,
      ...contextMenuExtra
    }, 'track');
  }, [track, contextMenuExtra, openMenu]);

  const handleLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackLike(track.id);
    if (isTrackLiked) {
      unstarItem(track.id);
    } else {
      starItem(track.id);
    }
  }, [track.id, isTrackLiked, toggleTrackLike]);

  const handleExclude = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTrackExclude(track.id);
  }, [track.id, toggleTrackExclude]);

  // Playlist view variant
  if (variant === 'playlist') {
    return (
      <LongPressWrapper 
        onClick={handlePlay}
        onLongPress={handleContextMenu}
        className={`flex items-center px-2 sm:px-4 py-2 sm:py-3 rounded-lg cursor-pointer group hover:bg-foreground/5 transition-colors ${isCurrentPlaying ? 'bg-foreground/10' : ''} ${className}`}
      >
        <div className="w-8 sm:w-12 text-center text-xs sm:text-sm font-medium text-secondary">
          {isCurrentPlaying ? (
            isPlaying ? (
              <Pause size={14} className="text-primary mx-auto stroke-none" fill="currentColor" />
            ) : (
              <Play size={14} className="text-primary mx-auto stroke-none" fill="currentColor" />
            )
          ) : (
            <>
              <span className="group-hover:hidden">{index + 1}</span>
              <Play size={14} className="hidden group-hover:block mx-auto text-[#b3b3b3] stroke-none" fill="currentColor" />
            </>
          )}
        </div>
        <div className="flex-1 flex flex-col min-w-0 pr-2 sm:pr-4">
          <span className={`flex items-center gap-2 text-sm sm:text-base font-semibold truncate ${isCurrentPlaying ? 'text-primary' : 'text-foreground'}`}>
            <span className="truncate">{track.title || track.name}</span>
            {isDownloaded && <Download size={14} className="text-primary shrink-0" />}
          </span>
          <ArtistLinks artistString={track.artist} artistId={track.artistId} className="text-xs text-secondary truncate" />
        </div>
        {!isGuest && (
          <div className="hidden md:flex w-24 justify-center gap-4">
            <Heart 
              size={16} 
              className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isTrackLiked ? 'opacity-100 text-primary' : 'text-[#b3b3b3]/50 hover:text-foreground'}`}
              fill={isTrackLiked ? 'currentColor' : 'none'}
              onClick={handleLike}
            />
            <Ban
              size={16}
              className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isExcluded ? 'opacity-100 text-red-500' : 'text-[#b3b3b3]/50 hover:text-red-400'}`}
              onClick={handleExclude}
            />
          </div>
        )}
        <div className="w-12 sm:w-16 text-right text-xs sm:text-sm text-secondary font-medium">
          {formatTime(track.duration)}
        </div>
      </LongPressWrapper>
    );
  }

  // Album view variant
  if (variant === 'album') {
    return (
      <LongPressWrapper 
        onClick={handlePlay}
        onLongPress={handleContextMenu}
        className={`flex items-center px-2 sm:px-4 py-2 sm:py-3 rounded-lg cursor-pointer group hover:bg-foreground/5 transition-colors ${isCurrentPlaying ? 'bg-foreground/10' : ''} ${className}`}
      >
        <div className="w-8 sm:w-12 text-center text-xs sm:text-sm font-medium text-secondary">
          {isCurrentPlaying ? (
            isPlaying ? (
              <Pause size={14} className="text-primary mx-auto stroke-none" fill="currentColor" />
            ) : (
              <Play size={14} className="text-primary mx-auto stroke-none" fill="currentColor" />
            )
          ) : (
            <>
              <span className="group-hover:hidden">{index + 1}</span>
              <Play size={14} className="hidden group-hover:block mx-auto text-[#b3b3b3] stroke-none" fill="currentColor" />
            </>
          )}
        </div>
        <div className={`flex-1 flex flex-col min-w-0 pr-2 sm:pr-4 ${isExcluded ? 'opacity-50 grayscale' : ''}`}>
          <span className={`flex items-center gap-2 text-sm sm:text-base font-semibold truncate ${isCurrentPlaying ? 'text-primary' : 'text-foreground'}`}>
            <span className="truncate">{track.title || track.name}</span>
            {isDownloaded && <Download size={14} className="text-primary shrink-0" />}
          </span>
          <ArtistLinks artistString={track.artist || albumArtist} artistId={track.artistId || albumArtistId} className="text-xs text-secondary truncate" />
        </div>
        {!isGuest && (
          <div className="hidden md:flex w-24 justify-center gap-4">
            <Heart 
              size={16} 
              className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isTrackLiked ? 'opacity-100 text-primary' : 'text-[#b3b3b3]/50 hover:text-foreground'}`}
              fill={isTrackLiked ? 'currentColor' : 'none'}
              onClick={handleLike}
            />
            <Ban
              size={16}
              className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isExcluded ? 'opacity-100 text-red-500' : 'text-[#b3b3b3]/50 hover:text-red-400'}`}
              onClick={handleExclude}
            />
          </div>
        )}
        <div className="w-12 sm:w-16 text-right text-xs sm:text-sm text-secondary font-medium">
          {formatTime(track.duration)}
        </div>
      </LongPressWrapper>
    );
  }

  // Favorites view variant
  if (variant === 'favorites') {
    return (
      <LongPressWrapper 
        onClick={handlePlay}
        onLongPress={handleContextMenu}
        className={`flex items-center gap-3 md:gap-4 p-2 rounded-md hover:bg-white/5 group transition-colors cursor-pointer ${isCurrentPlaying ? 'bg-foreground/10' : ''} ${className}`}
      >
        <div className="w-8 hidden md:flex justify-center text-secondary relative text-xs">
          <span className="group-hover:hidden">{index + 1}</span>
          <button 
            onClick={(e) => { e.stopPropagation(); handlePlay(e); }}
            className="hidden group-hover:flex text-primary"
          >
            {isCurrentPlaying && isPlaying ? (
              <Pause fill="currentColor" size={14} />
            ) : (
              <Play fill="currentColor" size={14} />
            )}
          </button>
        </div>
        
        <div className="w-12 h-12 md:w-10 md:h-10 rounded-md md:rounded overflow-hidden flex-shrink-0 bg-foreground/10 relative shadow-sm">
          <TrackImage src={getCoverArtUrl(track.coverArt || track.id, 100)} className="w-full h-full object-cover" alt="" trackId={track.id} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`flex items-center gap-2 text-[15px] md:text-sm font-bold md:font-medium truncate transition-colors ${isCurrentPlaying ? 'text-primary' : 'text-foreground group-hover:text-primary'}`}>
            <span className="truncate">{track.title || track.name}</span>
            {isDownloaded && <Download size={14} className="text-primary shrink-0 group-hover:text-primary" />}
          </p>
          <p className="text-[13px] md:text-xs text-[#b3b3b3] md:text-secondary truncate">
            {formatArtistName(track.artist)}{track.album ? ` • ${track.album}` : ''}
          </p>
        </div>
        
        <button 
          className="md:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={handleLike}
        >
          <Heart size={18} fill={isTrackLiked ? 'currentColor' : 'none'} className={isTrackLiked ? 'text-primary' : 'text-[#b3b3b3] md:text-white/30 hover:text-foreground'} />
        </button>

        <div className="w-12 hidden md:block text-right text-xs text-secondary">
          {formatTime(track.duration)}
        </div>
      </LongPressWrapper>
    );
  }

  // Default: TracksView table row layout
  return (
    <LongPressWrapper 
      onClick={handlePlay}
      onLongPress={handleContextMenu}
      className={`flex items-center md:px-6 md:py-2 cursor-pointer group hover:bg-white/5 transition-colors mb-3 md:mb-0 ${isCurrentPlaying ? 'md:bg-foreground/10' : ''} ${className}`}
    >
      <div className="w-10 hidden md:flex text-center text-xs font-semibold text-secondary justify-center">
        {isCurrentPlaying ? (
          isPlaying ? (
            <Pause size={14} className="text-primary stroke-none" fill="currentColor" />
          ) : (
            <Play size={14} className="text-primary stroke-none" fill="currentColor" />
          )
        ) : (
          <>
            <span className="group-hover:hidden">{index + 1}</span>
            <Play size={14} className="hidden group-hover:block text-[#b3b3b3] stroke-none" fill="currentColor" />
          </>
        )}
      </div>
      
      <div className="flex-1 min-w-0 md:min-w-[200px] flex items-center gap-3 pr-2 md:pr-4">
        <TrackImage src={getCoverArtUrl(track.coverArt || track.albumId || track.id, 300)} alt="" className="w-12 h-12 md:w-10 md:h-10 rounded-md md:rounded object-cover shadow-sm flex-shrink-0" trackId={track.id} />
        <div className="flex flex-col min-w-0 flex-1">
          <span className={`flex items-center gap-2 text-[15px] md:text-sm font-bold md:font-semibold truncate ${isCurrentPlaying ? 'text-primary' : 'text-foreground'}`}>
            <span className="truncate">{track.title || track.name}</span>
            {isDownloaded && <Download size={14} className="text-primary shrink-0" />}
          </span>
          <span className="text-[13px] md:text-xs text-[#b3b3b3] md:text-secondary truncate">{formatArtistName(track.artist)}{track.album ? ` • ${track.album}` : ''}</span>
        </div>
      </div>

      <div className="w-16 hidden md:flex justify-center text-xs font-medium text-secondary">
        {formatTime(track.duration)}
      </div>

      <div className="flex-1 min-w-[150px] text-xs text-secondary truncate hidden md:block pr-4">
        {track.album}
      </div>

      <div className="w-32 text-xs text-secondary truncate hidden md:block pr-4">
        {track.genre || '-'}
      </div>

      <div className="w-16 text-xs text-secondary text-right hidden lg:block pr-4">
        {track.year || '-'}
      </div>

      {!isGuest && (
        <div className="w-16 md:w-24 flex items-center justify-end md:justify-center gap-2 md:gap-4 md:ml-4">
          <Heart 
            size={18} 
            className={`md:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isTrackLiked ? 'opacity-100 text-primary' : 'text-[#b3b3b3] md:text-[#b3b3b3]/30 hover:text-foreground'}`}
            fill={isTrackLiked ? 'currentColor' : 'none'}
            onClick={handleLike}
          />
          <Ban
            size={18}
            className={`md:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${isExcluded ? 'opacity-100 text-red-500' : 'text-[#b3b3b3] md:text-[#b3b3b3]/30 hover:text-red-400'}`}
            onClick={handleExclude}
          />
        </div>
      )}
    </LongPressWrapper>
  );
});

export default TrackRow;
