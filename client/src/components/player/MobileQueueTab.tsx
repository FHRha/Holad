import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import { Play, Download, MoreHorizontal, RefreshCw } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../common/dnd/SortableItem';
import { useDownloadStore, isItemDownloaded } from '../../store/downloadStore';
import { useContextMenuStore } from '../../store/contextMenuStore';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';

export default function MobileQueueTab() {
  const { t } = useTranslation();
  const { queue, currentIndex, playTrack, role } = usePlayerStore();
  const { openMenu } = useContextMenuStore();
  const downloads = useDownloadStore(state => state.downloads);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { setQueue, setCurrentIndex } = usePlayerStore();

  const handleRestoreQueue = async () => {
    try {
      const { getPlayQueue } = await import('../../api/subsonic');
      const q = await getPlayQueue();
      if (q && q.entry) {
        const mapped = q.entry.map((t: any) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          albumId: t.albumId,
          artistId: t.artistId,
          coverArt: t.coverArt,
          duration: t.duration,
          bitRate: t.bitRate,
          suffix: t.suffix
        }));
        setQueue(mapped);
        
        const currentId = q.current;
        if (currentId) {
          const idx = mapped.findIndex((t: any) => t.id === currentId);
          if (idx !== -1) setCurrentIndex(idx);
        }
      }
    } catch (e) {
      console.error('Failed to restore queue', e);
    }
  };

  useEffect(() => {
    // Scroll to the active track when the tab opens or currentIndex changes
    if (virtuosoRef.current && currentIndex >= 0 && currentIndex < queue.length) {
      virtuosoRef.current.scrollToIndex({
        index: currentIndex,
        align: 'center',
        behavior: 'smooth'
      });
    }
  }, [currentIndex, queue.length]);

  const readOnly = role === 'listener';

  return (
    <div className="w-full h-full flex flex-col pt-4 min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 pb-2 mb-2 flex-shrink-0">
        <h3 className="text-lg font-bold text-foreground">
          {t('player.next_in_queue')}
        </h3>
        {!readOnly && (
          <button onClick={handleRestoreQueue} className="text-secondary hover:text-foreground transition-colors p-1" title={t('common.restore_queue_from_server', 'Восстановить очередь с сервера')}>
            <RefreshCw size={20} />
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-secondary">
          <p>{t('player.queue_is_empty')}</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 w-full overflow-hidden">
          <SortableContext 
            items={queue.map((t, idx) => `${t.id}-${idx}`)}
            strategy={verticalListSortingStrategy}
          >
            <Virtuoso
              ref={virtuosoRef}
              className="h-full custom-scrollbar hide-scrollbar"
              data={queue}
              overscan={300}
              components={{
                Footer: () => <div className="h-10 flex-shrink-0" />
              }}
              itemContent={(idx: number, track: any) => {
                const isPlaying = idx === currentIndex;
                const sortableId = `${track.id}-${idx}`;

                return (
                  <SortableItem key={sortableId} id={sortableId}>
                    {({ setNodeRef, attributes, listeners, style, isDragging }) => (
                      <div 
                        ref={setNodeRef}
                        style={style}
                        id={`mobile-queue-item-${idx}`}
                        {...(!readOnly ? attributes : {})}
                        {...(!readOnly ? listeners : {})}
                        onClick={() => {
                          if (!readOnly && !isDragging) playTrack(idx);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const isTouchEvent = (e.nativeEvent as any)?.pointerType === 'touch' || 
                                               (e.nativeEvent as any)?.sourceCapabilities?.firesTouchEvents;
                          if (!isTouchEvent) {
                            openMenu(e.clientX, e.clientY, { ...track, queueIndex: idx, coverArt: getCoverArtUrl(track.coverArt || track.id, 300) }, 'track');
                          }
                        }}
                        className={`flex items-center w-full px-6 py-3 transition-colors select-none touch-pan-y ${
                          isPlaying ? 'bg-foreground/10' : ''
                        } ${!readOnly ? 'cursor-grab active:cursor-grabbing active:bg-foreground/20' : ''} ${
                          isDragging ? 'opacity-30' : ''
                        }`}
                      >
                        <div className="relative w-12 h-12 flex-shrink-0 mr-4 rounded-md overflow-hidden shadow-sm bg-black/20 pointer-events-none select-none">
                          <TrackImage src={getCoverArtUrl(track.coverArt || track.id, 100)} className="w-full h-full object-cover" alt="" trackId={track.id} />
                          {isPlaying && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Play size={20} className="text-primary" fill="currentColor" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0 flex flex-col justify-center pointer-events-none select-none">
                          <p className={`flex items-center gap-2 truncate text-base font-medium ${isPlaying ? 'text-primary' : 'text-foreground'}`}>
                            <span className="truncate">{track.title}</span>
                            {isItemDownloaded(downloads, track.id, track.albumId) && <Download size={14} className="text-primary shrink-0" />}
                          </p>
                          <p className="truncate text-sm text-secondary">
                            {formatArtistName(track.artist)}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="w-10 text-right text-xs font-medium text-secondary pointer-events-none select-none">
                            {formatTime(track.duration)}
                          </div>
                          {!readOnly && (
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                openMenu(rect.left, rect.bottom, { ...track, queueIndex: idx, coverArt: getCoverArtUrl(track.coverArt || track.id, 300) }, 'track');
                              }}
                              className="p-2 -mr-2 rounded-full active:bg-foreground/10 text-secondary hover:text-foreground transition-colors"
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </SortableItem>
                );
              }}
            />
          </SortableContext>
        </div>
      )}
    </div>
  );
}
