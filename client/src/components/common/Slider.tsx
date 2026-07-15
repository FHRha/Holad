import React, { useRef, useEffect, useState } from 'react';

interface SliderProps {
  value: number; // 0 to 1
  onChange?: (value: number) => void; // Optional for state updates
  onDrag?: (value: number) => void; // Fired on every pixel move without React state lag
  onDragEnd?: (value: number) => void;
  className?: string;
  isAnimated?: boolean;
  thickness?: 'normal' | 'thick';
}

export default function Slider({ value, onChange, onDrag, onDragEnd, className = '', isAnimated = false, thickness = 'normal' }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Throttle onChange to avoid React state clogging the main thread
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!isDragging) {
      if (fillRef.current) fillRef.current.style.width = `${value * 100}%`;
      if (thumbRef.current) thumbRef.current.style.left = `${value * 100}%`;
    }
  }, [value, isDragging]);

  const updateValue = (clientX: number, isEnd = false) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newValue = x / rect.width;
    
    // Direct DOM update for 120fps smoothness!
    if (fillRef.current) fillRef.current.style.width = `${newValue * 100}%`;
    if (thumbRef.current) thumbRef.current.style.left = `${newValue * 100}%`;
    
    if (onDrag) onDrag(newValue);
    
    const now = performance.now();
    if (isEnd || now - lastUpdate.current > 60) { // Limit react state updates to ~15fps during drag
      if (onChange) onChange(newValue);
      lastUpdate.current = now;
    }
    
    return newValue;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX);
    
    const handlePointerMove = (e: PointerEvent) => {
      updateValue(e.clientX);
    };

    const handlePointerUp = (e: PointerEvent) => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      
      const finalValue = updateValue(e.clientX, true);
      if (onDragEnd && finalValue !== undefined) {
        onDragEnd(finalValue);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div 
      className={`w-full h-5 flex items-center cursor-pointer group relative touch-none ${className}`}
      onPointerDown={handlePointerDown}
      ref={trackRef}
    >
      <div className={`relative w-full rounded-full overflow-hidden bg-white/20 transition-all ${thickness === 'thick' ? 'h-2 group-hover:h-2.5' : 'h-1 group-hover:h-1.5'}`}>
        <div 
          ref={fillRef}
          className={`absolute left-0 top-0 bottom-0 ${
            isAnimated 
              ? 'bg-gradient-to-r from-primary via-[#6ee7b7] to-primary animate-volumetric' 
              : 'bg-foreground group-hover:bg-primary transition-colors duration-200'
          }`}
          style={{ width: '0%' }}
        />
      </div>

      <div 
        ref={thumbRef}
        className="absolute top-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ left: '0%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}
