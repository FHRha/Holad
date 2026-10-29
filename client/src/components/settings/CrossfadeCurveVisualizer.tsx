import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/settingsStore';
import {
  CROSSFADE_PRESETS,
  calculateCrossfadeGains,
  gainToDb,
} from '../../audio/crossfade';

const SVG_WIDTH = 500;
const SVG_HEIGHT = 200;
const PAD_LEFT = 44;
const PAD_RIGHT = 18;
const PAD_TOP = 18;
const PAD_BOTTOM = 28;

const GRAPH_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT; // 438
const GRAPH_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM; // 154

export default function CrossfadeCurveVisualizer() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const tension = useMemo(() => {
    return settings.crossfadeTension || { x: 0.5, y: 0.707 };
  }, [settings.crossfadeTension]);

  const duration = settings.crossfadeDuration || 3;

  const updateTensionFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;

      const svgX = px * SVG_WIDTH;
      const svgY = py * SVG_HEIGHT;

      const normX = (svgX - PAD_LEFT) / GRAPH_WIDTH;
      const normY = 1.0 - (svgY - PAD_TOP) / GRAPH_HEIGHT;

      const clampedX = Math.max(0.25, Math.min(0.75, normX));
      const clampedY = Math.max(0.05, Math.min(0.95, normY));

      settings.setCrossfadeTension({
        x: Number(clampedX.toFixed(3)),
        y: Number(clampedY.toFixed(3)),
      });
    },
    [settings]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement | SVGCircleElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      updateTensionFromPointer(e.clientX, e.clientY);
    },
    [updateTensionFromPointer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement | SVGCircleElement>) => {
      if (!isDragging) return;
      updateTensionFromPointer(e.clientX, e.clientY);
    },
    [isDragging, updateTensionFromPointer]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement | SVGCircleElement>) => {
      if (isDragging) {
        setIsDragging(false);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    },
    [isDragging]
  );

  // Compute curve paths
  const { outPath, inPath, outArea, inArea } = useMemo(() => {
    const steps = 40;
    const outCoords: [number, number][] = [];
    const inCoords: [number, number][] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const gains = calculateCrossfadeGains(t, settings.crossfadeCurve, tension);
      const x = PAD_LEFT + t * GRAPH_WIDTH;
      const yOut = PAD_TOP + (1.0 - gains.outGain) * GRAPH_HEIGHT;
      const yIn = PAD_TOP + (1.0 - gains.inGain) * GRAPH_HEIGHT;
      outCoords.push([x, yOut]);
      inCoords.push([x, yIn]);
    }

    const outP = outCoords
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');
    const inP = inCoords
      .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' ');

    const groundY = (PAD_TOP + GRAPH_HEIGHT).toFixed(1);
    const startX = PAD_LEFT.toFixed(1);
    const endX = (PAD_LEFT + GRAPH_WIDTH).toFixed(1);

    const outA = `${outP} L ${endX} ${groundY} L ${startX} ${groundY} Z`;
    const inA = `${inP} L ${endX} ${groundY} L ${startX} ${groundY} Z`;

    return { outPath: outP, inPath: inP, outArea: outA, inArea: inA };
  }, [settings.crossfadeCurve, tension]);

  // Coordinates of the tension handle
  const handleX = PAD_LEFT + tension.x * GRAPH_WIDTH;
  const handleY = PAD_TOP + (1.0 - tension.y) * GRAPH_HEIGHT;

  // Grid line Y coordinates
  const y0db = PAD_TOP;
  const yMinus3db = PAD_TOP + (1.0 - 0.707) * GRAPH_HEIGHT;
  const yMinus6db = PAD_TOP + 0.5 * GRAPH_HEIGHT;
  const y0pct = PAD_TOP + GRAPH_HEIGHT;
  const xMid = PAD_LEFT + 0.5 * GRAPH_WIDTH;

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-white/5 select-none">
      {/* Presets Bar */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-secondary font-medium">
          {t('settings.crossfade_curve') || 'Кривая кроссфейда'}
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CROSSFADE_PRESETS.map((preset) => {
            const isActive = settings.crossfadeCurve === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  if (preset.id === 'custom') {
                    settings.setCrossfadeCurve('custom');
                  } else {
                    settings.setCrossfadeCurve(preset.id);
                  }
                }}
                className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border transition-all text-center ${
                  isActive
                    ? 'border-primary text-primary bg-primary/10 shadow-sm font-semibold'
                    : 'border-border text-secondary hover:text-foreground bg-foreground/[0.03]'
                }`}
              >
                {t(preset.nameKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2D Interactive SVG Visualizer */}
      <div className="relative w-full rounded-2xl bg-foreground/[0.02] border border-border p-2 sm:p-3 overflow-hidden shadow-inner">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className={`w-full h-auto max-h-[220px] aspect-[2.5/1] overflow-visible touch-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            <linearGradient id="cf-outgoing-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="cf-incoming-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary, #10b981)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--color-primary, #10b981)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {/* Horizontal: 0 dB */}
          <line
            x1={PAD_LEFT}
            y1={y0db}
            x2={PAD_LEFT + GRAPH_WIDTH}
            y2={y0db}
            stroke="currentColor"
            className="text-foreground/15"
            strokeDasharray="2 3"
          />
          {/* Horizontal: -3 dB (Equal Power) */}
          <line
            x1={PAD_LEFT}
            y1={yMinus3db}
            x2={PAD_LEFT + GRAPH_WIDTH}
            y2={yMinus3db}
            stroke="currentColor"
            className="text-primary/30"
            strokeDasharray="3 3"
          />
          {/* Horizontal: -6 dB (50%) */}
          <line
            x1={PAD_LEFT}
            y1={yMinus6db}
            x2={PAD_LEFT + GRAPH_WIDTH}
            y2={yMinus6db}
            stroke="currentColor"
            className="text-foreground/15"
            strokeDasharray="2 3"
          />
          {/* Horizontal: 0% / Bottom */}
          <line
            x1={PAD_LEFT}
            y1={y0pct}
            x2={PAD_LEFT + GRAPH_WIDTH}
            y2={y0pct}
            stroke="currentColor"
            className="text-foreground/20"
          />

          {/* Vertical: Midpoint (50%) */}
          <line
            x1={xMid}
            y1={PAD_TOP}
            x2={xMid}
            y2={PAD_TOP + GRAPH_HEIGHT}
            stroke="currentColor"
            className="text-foreground/15"
            strokeDasharray="2 3"
          />

          {/* Y Axis Grid Labels */}
          <text
            x={PAD_LEFT - 4}
            y={y0db + 3}
            textAnchor="end"
            className="fill-secondary text-[9px] font-mono select-none"
          >
            0 dB
          </text>
          <text
            x={PAD_LEFT - 4}
            y={yMinus3db + 3}
            textAnchor="end"
            className="fill-primary/70 text-[9px] font-mono select-none"
          >
            -3 dB
          </text>
          <text
            x={PAD_LEFT - 4}
            y={yMinus6db + 3}
            textAnchor="end"
            className="fill-secondary text-[9px] font-mono select-none"
          >
            -6 dB
          </text>
          <text
            x={PAD_LEFT - 4}
            y={y0pct + 3}
            textAnchor="end"
            className="fill-secondary/60 text-[9px] font-mono select-none"
          >
            0%
          </text>

          {/* X Axis Time Labels */}
          <text
            x={PAD_LEFT}
            y={SVG_HEIGHT - 4}
            textAnchor="start"
            className="fill-secondary text-[9px] font-mono select-none"
          >
            0s
          </text>
          <text
            x={xMid}
            y={SVG_HEIGHT - 4}
            textAnchor="middle"
            className="fill-secondary text-[9px] font-mono select-none"
          >
            50%
          </text>
          <text
            x={PAD_LEFT + GRAPH_WIDTH}
            y={SVG_HEIGHT - 4}
            textAnchor="end"
            className="fill-secondary text-[9px] font-mono select-none"
          >
            {duration}s
          </text>

          {/* Filled areas under curves */}
          <path d={outArea} fill="url(#cf-outgoing-grad)" />
          <path d={inArea} fill="url(#cf-incoming-grad)" />

          {/* Outgoing Track Curve (decay: 0,1 -> 1,0) */}
          <path
            d={outPath}
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80"
          />

          {/* Incoming Track Curve (rise: 0,0 -> 1,1) */}
          <path
            d={inPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          />

          {/* Handle projection guidelines */}
          <line
            x1={handleX}
            y1={handleY}
            x2={handleX}
            y2={PAD_TOP + GRAPH_HEIGHT}
            stroke="currentColor"
            className="text-primary/30"
            strokeDasharray="2 2"
          />
          <line
            x1={PAD_LEFT}
            y1={handleY}
            x2={handleX}
            y2={handleY}
            stroke="currentColor"
            className="text-primary/30"
            strokeDasharray="2 2"
          />

          {/* Draggable Tension Handle (Control Point) */}
          <g
            className="transition-transform duration-75 cursor-grab active:cursor-grabbing"
            style={{ transformOrigin: `${handleX}px ${handleY}px` }}
          >
            {/* Outer halo */}
            <circle
              cx={handleX}
              cy={handleY}
              r={isDragging ? 11 : 8}
              stroke="currentColor"
              className="text-primary fill-primary/30 transition-all"
              strokeWidth="2"
            />
            {/* Center dot */}
            <circle
              cx={handleX}
              cy={handleY}
              r={3.5}
              fill="white"
              className="drop-shadow"
            />
          </g>
        </svg>
      </div>

      {/* Real-time readout & Legend */}
      <div className="flex items-center justify-between text-xs text-secondary px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-slate-400" />
            <span className="text-[11px] text-secondary font-sans">
              {t('settings.crossfade_track_outgoing', 'Уходящий')}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded-full bg-primary" />
            <span className="text-[11px] text-primary font-sans">
              {t('settings.crossfade_track_incoming', 'Входящий')}
            </span>
          </span>
        </div>

        <div className="text-[11px] font-mono text-foreground font-semibold">
          {t('settings.crossfade_crossover_info', {
            x: Math.round(tension.x * 100),
            y: Math.round(tension.y * 100),
            db: gainToDb(tension.y),
          })}
        </div>
      </div>
    </div>
  );
}
