import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../store/playerStore';
import { formatArtistName } from '../../utils/formatters';
import { formatTime } from '../../utils/timeFormat';
import TrackImage from '../common/TrackImage';
import { Play } from 'lucide-react';
import { getCoverArtUrl } from '../../api/subsonic';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../common/dnd/SortableItem';

export default function MobileQueueTab() {
  const { t } = useTranslation();
  const { queue, currentIndex, playTrack, role } = usePlayerStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the active track when the tab opens
    if (listRef.current && currentIndex >= 0 && currentIndex < queue.length) {
      const activeElement = document.getElementById(`mobile-queue-item-${currentIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, queue.length]);

  const readOnly = role === 'listener';

  return (
    <div className="w-full h-full flex flex-col pt-4 overflow-y-auto hide-scrollbar" ref={listRef}>
      <h3 className="px-6 pb-2 text-lg font-bold text-white mb-2">
        {t('player.next_in_queue', { defaultValue: 'Next in Queue' })}
      </h3>
      
      <SortableContext 
        items={queue.map((t, idx) => `${t.id}-${idx}`)}
        strategy={verticalListSortingStrategy}
      >
        {queue.map((track, idx) => {
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
                  className={`flex items-center w-full px-6 py-3 transition-colors ${
                    isPlaying ? 'bg-white/10' : ''
                  } ${!readOnly ? 'cursor-grab active:cursor-grabbing active:bg-white/20' : ''} ${
                    isDragging ? 'opacity-30' : ''
                  }`}
                >
                  <div className="relative w-12 h-12 flex-shrink-0 mr-4 rounded-md overflow-hidden shadow-sm bg-black/20 pointer-events-none select-none">
                    <TrackImage src={getCoverArtUrl(track.id, 100)} className="w-full h-full object-cover" alt="" />
                    {isPlaying && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <Play size={20} className="text-primary" fill="currentColor" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-center pointer-events-none select-none">
                    <p className={`truncate text-base font-medium ${isPlaying ? 'text-primary' : 'text-white'}`}>
                      {track.title}
                    </p>
                    <p className="truncate text-sm text-white/60">
                      {formatArtistName(track.artist)}
                    </p>
                  </div>
                  
                  <div className="w-12 flex justify-end text-xs font-medium text-white/40 pointer-events-none select-none">
                    {formatTime(track.duration)}
                  </div>
                </div>
              )}
            </SortableItem>
          );
        })}
      </SortableContext>
      
      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-white/40">
          <p>{t('player.queue_is_empty', { defaultValue: 'Queue is empty' })}</p>
        </div>
      )}
      {/* Extra padding at the bottom so the last item isn't hidden by the navigation */}
      <div className="h-10 flex-shrink-0" />
    </div>
  );
}
