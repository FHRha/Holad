import React, { useRef, useEffect, useState } from 'react';
import { subscribeWindowVisibility, getIsWindowVisible } from '../../hooks/useWindowVisibility';

interface LiquidSeekBarProps {
  value: number; // 0 to 1
  buffered?: number; // 0 to 1 or 0 to 100
  onChange?: (value: number) => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (value: number) => void;
  className?: string;
  isAnimated?: boolean;
}

export interface LiquidSeekBarRef {
  setValue: (value: number) => void;
}

const LiquidSeekBar = React.forwardRef<LiquidSeekBarRef, LiquidSeekBarProps>(({ value, buffered = 0, onChange, onDrag, onDragEnd, className = '', isAnimated = false }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastUpdate = useRef(0);

  const normalizedBuffered = buffered > 1
    ? Math.max(0, Math.min(100, buffered)) / 100
    : Math.max(0, Math.min(1, buffered));

  React.useImperativeHandle(ref, () => ({
    setValue: (val: number) => {
      if (!isDragging) {
        updateThumbAndClip(val);
      }
    }
  }), [isDragging]);

  // Animation Refs
  const timeRef = useRef(0);
  const animationRef = useRef<number | undefined>(undefined);
  const amplitudeMultiplierRef = useRef(isAnimated ? 1 : 0);
  const prevValueRef = useRef(value);

  const isAnimatedRef = useRef(isAnimated);
  isAnimatedRef.current = isAnimated;
  const renderRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!isDragging) {
      // oxlint-disable-next-line
      updateThumbAndClip(value);
    }
  }, [value, isDragging]);

  const updateThumbAndClip = (val: number) => {
    const percent = Math.max(0, Math.min(val * 100, 100));
    
    if (thumbRef.current) {
      thumbRef.current.style.left = `${percent}%`;
    }
    if (canvasContainerRef.current) {
      // Using clip-path eliminates Layout Reflow of parent flex containers
      canvasContainerRef.current.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    }
    
    prevValueRef.current = val;
  };

  const lastValueRef = useRef<number>(0);

  const updateValue = (clientX: number, isEnd = false) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newValue = x / rect.width;
    
    lastValueRef.current = newValue;
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

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      
      const finalValue = lastValueRef.current;
      updateThumbAndClip(finalValue);
      
      if (onDragEnd && finalValue !== undefined) {
        onDragEnd(finalValue);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
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
    
    // Observer for theme class changes on the document
    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    
    return () => {
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
    let isWindowVisible = getIsWindowVisible();
    let isIntersecting = true;

    const drawFlatLine = () => {
      ctx.clearRect(0, 0, width, height);
      const rgb = colorRef.current.primaryRgb;
      ctx.fillStyle = `rgba(${rgb}, 0.8)`;
      ctx.fillRect(0, height / 2 - 2, width, 4);
    };

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
      
      const t = time * speed;
      // Breathing effect: modulating amplitude
      const currentAmp = baseAmp * (0.8 + 0.2 * Math.sin(t * 0.5));
      const effectiveAmp = currentAmp * amplitudeMultiplierRef.current;
      const baseTop = height / 2 - 2;
      const step = 8; // Step 8 for 2x performance gain while remaining visually smooth

      for (let x = 0; x <= width + step; x += step) {
        // xPhase gives chaotic horizontal stretching
        const phase = x * freq + Math.sin(x * warpFreq + t) * warpAmp + offsetPhase - t;
        const waveHeight = (Math.sin(phase) + 1) * 0.5;
        
        // Fast fade-in for first 40 pixels, 1.0 thereafter
        const fadeIn = x < 40 ? (1 - Math.cos((x / 40) * Math.PI)) * 0.5 : 1;
        const y = baseTop - (waveHeight * effectiveAmp * fadeIn);
        
        ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const render = () => {
      // If window is minimized/hidden or seekbar is offscreen, stop rAF and draw static line
      if (!isWindowVisible || !isIntersecting) {
        drawFlatLine();
        animationRef.current = undefined;
        return;
      }

      if (!isAnimatedRef.current && amplitudeMultiplierRef.current < 0.001) {
        amplitudeMultiplierRef.current = 0;
        drawFlatLine();
        animationRef.current = undefined;
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smoothly transition amplitude based on isAnimated
      const targetAmp = isAnimatedRef.current ? 1 : 0.0;
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

    renderRef.current = render;

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1; 
      width = rect.width;
      height = rect.height;
      
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
      ctx.scale(dpr, dpr);

      // On resize: cancel any pending rAF and re-render
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      render();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // IntersectionObserver to pause when seekbar is scrolled off screen
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      isIntersecting = entry ? entry.isIntersecting : true;
      if (!isIntersecting) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
        drawFlatLine();
      } else if (isAnimatedRef.current && isWindowVisible) {
        if (!animationRef.current && renderRef.current) {
          renderRef.current();
        }
      }
    }, { threshold: 0.05 });

    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    // Window visibility subscriber (Tauri minimize / restore and web visibility)
    const unsubVisibility = subscribeWindowVisibility((visible) => {
      isWindowVisible = visible;
      if (!visible) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
        drawFlatLine();
      } else if (isAnimatedRef.current && isIntersecting) {
        if (!animationRef.current && renderRef.current) {
          renderRef.current();
        }
      }
    });

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
      renderRef.current = undefined;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      unsubVisibility();
    };
  }, []);

  // Trigger render when isAnimated becomes true
  useEffect(() => {
    if (isAnimated) {
      if (!animationRef.current && renderRef.current) {
        renderRef.current();
      }
    }
  }, [isAnimated]);

  return (
    <div 
      className={`w-full h-8 flex items-center cursor-pointer group relative touch-none ${className}`}
      onPointerDown={handlePointerDown}
      ref={containerRef}
      style={{ transform: 'translateZ(0)' }}
    >
      {/* Background track (thin line) */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full" />
      
      {/* Buffered track (gray bar representing loaded audio) */}
      {normalizedBuffered > 0 && (
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white/40 rounded-full pointer-events-none transition-all duration-300"
          style={{ width: `${normalizedBuffered * 100}%` }}
        />
      )}
      
      {/* Canvas container with overflow hidden, GPU compositor isolation and zero layout reflow */}
      <div 
        ref={canvasContainerRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ clipPath: 'inset(0 100% 0 0)', transform: 'translateZ(0)', willChange: 'clip-path' }}
      >
        <canvas 
          ref={canvasRef}
          className="absolute left-0 top-0 h-full"
          style={{ transform: 'translateZ(0)' }}
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
});

export default LiquidSeekBar;
