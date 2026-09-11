import React, { useRef, useEffect, useState, useCallback } from 'react';

interface VolumeSliderProps {
  value: number; // 0.0 to 1.0
  onChange: (value: number) => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (value: number) => void;
  onPercentageChange?: (formatted: string) => void;
  className?: string;
}

export default function VolumeSlider({
  value,
  onChange,
  onDrag,
  onDragEnd,
  onPercentageChange,
  className = '',
}: VolumeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastUpdateRef = useRef(0);
  const cachedRectRef = useRef<{ left: number; width: number }>({ left: 0, width: 0 });

  // Apply visual position directly to DOM elements without triggering React render
  const applyVisuals = useCallback((ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const pct = `${clamped * 100}%`;
    if (fillRef.current) fillRef.current.style.width = pct;
    if (thumbRef.current) thumbRef.current.style.left = pct;
    if (onPercentageChange) {
      onPercentageChange(`${Math.round(clamped * 100)}%`);
    }
  }, [onPercentageChange]);

  // Sync visuals from props ONLY when not actively dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      applyVisuals(value);
    }
  }, [value, applyVisuals]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!trackRef.current) return;

    // Cache geometry ONCE at pointerdown - ZERO layout reflow during movement!
    const rect = trackRef.current.getBoundingClientRect();
    cachedRectRef.current = { left: rect.left, width: rect.width };

    isDraggingRef.current = true;
    setIsDragging(true);

    const width = cachedRectRef.current.width;
    const x = Math.max(0, Math.min(width, e.clientX - cachedRectRef.current.left));
    const initialVal = width > 0 ? x / width : 0;

    applyVisuals(initialVal);
    lastUpdateRef.current = performance.now();

    if (onDrag) {
      onDrag(initialVal);
    } else {
      onChange(initialVal);
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const { left, width } = cachedRectRef.current;
      if (width <= 0) return;

      const currentX = Math.max(0, Math.min(width, moveEvent.clientX - left));
      const newVal = currentX / width;

      // Pure direct DOM manipulation - tracks cursor at native 60/120/144 FPS
      applyVisuals(newVal);

      const now = performance.now();
      // Throttle audio engine / store calls to ~30 FPS to prevent audio thread glitches
      if (now - lastUpdateRef.current > 32) {
        lastUpdateRef.current = now;
        if (onDrag) {
          onDrag(newVal);
        } else {
          onChange(newVal);
        }
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      isDraggingRef.current = false;
      setIsDragging(false);

      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      const { left, width } = cachedRectRef.current;
      let finalVal = value;
      if (width > 0) {
        const currentX = Math.max(0, Math.min(width, upEvent.clientX - left));
        finalVal = currentX / width;
      }

      applyVisuals(finalVal);
      onChange(finalVal);
      if (onDragEnd) onDragEnd(finalVal);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.03 : -0.03;
    const nextVal = Math.max(0, Math.min(1, Math.round((value + delta) * 100) / 100));
    applyVisuals(nextVal);
    onChange(nextVal);
    if (onDragEnd) onDragEnd(nextVal);
  };

  const clampedVal = Math.max(0, Math.min(1, value));

  return (
    <div
      className={`relative w-full h-6 flex items-center cursor-pointer touch-none select-none group ${className}`}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampedVal * 100)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          const nextVal = Math.min(1, Math.round((value + 0.05) * 100) / 100);
          applyVisuals(nextVal);
          onChange(nextVal);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextVal = Math.max(0, Math.round((value - 0.05) * 100) / 100);
          applyVisuals(nextVal);
          onChange(nextVal);
        }
      }}
    >
      {/* Capsule track: 8px (h-2) comfortable height, adapts to light and dark mode */}
      <div
        ref={trackRef}
        className="relative w-full h-2 bg-black/15 dark:bg-white/20 group-hover:bg-black/20 dark:group-hover:bg-white/25 rounded-full overflow-hidden transition-colors"
      >
        {/* Fill portion: Spotify style - high contrast resting color, primary on hover/drag */}
        <div
          ref={fillRef}
          className={`absolute left-0 top-0 bottom-0 rounded-full transition-colors duration-150 pointer-events-none ${
            isDragging ? 'bg-primary' : 'bg-foreground/80 dark:bg-white/90 group-hover:bg-primary'
          }`}
          style={{ width: `${clampedVal * 100}%` }}
        />
      </div>

      {/* Thumb knob: Spotify style - hidden at rest (opacity-0), appears on hover or drag */}
      <div
        ref={thumbRef}
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.12)] pointer-events-none transition-opacity duration-150 ${
          isDragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100 group-hover:scale-100'
        }`}
        style={{ left: `${clampedVal * 100}%` }}
      />
    </div>
  );
}
