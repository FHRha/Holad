import React, { useRef, useEffect, useState } from 'react';

interface SliderProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  onDragEnd?: (value: number) => void;
  className?: string;
  isAnimated?: boolean;
  thickness?: 'normal' | 'thick';
}

export default function Slider({ value, onChange, onDragEnd, className = '', isAnimated = false, thickness = 'normal' }: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value);
    }
  }, [value, isDragging]);

  const updateValue = (clientX: number) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newValue = x / rect.width;
    setLocalValue(newValue);
    onChange(newValue);
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
      if (onDragEnd && trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        onDragEnd(x / rect.width);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div 
      className={`w-full py-2 flex items-center cursor-pointer group relative touch-none ${className}`}
      onPointerDown={handlePointerDown}
      ref={trackRef}
    >
      {/* Track Background & Mask */}
      <div className={`relative w-full rounded-full overflow-hidden bg-white/20 transition-all ${thickness === 'thick' ? 'h-2 group-hover:h-2.5' : 'h-1 group-hover:h-1.5'}`}>
        
        {/* Filled part */}
        <div 
          className={`absolute left-0 top-0 bottom-0 ${
            isAnimated 
              ? 'bg-gradient-to-r from-primary via-[#6ee7b7] to-primary animate-volumetric' 
              : 'bg-foreground group-hover:bg-primary transition-colors duration-200'
          }`}
          style={{ width: `${localValue * 100}%` }}
        />
      </div>

      {/* Thumb circle */}
      <div 
        className="absolute top-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ left: `${localValue * 100}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}
