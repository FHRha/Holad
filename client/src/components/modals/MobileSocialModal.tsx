import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { UsersRound, Radio, X } from 'lucide-react';
import JamSessionControl from '../jam/JamSessionControl';
import { SocialPanel, AudioModeToggle, useSocialState } from '../social';

export interface MobileSocialModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'friends' | 'jam';
}

export default function MobileSocialModal({ isOpen, onClose, defaultTab = 'friends' }: MobileSocialModalProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const dragMode = useRef<'pointer' | 'touch' | null>(null);
  const isClosing = useRef(false);
  const isContentDragging = useRef(false);
  const contentStartY = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<'friends' | 'jam'>(defaultTab);
  const { friends, hasNotifications, audioMode, setAudioMode, roomId } = useSocialState();

  const handleClose = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    if (menuRef.current) {
      menuRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => {
        onClose();
        isClosing.current = false;
      }, 200);
    } else {
      onClose();
      isClosing.current = false;
    }
  };

  const startDrag = (clientY: number, mode: 'pointer' | 'touch', pointerId?: number, target?: HTMLElement) => {
    if (isClosing.current) return;
    dragMode.current = mode;
    isDragging.current = true;
    dragStartY.current = clientY;
    if (menuRef.current) {
      menuRef.current.style.transition = 'none';
    }
    if (mode === 'pointer' && pointerId !== undefined && target?.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId);
      } catch {}
    }
  };

  const updateDrag = (clientY: number) => {
    if (!isDragging.current || dragStartY.current === null || !menuRef.current) return;
    const delta = clientY - dragStartY.current;
    if (delta > 0) {
      menuRef.current.style.transform = `translateY(${delta}px)`;
    } else {
      menuRef.current.style.transform = `translateY(${Math.max(delta * 0.25, -30)}px)`;
    }
  };

  const endDrag = (clientY?: number) => {
    if (!isDragging.current || dragStartY.current === null || !menuRef.current) {
      dragMode.current = null;
      isDragging.current = false;
      return;
    }
    const finalY = clientY ?? dragStartY.current;
    const delta = finalY - dragStartY.current;
    dragStartY.current = null;
    dragMode.current = null;
    isDragging.current = false;

    if (delta > 75) {
      handleClose();
    } else {
      menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(0px)';
    }
  };

  const cancelDrag = () => {
    if (!isDragging.current) return;
    dragStartY.current = null;
    dragMode.current = null;
    isDragging.current = false;
    if (menuRef.current) {
      menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      menuRef.current.style.transform = 'translateY(0px)';
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    isClosing.current = false;
    if (menuRef.current) {
      menuRef.current.style.transform = 'translateY(0px)';
    }
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998] animate-in fade-in duration-200 md:hidden"
        onClick={handleClose}
      />
      
      <div 
        ref={menuRef}
        className="fixed z-[9999] bottom-0 left-0 right-0 bg-[#161616] border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)] overflow-hidden pb-6 animate-in slide-in-from-bottom-full duration-300 md:hidden flex flex-col will-change-transform"
        style={{ 
          maxHeight: '90vh',
          height: '88vh'
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div 
          className="touch-none select-none shrink-0 bg-[#161616]"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button, input, textarea, a, select')) return;
            startDrag(e.clientY, 'pointer', e.pointerId, e.currentTarget);
          }}
          onPointerMove={(e) => {
            if (dragMode.current === 'pointer') updateDrag(e.clientY);
          }}
          onPointerUp={(e) => {
            if (dragMode.current === 'pointer') endDrag(e.clientY);
          }}
          onPointerCancel={() => {
            if (dragMode.current === 'pointer') cancelDrag();
          }}
          onTouchStart={(e) => {
            if (dragMode.current === 'pointer') return;
            if ((e.target as HTMLElement).closest('button, input, textarea, a, select')) return;
            startDrag(e.touches[0].clientY, 'touch');
          }}
          onTouchMove={(e) => {
            if (dragMode.current === 'touch' && isDragging.current) {
              if (e.cancelable) e.preventDefault();
              updateDrag(e.touches[0].clientY);
            }
          }}
          onTouchEnd={(e) => {
            if (dragMode.current === 'touch') endDrag(e.changedTouches[0]?.clientY);
          }}
          onTouchCancel={() => {
            if (dragMode.current === 'touch') cancelDrag();
          }}
        >
          <div className="w-full pt-3 pb-2 flex items-center justify-center cursor-grab active:cursor-grabbing">
            <div className="w-12 h-1.5 bg-white/30 rounded-full hover:bg-white/50 transition-colors" />
          </div>

          <div className="px-4 pb-2.5 flex items-center justify-between border-b border-white/5">
            <div className="flex items-center gap-2">
              <UsersRound size={18} className="text-primary" />
              <h2 className="font-bold text-base text-foreground">
                {t('social.tab_friends', 'Jam & Друзья')}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-secondary hover:text-foreground transition-all"
              aria-label={t('common.close', 'Закрыть')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 shrink-0 border-b border-white/5 bg-[#161616]">
          <div className="flex bg-[#222222] p-1 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('friends')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
                activeTab === 'friends'
                  ? 'bg-primary text-black shadow-md'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              <UsersRound size={16} />
              <span>{t('social.tab_friends_button', 'Друзья')}</span>
              {friends.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === 'friends' ? 'bg-black/20 text-black' : 'bg-white/10 text-secondary'
                }`}>
                  {friends.length}
                </span>
              )}
              {hasNotifications && (
                <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#222222] animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('jam')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${
                activeTab === 'jam'
                  ? 'bg-primary text-black shadow-md'
                  : 'text-secondary hover:text-foreground'
              }`}
            >
              <Radio size={16} />
              <span>{t('social.tab_jam', 'Jam-сессия')}</span>
              {roomId && (
                <span className="w-2 h-2 rounded-full bg-green-400 ring-2 ring-[#222222] animate-pulse" />
              )}
            </button>
          </div>
        </div>

        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4 hide-scrollbar overscroll-y-contain"
          onTouchStart={(e) => {
            if (contentRef.current && contentRef.current.scrollTop <= 0) {
              contentStartY.current = e.touches[0].clientY;
              isContentDragging.current = false;
            } else {
              contentStartY.current = null;
            }
          }}
          onTouchMove={(e) => {
            if (contentStartY.current === null || !contentRef.current || !menuRef.current) return;
            if (contentRef.current.scrollTop <= 0) {
              const delta = e.touches[0].clientY - contentStartY.current;
              if (delta > 0) {
                if (e.cancelable) e.preventDefault();
                isContentDragging.current = true;
                menuRef.current.style.transition = 'none';
                menuRef.current.style.transform = `translateY(${delta}px)`;
              }
            }
          }}
          onTouchEnd={(e) => {
            if (!isContentDragging.current || contentStartY.current === null || !menuRef.current) {
              contentStartY.current = null;
              isContentDragging.current = false;
              return;
            }
            const finalY = e.changedTouches[0]?.clientY ?? contentStartY.current;
            const delta = finalY - contentStartY.current;
            contentStartY.current = null;
            isContentDragging.current = false;

            if (delta > 75) {
              handleClose();
            } else {
              menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
              menuRef.current.style.transform = 'translateY(0px)';
            }
          }}
          onTouchCancel={() => {
            if (isContentDragging.current && menuRef.current) {
              menuRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
              menuRef.current.style.transform = 'translateY(0px)';
            }
            contentStartY.current = null;
            isContentDragging.current = false;
          }}
        >
          {activeTab === 'friends' ? (
            <SocialPanel variant="modal" onAcceptJamInvite={() => setActiveTab('jam')} />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 bg-[#1e1e1e] border border-white/5 rounded-2xl p-3.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-secondary px-1">
                  {t('social.mode_jam_playback', 'Режим воспроизведения Jam')}
                </span>
                <AudioModeToggle audioMode={audioMode} onSetAudioMode={setAudioMode} variant="modal" />
              </div>

              <div className="bg-[#1e1e1e] border border-white/5 rounded-2xl p-4">
                <JamSessionControl />
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
