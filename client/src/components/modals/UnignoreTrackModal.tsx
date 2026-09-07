import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Ban, Play, X, Music } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { usePlayerStore } from '../../store/playerStore';
import { getCoverArtUrl } from '../../api/subsonic';
import { isMobileDevice } from '../../App';

export default function UnignoreTrackModal() {
  const { t } = useTranslation();
  const { unignoreModal, closeUnignoreModal } = useUIStore();
  const { excludedTrackIds, excludedAlbumIds, toggleTrackExclude, toggleAlbumExclude } = usePlayerStore();

  const checkIsMobile = () => {
    if (typeof window === 'undefined') return false;
    return isMobileDevice();
  };

  const [isMobile, setIsMobile] = useState(checkIsMobile);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(checkIsMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!unignoreModal.isOpen || !unignoreModal.track) return null;

  const track = unignoreModal.track;
  const coverUrl = getCoverArtUrl(track.coverArt || track.albumId || track.id, 300);

  const handleConfirm = () => {
    if (excludedTrackIds.includes(track.id)) {
      toggleTrackExclude(track.id);
    }
    if (track.albumId && excludedAlbumIds.includes(track.albumId)) {
      toggleAlbumExclude(track.albumId);
    }
    unignoreModal.onConfirm?.();
    closeUnignoreModal();
  };

  // Drag handlers for mobile bottom sheet (supports moving both UP and DOWN)
  const handleDragStart = (clientY: number) => {
    touchStartY.current = clientY;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging.current || touchStartY.current === null || !sheetRef.current) return;
    const delta = clientY - touchStartY.current;
    // Allow dragging down (delta > 0), and dragging up with rubber-band resistance (delta < 0)
    const translateY = delta > 0 ? delta : Math.max(delta * 0.3, -50);
    sheetRef.current.style.transform = `translateY(${translateY}px)`;
  };

  const handleDragEnd = (clientY?: number) => {
    if (!isDragging.current || touchStartY.current === null || !sheetRef.current) return;
    isDragging.current = false;
    const finalY = clientY ?? touchStartY.current;
    const delta = finalY - touchStartY.current;
    sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    if (delta > 80) {
      closeUnignoreModal();
    } else {
      sheetRef.current.style.transform = 'translateY(0px)';
    }
    touchStartY.current = null;
  };

  // Mobile Bottom Sheet
  if (isMobile) {
    return createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200"
          onClick={closeUnignoreModal}
        />

        {/* Bottom Sheet */}
        <div 
          ref={sheetRef}
          className="fixed z-[9999] bottom-0 left-0 right-0 bg-card border-t border-black/10 dark:border-transparent rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden px-5 pt-3 pb-8 animate-in slide-in-from-bottom-full duration-300"
          style={{ 
            maxHeight: '85vh',
            transition: 'transform 0.3s ease-out'
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Draggable Header Area (can drag up and down from anywhere in this area) */}
          <div 
            className="touch-none select-none"
            onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
            onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
            onTouchEnd={(e) => handleDragEnd(e.changedTouches[0]?.clientY)}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, a, input')) return;
              handleDragStart(e.clientY);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => handleDragMove(e.clientY)}
            onPointerUp={(e) => handleDragEnd(e.clientY)}
            onPointerCancel={() => handleDragEnd()}
          >
            {/* Header Drag Handle */}
            <div className="w-full pt-1 pb-3 flex justify-center cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 bg-foreground/20 rounded-full" />
            </div>

            {/* Track Information Card */}
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-foreground/5 border border-black/5 dark:border-transparent mb-4 pointer-events-none">
              {coverUrl ? (
                <img 
                  src={coverUrl} 
                  alt="" 
                  className="w-14 h-14 rounded-xl object-cover shadow-sm shrink-0 pointer-events-none" 
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-foreground/10 flex items-center justify-center text-secondary shrink-0">
                  <Music size={22} />
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-foreground text-base truncate">{track.title || track.name}</span>
                <span className="text-secondary text-xs truncate mt-0.5">{track.artist || track.album}</span>
              </div>
            </div>

            {/* Ignored Warning Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 dark:border-transparent text-xs font-semibold mb-3 pointer-events-none">
              <Ban size={14} className="shrink-0" />
              <span>{t('common.unignore_track_title', 'Трек в игноре')}</span>
            </div>

            {/* Explanation */}
            <p className="text-sm text-foreground/80 leading-relaxed mb-6 pointer-events-none">
              {t('common.unignore_track_desc', 'Этот трек находится в списке игнорируемых. Хотите убрать его из игнора и начать воспроизведение?')}
            </p>
          </div>

          {/* Action Buttons in a Single Row with Equal Height */}
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={closeUnignoreModal}
              className="flex-1 h-12 rounded-2xl bg-foreground/10 hover:bg-foreground/15 text-foreground font-semibold flex items-center justify-center transition-colors text-sm active:scale-95 cursor-pointer"
            >
              {t('common.cancel', 'Отмена')}
            </button>

            <button
              onClick={handleConfirm}
              className="flex-[1.4] h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg shadow-primary/20 text-sm cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              <span className="truncate">{t('common.unignore_and_play_btn', 'Убрать из игнора и включить')}</span>
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  // Desktop Centered Modal Dialog
  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={closeUnignoreModal}
    >
      <div 
        className="bg-card border border-black/10 dark:border-transparent rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 dark:border-transparent flex items-center justify-center text-red-500">
              <Ban size={20} />
            </div>
            <h2 className="text-base font-bold text-foreground">{t('common.unignore_track_title', 'Трек в игноре')}</h2>
          </div>
          <button 
            onClick={closeUnignoreModal}
            className="p-2 text-secondary hover:text-foreground transition-colors rounded-full hover:bg-foreground/10 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Track Preview */}
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-foreground/5 border border-black/5 dark:border-transparent">
          {coverUrl ? (
            <img 
              src={coverUrl} 
              alt="" 
              className="w-12 h-12 rounded-lg object-cover shadow-sm shrink-0 pointer-events-none" 
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center text-secondary shrink-0">
              <Music size={20} />
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-semibold text-foreground text-sm truncate">{track.title || track.name}</span>
            <span className="text-secondary text-xs truncate mt-0.5">{track.artist || track.album}</span>
          </div>
        </div>

        {/* Text */}
        <p className="text-sm text-foreground/80 leading-relaxed">
          {t('common.unignore_track_desc', 'Этот трек находится в списке игнорируемых. Хотите убрать его из игнора и начать воспроизведение?')}
        </p>

        {/* Actions in a Single Row with Equal Height */}
        <div className="flex items-center gap-3 w-full pt-2">
          <button
            onClick={closeUnignoreModal}
            className="flex-1 h-12 rounded-2xl bg-foreground/10 hover:bg-foreground/15 text-foreground text-sm font-semibold transition-colors flex items-center justify-center cursor-pointer active:scale-95"
          >
            {t('common.cancel', 'Отмена')}
          </button>
          <button
            onClick={handleConfirm}
            className="flex-[1.4] h-12 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-transform active:scale-95 cursor-pointer"
          >
            <Play size={16} fill="currentColor" />
            <span className="truncate">{t('common.unignore_and_play_btn', 'Убрать из игнора и включить')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
