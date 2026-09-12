import React, { useRef, useEffect, useState, useMemo } from 'react';
import { subscribeWindowVisibility, getIsWindowVisible } from '../../hooks/useWindowVisibility';

export interface WaveLayerConfig {
  offsetPhase?: number; // Phase offset in radians (e.g. 0, Math.PI, etc.)
  opacity?: number; // Opacity when using primary theme RGB (0..1)
  color?: string; // Custom color override (hex, rgb, rgba)
  speed?: number; // Speed multiplier for this layer
  amplitudeMultiplier?: number; // Amplitude multiplier relative to bar height
  freq?: number; // Wave frequency
  warpFreq?: number; // Warp turbulence frequency
  warpAmp?: number; // Warp turbulence amplitude
  roundness?: number; // Organic crest roundness exponent
}

export interface LiquidSeekBarProps {
  value: number; // 0 to 1
  buffered?: number; // 0 to 1 or 0 to 100
  onChange?: (value: number) => void;
  onDrag?: (value: number) => void;
  onDragEnd?: (value: number) => void;
  className?: string;
  isAnimated?: boolean;
  color?: string; // Direct color (hex #6366f1, rgb(...), rgba(...), or 'r, g, b')
  waveCount?: 1 | 2 | 3 | 4; // Quick selection of 1, 2, 3, or 4 wave layers (default: 3)
  layers?: WaveLayerConfig[]; // Detailed configuration per layer
  waveSpeed?: number; // Global speed multiplier (default: 1.5)
  waveAmplitude?: number; // Global amplitude multiplier (default: 1.0)
  waveFrequency?: number; // Global frequency multiplier (default: 1.0)
  roundness?: number; // Global wave crest roundness (default: 1.35)
  swellDistance?: number; // Progressive distance in px over which the wave gains full height (default: 100)
}

export interface LiquidSeekBarRef {
  setValue: (value: number) => void;
}

/**
 * Parses any color format (hex, rgb, rgba, or "r, g, b") into an { r, g, b } object.
 */
export function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!color) return null;
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) {
    let hex = trimmed.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length >= 6) {
      const num = parseInt(hex.slice(0, 6), 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    }
  }
  const rgbMatch = trimmed.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
    };
  }
  const rawMatch = trimmed.match(/^(\d+)[,\s]+(\d+)[,\s]+(\d+)$/);
  if (rawMatch) {
    return {
      r: parseInt(rawMatch[1], 10),
      g: parseInt(rawMatch[2], 10),
      b: parseInt(rawMatch[3], 10),
    };
  }
  return null;
}

export function getDefaultLayers(count: number = 3): WaveLayerConfig[] {
  switch (count) {
    case 1:
      return [
        { offsetPhase: 0, opacity: 0.85, speed: 0.60, amplitudeMultiplier: 0.40, freq: 0.026, warpFreq: 0.014, warpAmp: 0.8 },
      ];
    case 2:
      return [
        { offsetPhase: 0, opacity: 0.35, speed: 0.50, amplitudeMultiplier: 0.36, freq: 0.022, warpFreq: 0.012, warpAmp: 1.0 },
        { offsetPhase: Math.PI * 0.90, opacity: 0.80, speed: 0.65, amplitudeMultiplier: 0.40, freq: 0.028, warpFreq: 0.016, warpAmp: 0.8 },
      ];
    case 4:
      return [
        { offsetPhase: 0, opacity: 0.22, speed: 0.40, amplitudeMultiplier: 0.28, freq: 0.018, warpFreq: 0.009, warpAmp: 1.0 },
        { offsetPhase: Math.PI * 0.45, opacity: 0.42, speed: 0.50, amplitudeMultiplier: 0.32, freq: 0.023, warpFreq: 0.012, warpAmp: 0.9 },
        { offsetPhase: Math.PI * 0.90, opacity: 0.65, speed: 0.62, amplitudeMultiplier: 0.38, freq: 0.028, warpFreq: 0.015, warpAmp: 0.8 },
        { offsetPhase: Math.PI * 1.35, opacity: 0.88, speed: 0.72, amplitudeMultiplier: 0.42, freq: 0.032, warpFreq: 0.018, warpAmp: 0.7 },
      ];
    case 3:
    default:
      return [
        { offsetPhase: 0, opacity: 0.30, speed: 0.45, amplitudeMultiplier: 0.32, freq: 0.020, warpFreq: 0.010, warpAmp: 1.0 },
        { offsetPhase: Math.PI * 0.55, opacity: 0.55, speed: 0.58, amplitudeMultiplier: 0.36, freq: 0.025, warpFreq: 0.013, warpAmp: 0.9 },
        { offsetPhase: Math.PI * 0.95, opacity: 0.85, speed: 0.68, amplitudeMultiplier: 0.42, freq: 0.030, warpFreq: 0.016, warpAmp: 0.8 },
      ];
  }
}

