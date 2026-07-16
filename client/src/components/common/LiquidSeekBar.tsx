import React, { useRef, useEffect, useState } from 'react';

interface LiquidSeekBarProps {
  value: number; // 0 to 1
  onChange?: (value: number) => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (value: number) => void;
  className?: string;
  isAnimated?: boolean;
}

export default function LiquidSeekBar({ value, onChange, onDrag, onDragEnd, className = '', isAnimated = false }: LiquidSeekBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastUpdate = useRef(0);

  // Animation Refs
  const timeRef = useRef(0);
  const animationRef = useRef<number>();
  const amplitudeMultiplierRef = useRef(isAnimated ? 1 : 0);

  useEffect(() => {
    if (!isDragging) {
      updateThumbAndClip(value);
    }
  }, [value, isDragging]);

  const updateThumbAndClip = (val: number) => {
    const percent = Math.max(0, Math.min(val * 100, 100));
    if (thumbRef.current) thumbRef.current.style.left = `${percent}%`;
    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.clipPath = `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)`;
    }
  };

  const updateValue = (clientX: number, isEnd = false) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newValue = x / rect.width;
    
    updateThumbAndClip(newValue);
    
    if (onDrag) onDrag(newValue);
    
    const now = performance.now();
    if (isEnd || now - lastUpdate.current > 60) {
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

  // Dynamic Color Tracking
  const colorRef = useRef({ primaryRgb: '255, 255, 255' });
  
  useEffect(() => {
    const updateColor = () => {
      if (containerRef.current) {
        const rgb = getComputedStyle(containerRef.current).getPropertyValue('--color-primary-rgb').trim();
        if (rgb) colorRef.current.primaryRgb = rgb;
      }
    };
    updateColor();
    
    // Fallback interval for color changes
    const interval = setInterval(updateColor, 1000);
    
    // Observer for theme class changes on the document
    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    
    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  // Canvas animation logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const rect = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        width = rect.width;
        height = rect.height;
        
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const drawWave = (
      time: number,
      offsetPhase: number,
      color: string,
      speed: number,
      baseAmp: number,
      freq: number,
      warpFreq: number,
      warpAmp: number
    ) => {
      ctx.beginPath();
      // Wave bottom right (track bottom edge is height/2 + 2)
      ctx.moveTo(width, height / 2 + 2);
      // Wave bottom left
      ctx.lineTo(0, height / 2 + 2);
      
      // Breathing effect: modulating amplitude
      const currentAmp = baseAmp * (0.8 + 0.2 * Math.sin(time * speed * 0.5));
      
      const step = Math.max(1, width / 200);

      for (let x = 0; x <= width + step; x += step) {
        const t = time * speed;
        // xPhase gives chaotic horizontal stretching
        const phase = x * freq + Math.sin(x * warpFreq + t) * warpAmp + offsetPhase - t;
        
        // waveHeight is 0 to 1
        const waveHeight = (Math.sin(phase) + 1) / 2;
        
        // baseTop is the top edge of the track
        const baseTop = height / 2 - 2;
        
        // Fade in amplitude over the first 40 pixels with a sinusoidal curve
        const fadeProgress = Math.min(x / 40, 1);
        // Sinusoidal ease-in-out: always 0 on the very left, smoothly connects to 1
        const fadeIn = (1 - Math.cos(fadeProgress * Math.PI)) / 2;
        
        // Add wave amplitude upwards
        const y = baseTop - (waveHeight * currentAmp * amplitudeMultiplierRef.current * fadeIn);
        
        ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      
      ctx.fillStyle = color;
      ctx.fill();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Smoothly transition amplitude based on isAnimated
      const targetAmp = isAnimated ? 1 : 0.0;
      amplitudeMultiplierRef.current += (targetAmp - amplitudeMultiplierRef.current) * 0.08;
      
      timeRef.current += 0.016; 
      const t = timeRef.current;

      const rgb = colorRef.current.primaryRgb;

      // Back wave (amplitude increased by 5%)
      drawWave(t, 0, `rgba(${rgb}, 0.35)`, 1.2, height * 0.30, 0.015, 0.01, 1.2);
      
      // Front wave (amplitude increased by 5%)
      drawWave(t, Math.PI, `rgba(${rgb}, 0.8)`, 1.8, height * 0.40, 0.02, 0.015, 0.8);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
    };
  }, [isAnimated]);

  return (
    <div 
      className={`w-full h-8 flex items-center cursor-pointer group relative touch-none ${className}`}
      onPointerDown={handlePointerDown}
      ref={containerRef}
    >
      {/* Background track (thin line) */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full" />
      
      {/* Canvas container with clip-path */}
      <div 
        ref={canvasContainerRef}
        className="absolute left-0 top-0 bottom-0 pointer-events-none transition-[clip-path] duration-0"
        style={{ 
          width: '100%',
          clipPath: 'polygon(0 0, 0% 0, 0% 100%, 0 100%)' 
        }}
      >
        <canvas 
          ref={canvasRef}
          className="w-full h-full"
        />
      </div>

      {/* Thumb */}
      <div 
        ref={thumbRef}
        className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
        style={{ left: '0%', transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}
