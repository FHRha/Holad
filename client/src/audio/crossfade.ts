import type { CrossfadeCurve } from './types';

export interface CrossfadeTension {
  x: number;
  y: number;
}

export interface CrossfadePreset {
  id: CrossfadeCurve;
  nameKey: string;
  defaultTension: CrossfadeTension;
}

export const CROSSFADE_PRESETS: CrossfadePreset[] = [
  {
    id: 'equalPower',
    nameKey: 'settings.crossfade_curve_equal_power',
    defaultTension: { x: 0.5, y: 0.707 },
  },
  {
    id: 'linear',
    nameKey: 'settings.crossfade_curve_linear',
    defaultTension: { x: 0.5, y: 0.5 },
  },
  {
    id: 'exponential',
    nameKey: 'settings.crossfade_curve_dip',
    defaultTension: { x: 0.5, y: 0.35 },
  },
  {
    id: 'custom',
    nameKey: 'settings.crossfade_curve_custom',
    defaultTension: { x: 0.5, y: 0.707 },
  },
];

/**
 * Calculates outgoing and incoming deck gain values for a normalized time t in [0, 1].
 * Guarantees smooth, monotonic curves passing through tension (x, y) crossover point.
 */
export function calculateCrossfadeGains(
  t: number,
  curve: CrossfadeCurve = 'equalPower',
  tension: CrossfadeTension = { x: 0.5, y: 0.707 }
): { outGain: number; inGain: number } {
  const clampedT = Math.max(0, Math.min(1, t));

  if (curve === 'linear') {
    return {
      outGain: 1.0 - clampedT,
      inGain: clampedT,
    };
  }

  const xc = Math.max(0.25, Math.min(0.75, tension?.x ?? 0.5));
  const yc = Math.max(0.05, Math.min(0.95, tension?.y ?? 0.707));

  // If equalPower preset is active with standard tension, use canonical trigonometric equal power
  if (curve === 'equalPower' && Math.abs(xc - 0.5) < 0.005 && Math.abs(yc - 0.707) < 0.005) {
    return {
      outGain: Math.cos(clampedT * 0.5 * Math.PI),
      inGain: Math.cos((1.0 - clampedT) * 0.5 * Math.PI),
    };
  }

  // Smooth rational time-reparameterization: tau(0)=0, tau(xc)=0.5, tau(1)=1
  const denom = clampedT * (1 - xc) + (1 - clampedT) * xc;
  const tau = denom > 0 ? (clampedT * (1 - xc)) / denom : clampedT;

  // Power exponent matching crossover height: 0.5^p = yc => p = -log2(yc)
  const p = -Math.log2(yc);

  const inGain = Math.pow(tau, p);
  const outGain = Math.pow(1 - tau, p);

  return {
    outGain: Math.max(0, Math.min(1, outGain)),
    inGain: Math.max(0, Math.min(1, inGain)),
  };
}

/**
 * Generates Float32Arrays of length `steps` for outgoing and incoming gains
 */
export function generateCrossfadeCurves(
  steps: number = 30,
  curve: CrossfadeCurve = 'equalPower',
  tension: CrossfadeTension = { x: 0.5, y: 0.707 }
): { outCurve: Float32Array; inCurve: Float32Array } {
  const outCurve = new Float32Array(steps);
  const inCurve = new Float32Array(steps);

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const gains = calculateCrossfadeGains(t, curve, tension);
    outCurve[i] = gains.outGain;
    inCurve[i] = gains.inGain;
  }

  return { outCurve, inCurve };
}

/**
 * Converts linear gain (0.0 .. 1.0) to decibels display string (e.g. "0 dB", "-3 dB")
 */
export function gainToDb(gain: number): string {
  if (gain <= 0.0001) return '-inf';
  const db = 20 * Math.log10(gain);
  return db >= -0.05 ? '0' : `${Math.round(db)}`;
}
