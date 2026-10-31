import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  maxHeight?: string;
  height?: string;
  dragThreshold?: number;
  onContextMenu?: (e: any) => void;
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  header,
  className = '',
  maxHeight = '85vh',
  height,
  dragThreshold = 80,
  onContextMenu
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current !== null && sheetRef.current) {
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta > 0) {
        sheetRef.current.style.transform = `translateY(${delta}px)`;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current !== null && sheetRef.current) {
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      sheetRef.current.style.transition = 'transform 0.3s ease-out';
      if (delta > dragThreshold) {
        onClose();
      } else {
        sheetRef.current.style.transform = 'translateY(0px)';
      }
      touchStartY.current = null;
    }
  };

  // Pointer gesture handlers (for mouse swipe down support on desktop/emulators)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // Handled by touch events
    if (e.button !== 0) return;
    pointerStartY.current = e.clientY;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (pointerStartY.current !== null && sheetRef.current) {
      const delta = e.clientY - pointerStartY.current;
      if (delta > 0) {
        sheetRef.current.style.transform = `translateY(${delta}px)`;
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (pointerStartY.current !== null && sheetRef.current) {
      const delta = e.clientY - pointerStartY.current;
      sheetRef.current.style.transition = 'transform 0.3s ease-out';
      if (delta > dragThreshold) {
        onClose();
      } else {
        sheetRef.current.style.transform = 'translateY(0px)';
      }
      pointerStartY.current = null;
    }
  };

  if (typeof document === 'undefined' || !isOpen) return null;

  return createPortal(
    <>
      <div 
        className="fixed inset-0 bg-black/60 z-[9998] animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div 
        ref={sheetRef}
        className={`fixed z-[9999] bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden pb-8 animate-in slide-in-from-bottom-full duration-300 ${className}`.trim()}
        style={{ 
          maxHeight,
          height: height || undefined,
          transition: 'transform 0.3s ease-out'
        }}
        onContextMenu={onContextMenu || ((e) => e.preventDefault())}
      >
        <div 
          className="px-4 pt-2 pb-4 border-b border-border touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4" />
          {header}
        </div>

        {children}
      </div>
    </>,
    document.body
  );
}
