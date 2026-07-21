import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import JamSessionControl from '../jam/JamSessionControl';

interface MobileJamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileJamModal({ isOpen, onClose }: MobileJamModalProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  // Handle clicking outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200 md:hidden"
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div 
        ref={menuRef}
        className="fixed z-[9999] bottom-0 left-0 right-0 bg-[#1c1c1c] border-t border-white/10 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300 md:hidden"
        style={{ 
          maxHeight: '85vh',
          transition: 'transform 0.3s ease-out'
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Header with Drag Handle */}
        <div 
          className="px-4 pt-2 pb-2 touch-none"
          onTouchStart={(e) => {
            touchStartY.current = e.touches[0].clientY;
            if (menuRef.current) menuRef.current.style.transition = 'none';
          }}
          onTouchMove={(e) => {
            if (touchStartY.current !== null && menuRef.current) {
              const delta = e.touches[0].clientY - touchStartY.current;
              if (delta > 0) {
                menuRef.current.style.transform = `translateY(${delta}px)`;
              }
            }
          }}
          onTouchEnd={(e) => {
            if (touchStartY.current !== null && menuRef.current) {
              const delta = e.changedTouches[0].clientY - touchStartY.current;
              menuRef.current.style.transition = 'transform 0.3s ease-out';
              if (delta > 80) {
                onClose();
              } else {
                menuRef.current.style.transform = 'translateY(0px)';
              }
              touchStartY.current = null;
            }
          }}
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
          <div className="flex flex-col items-center gap-1 mb-2">
            <h3 className="font-bold text-center text-white text-[17px]">{t('common.jam_session_title', { defaultValue: 'Совместный джем' })}</h3>
            <p className="text-xs text-secondary text-center">{t('common.jam_session_desc', { defaultValue: 'Слушайте музыку вместе с друзьями' })}</p>
          </div>
        </div>

        <div className="overflow-y-auto hide-scrollbar max-h-[60vh] px-6 py-2 pb-12">
          <JamSessionControl />
        </div>
      </div>
    </>,
    document.body
  );
}