// Pre-allocated typed arrays to prevent garbage collection pauses during 60/120fps animation
const MAX_WAVE_POINTS = 1024;
const pointsX = new Float32Array(MAX_WAVE_POINTS);
const pointsY = new Float32Array(MAX_WAVE_POINTS);

const LiquidSeekBar = React.forwardRef<LiquidSeekBarRef, LiquidSeekBarProps>(({
  value,
  buffered = 0,
  onChange,
  onDrag,
  onDragEnd,
  className = '',
  isAnimated = false,
  color,
  waveCount = 3,
  layers,
  waveSpeed = 1.5,
  waveAmplitude = 1.0,
  waveFrequency = 1.0,
  roundness = 1.35,
  swellDistance = 100,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastUpdate = useRef(0);

  const normalizedBuffered = typeof buffered === 'number' && isFinite(buffered)
    ? (buffered > 1 ? Math.max(0, Math.min(100, buffered)) / 100 : Math.max(0, Math.min(1, buffered)))
    : 0;

  const safeValue = typeof value === 'number' && isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

  const currentValueRef = useRef(safeValue);
  currentValueRef.current = safeValue;

  // Imperative handle
  React.useImperativeHandle(ref, () => ({
    setValue: (val: number) => {
      if (!isDragging) {
        updateThumbAndProgress(val);
      }
    }
  }), [isDragging]);

  // Animation Refs
  const timeRef = useRef(0);
  const animationRef = useRef<number | undefined>(undefined);
  const amplitudeMultiplierRef = useRef(isAnimated ? 1 : 0);
  const isAnimatedRef = useRef(isAnimated);
  isAnimatedRef.current = isAnimated;
  const lastTimeRef = useRef(performance.now());
  const renderRef = useRef<(() => void) | undefined>(undefined);

  const updateThumbAndProgress = (val: number) => {
    const clamped = typeof val === 'number' && isFinite(val) ? Math.max(0, Math.min(val, 1)) : 0;
    currentValueRef.current = clamped;
    const percent = clamped * 100;

    if (thumbRef.current) {
      thumbRef.current.style.left = `${percent}%`;
    }

    // Trigger redraw or restart animation loop if not currently animating
    if (!animationRef.current && renderRef.current) {
      lastTimeRef.current = performance.now();
      renderRef.current();
    }
  };

  useEffect(() => {
    if (!isDragging) {
      updateThumbAndProgress(safeValue);
    }
  }, [safeValue, isDragging]);

  const lastValueRef = useRef<number>(safeValue);

  const updateValue = (clientX: number, isEnd = false) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const newValue = Math.max(0, Math.min(1, x / rect.width));

    lastValueRef.current = newValue;
    updateThumbAndProgress(newValue);

    if (onDrag) onDrag(newValue);

    const now = performance.now();
    if (isEnd || now - lastUpdate.current > 50) {
      if (onChange) onChange(newValue);
      lastUpdate.current = now;
    }

    return newValue;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientX);

    const handlePointerMove = (ev: PointerEvent) => {
      updateValue(ev.clientX);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      const finalValue = lastValueRef.current;
      updateThumbAndProgress(finalValue);

      if (onDragEnd && finalValue !== undefined) {
        onDragEnd(finalValue);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Color Resolution: supports prop `color` (hex, rgb, etc.) or CSS variable `--color-primary-rgb`, falling back to 255, 255, 255
  const defaultRgb = { r: 255, g: 255, b: 255 };
  const colorRef = useRef(color ? (parseColorToRgb(color) || defaultRgb) : defaultRgb);

  useEffect(() => {
    const updateColor = () => {
      if (color) {
        const parsed = parseColorToRgb(color);
        if (parsed) {
          colorRef.current = parsed;
          if (!isAnimatedRef.current && !animationRef.current && renderRef.current) renderRef.current();
          return;
        }
      }
      if (containerRef.current) {
        const rgbStr = getComputedStyle(containerRef.current).getPropertyValue('--color-primary-rgb').trim();
        const parsed = parseColorToRgb(rgbStr);
        if (parsed) {
          colorRef.current = parsed;
          if (!isAnimatedRef.current && !animationRef.current && renderRef.current) renderRef.current();
          return;
        }
      }
      colorRef.current = defaultRgb;
    };

    updateColor();

    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

    return () => {
      observer.disconnect();
    };
  }, [color]);

  // Active layers memoized so identity is stable across renders
  const activeLayers = useMemo(() => {
    return layers && layers.length > 0 ? layers : getDefaultLayers(waveCount);
  }, [layers, waveCount]);

  // Canvas animation logic
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let isWindowVisible = getIsWindowVisible() && !document.hidden;
    let isIntersecting = true;

    const setupDimensions = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      width = w;
      height = h;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    // Synchronously initialize dimensions on mount if container already has layout
    if (containerRef.current) {
      const initialRect = containerRef.current.getBoundingClientRect();
      if (initialRect.width > 0 && initialRect.height > 0) {
        setupDimensions(initialRect.width, initialRect.height);
      }
    }

    const drawFlatLine = (activeWidth: number) => {
      if (!ctx || width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);
      if (activeWidth <= 0) return;

      const { r, g, b } = colorRef.current;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;

      const baseTop = height / 2 - 2;
      const trackThickness = 4;
      const radius = trackThickness / 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, baseTop, activeWidth, trackThickness, [radius, 0, 0, radius]);
      } else {
        ctx.rect(0, baseTop, activeWidth, trackThickness);
      }
      ctx.fill();
    };

    const drawWave = (
      time: number,
      offsetPhase: number,
      colorString: string,
      layerSpeed: number,
      baseAmp: number,
      freq: number,
      warpFreq: number,
      warpAmp: number,
      layerRoundness: number,
      activeWidth: number
    ) => {
      if (activeWidth <= 0) return;

      const baseTop = height / 2 - 2;
      const baseBottom = height / 2 + 2;

      ctx.beginPath();
      // Track bottom line: from activeWidth to left (0)
      ctx.moveTo(activeWidth, baseBottom);
      ctx.lineTo(2, baseBottom);

      // Rounded left pill cap
      ctx.arc(2, height / 2, 2, Math.PI * 0.5, Math.PI * 1.5);

      const t = time * layerSpeed * waveSpeed;
      // Breathing modulation
      const currentAmp = baseAmp * (0.85 + 0.15 * Math.sin(t * 0.5)) * waveAmplitude;
      const effectiveAmp = currentAmp * amplitudeMultiplierRef.current;

      // Progressive swell build-up distance from left (e.g. 80-100px)
      // Caps at 65% of activeWidth so shorter bars still reach full height nicely
      const effectiveSwellDist = Math.min(swellDistance, activeWidth * 0.65);

      // Right exit taper distance: smooth descent into 0 at activeWidth
      const taperExitDist = Math.min(36, activeWidth * 0.35);
      const effectiveFreq = freq * waveFrequency;

      // When activeWidth is narrow (e.g. < 80px), smoothly dampen peak amplitude
      const widthDamp = Math.min(1.0, Math.max(0.35, activeWidth / 80));

      const step = 6; // Optimized sampling for high performance with Bezier splines
      let pointCount = 0;

      for (let x = 0; x <= activeWidth; x += step) {
        if (pointCount >= MAX_WAVE_POINTS - 2) break;

        // 1. Progressive left swell: only compute smoothstep when within swell distance
        let leftEnv = 1;
        if (effectiveSwellDist > 0 && x < effectiveSwellDist) {
          const leftRatio = x / effectiveSwellDist;
          leftEnv = leftRatio * leftRatio * (3 - 2 * leftRatio);
        }

        // 2. Right exit taper: only compute cosine when within taper exit distance
        let rightEnv = 1;
        const rightDist = activeWidth - x;
        if (taperExitDist > 0 && rightDist < taperExitDist) {
          const rightRatio = rightDist / taperExitDist;
          rightEnv = 0.5 * (1 - Math.cos(rightRatio * Math.PI));
        }

        const envelope = leftEnv * rightEnv * widthDamp;

        // Edge damp for turbulence
        const minEdgeDist = Math.min(x, rightDist);
        const edgeDamp = minEdgeDist < 24 ? minEdgeDist / 24 : 1;
        const warp = Math.sin(x * warpFreq + t) * warpAmp * edgeDamp;

        const phase = x * effectiveFreq + warp + offsetPhase - t;
        const rawSine = Math.sin(phase);

        // Trochoidal + exponential rounding: eliminates flat plateaus at top crests
        const roundedSine = (rawSine + 0.18 * Math.sin(2 * phase - Math.PI * 0.5) + 1) / 2.18;
        const clampedSine = Math.max(0, Math.min(1, roundedSine));
        const waveHeight = layerRoundness === 1 ? clampedSine : Math.pow(clampedSine, layerRoundness);

        // At x=0 and x=activeWidth, envelope is 0, so y is exactly baseTop
        const y = baseTop - (waveHeight * effectiveAmp * envelope);

        pointsX[pointCount] = x;
        pointsY[pointCount] = y;
        pointCount++;
      }

      if (pointCount > 0 && pointsX[pointCount - 1] < activeWidth && pointCount < MAX_WAVE_POINTS) {
        pointsX[pointCount] = activeWidth;
        pointsY[pointCount] = baseTop;
        pointCount++;
      }

      // Draw smooth curve using quadratic Bezier splines
      if (pointCount > 0) {
        ctx.lineTo(pointsX[0], pointsY[0]);
        for (let i = 0; i < pointCount - 1; i++) {
          const p0x = pointsX[i];
          const p0y = pointsY[i];
          const p1x = pointsX[i + 1];
          const p1y = pointsY[i + 1];
          const midX = (p0x + p1x) * 0.5;
          const midY = (p0y + p1y) * 0.5;
          ctx.quadraticCurveTo(p0x, p0y, midX, midY);
        }
        ctx.lineTo(pointsX[pointCount - 1], pointsY[pointCount - 1]);
      }

      // Close polygon to the bottom line at activeWidth
      ctx.lineTo(activeWidth, baseBottom);
      ctx.closePath();
      ctx.fillStyle = colorString;
      ctx.fill();
    };

    const render = () => {
      // Clear RAF handle
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }

      // If dimensions are not yet set, measure synchronously
      if ((width <= 0 || height <= 0) && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setupDimensions(r.width, r.height);
        }
      }

      const activeWidth = width * Math.max(0, Math.min(1, currentValueRef.current));

      // STRICT VISIBILITY GUARD:
      // If window is minimized, hidden, or seekbar is offscreen,
      // stop immediately and do not calculate any wave math or schedule RAF.
      if (!isWindowVisible || document.hidden || !isIntersecting) {
        drawFlatLine(activeWidth);
        return;
      }

      // If animation is disabled and amplitude has decayed to 0, stop loop
      if (!isAnimatedRef.current && amplitudeMultiplierRef.current < 0.001) {
        amplitudeMultiplierRef.current = 0;
        drawFlatLine(activeWidth);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Smooth amplitude transition
      const targetAmp = isAnimatedRef.current ? 1.0 : 0.0;
      amplitudeMultiplierRef.current += (targetAmp - amplitudeMultiplierRef.current) * 0.08;

      // Time-delta calculation ensures constant speed independent of framerate or loops
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      timeRef.current += dt;
      const t = timeRef.current;

      const { r, g, b } = colorRef.current;

      // Draw all configured layers from back to front
      activeLayers.forEach((layer) => {
        const layerColor = layer.color || `rgba(${r}, ${g}, ${b}, ${layer.opacity ?? 0.8})`;
        const layerAmp = height * (layer.amplitudeMultiplier ?? 0.35);
        drawWave(
          t,
          layer.offsetPhase ?? 0,
          layerColor,
          layer.speed ?? 0.5,
          layerAmp,
          layer.freq ?? 0.022,
          layer.warpFreq ?? 0.012,
          layer.warpAmp ?? 0.8,
          layer.roundness ?? roundness,
          activeWidth
        );
      });

      if (isAnimatedRef.current || amplitudeMultiplierRef.current > 0.001) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    renderRef.current = render;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!containerRef.current) return;
      const entry = entries[0];
      const w = entry ? entry.contentRect.width : containerRef.current.getBoundingClientRect().width;
      const h = entry ? entry.contentRect.height : containerRef.current.getBoundingClientRect().height;
      setupDimensions(w, h);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      render();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      isIntersecting = entry ? entry.isIntersecting : true;
      const activeWidth = width * Math.max(0, Math.min(1, currentValueRef.current));
      if (!isIntersecting) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
        drawFlatLine(activeWidth);
      } else if (isAnimatedRef.current && isWindowVisible && !document.hidden) {
        if (!animationRef.current && renderRef.current) {
          lastTimeRef.current = performance.now();
          renderRef.current();
        }
      }
    }, { threshold: 0.05 });

    if (containerRef.current) {
      intersectionObserver.observe(containerRef.current);
    }

    const unsubVisibility = subscribeWindowVisibility((visible) => {
      isWindowVisible = visible && !document.hidden;
      const activeWidth = width * Math.max(0, Math.min(1, currentValueRef.current));
      if (!isWindowVisible) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
        drawFlatLine(activeWidth);
      } else if (isAnimatedRef.current && isIntersecting) {
        if (!animationRef.current && renderRef.current) {
          lastTimeRef.current = performance.now();
          renderRef.current();
        }
      }
    });

    // Trigger initial render immediately
    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      renderRef.current = undefined;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      unsubVisibility();
    };
  }, [activeLayers, waveSpeed, waveAmplitude, waveFrequency, color, roundness, swellDistance]);

  // Trigger render when isAnimated becomes true
  useEffect(() => {
    if (isAnimated) {
      if (!animationRef.current && renderRef.current) {
        lastTimeRef.current = performance.now();
        renderRef.current();
      }
    }
  }, [isAnimated]);

  return (
    <div
      className={`w-full h-8 flex items-center cursor-pointer group relative touch-none select-none ${className}`}
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

      {/* Canvas container: wave renders strictly from 0 to activeWidth with zero clipping artifacts */}
      <div
        ref={canvasContainerRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ transform: 'translateZ(0)' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute left-0 top-0 h-full"
          style={{ transform: 'translateZ(0)' }}
        />
      </div>

      {/* Thumb knob */}
      <div
        ref={thumbRef}
        className="absolute top-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_4px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10"
        style={{ left: `${safeValue * 100}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
});

LiquidSeekBar.displayName = 'LiquidSeekBar';

export default LiquidSeekBar;
