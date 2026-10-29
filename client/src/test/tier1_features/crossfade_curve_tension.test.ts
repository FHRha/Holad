import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import {
  calculateCrossfadeGains,
  generateCrossfadeCurves,
  gainToDb,
  CROSSFADE_PRESETS,
} from '../../audio/crossfade';
import CrossfadeCurveVisualizer from '../../components/settings/CrossfadeCurveVisualizer';
import { resetAllStores } from '../helpers/testUtils';

describe('Crossfade Curve & Tension Visualizer', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('calculates accurate gain values for linear curve', () => {
    const start = calculateCrossfadeGains(0, 'linear');
    expect(start.outGain).toBe(1.0);
    expect(start.inGain).toBe(0.0);

    const mid = calculateCrossfadeGains(0.5, 'linear');
    expect(mid.outGain).toBeCloseTo(0.5, 4);
    expect(mid.inGain).toBeCloseTo(0.5, 4);

    const end = calculateCrossfadeGains(1, 'linear');
    expect(end.outGain).toBe(0.0);
    expect(end.inGain).toBe(1.0);
  });

  it('calculates accurate gain values for equalPower curve', () => {
    const mid = calculateCrossfadeGains(0.5, 'equalPower', { x: 0.5, y: 0.707 });
    expect(mid.outGain).toBeCloseTo(Math.SQRT1_2, 3);
    expect(mid.inGain).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it('calculates accurate crossover for exponential / dip preset', () => {
    const mid = calculateCrossfadeGains(0.5, 'exponential', { x: 0.5, y: 0.35 });
    expect(mid.outGain).toBeCloseTo(0.35, 2);
    expect(mid.inGain).toBeCloseTo(0.35, 2);
  });

  it('calculates arbitrary custom crossover point accurately', () => {
    const customTension = { x: 0.35, y: 0.65 };
    const crossover = calculateCrossfadeGains(0.35, 'custom', customTension);
    expect(crossover.outGain).toBeCloseTo(0.65, 2);
    expect(crossover.inGain).toBeCloseTo(0.65, 2);
  });

  it('generates Float32Array curves of expected length and range', () => {
    const { outCurve, inCurve } = generateCrossfadeCurves(30, 'equalPower', { x: 0.5, y: 0.707 });
    expect(outCurve.length).toBe(30);
    expect(inCurve.length).toBe(30);
    expect(outCurve[0]).toBeCloseTo(1.0, 3);
    expect(outCurve[29]).toBeCloseTo(0.0, 3);
    expect(inCurve[0]).toBeCloseTo(0.0, 3);
    expect(inCurve[29]).toBeCloseTo(1.0, 3);
  });

  it('gainToDb converts gain to decibels correctly', () => {
    expect(gainToDb(1.0)).toBe('0');
    expect(gainToDb(0.707)).toBe('-3');
    expect(gainToDb(0.5)).toBe('-6');
    expect(gainToDb(0.35)).toBe('-9');
    expect(gainToDb(0.0)).toBe('-inf');
  });

  it('settingsStore updates tension and auto-switches to custom curve on setCrossfadeTension', () => {
    const store = useSettingsStore.getState();
    expect(store.crossfadeCurve).toBe('equalPower');
    expect(store.crossfadeTension).toEqual({ x: 0.5, y: 0.707 });

    store.setCrossfadeTension({ x: 0.4, y: 0.6 });
    const updated = useSettingsStore.getState();
    expect(updated.crossfadeCurve).toBe('custom');
    expect(updated.crossfadeTension).toEqual({ x: 0.4, y: 0.6 });

    // Selecting equalPower resets tension
    store.setCrossfadeCurve('equalPower');
    const reset = useSettingsStore.getState();
    expect(reset.crossfadeCurve).toBe('equalPower');
    expect(reset.crossfadeTension).toEqual({ x: 0.5, y: 0.707 });
  });

  it('renders CrossfadeCurveVisualizer with SVG canvas, preset buttons, and readout', () => {
    const { container } = render(React.createElement(CrossfadeCurveVisualizer));

    // SVG canvas rendered
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();

    // Preset buttons rendered
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(CROSSFADE_PRESETS.length);

    // Draggable handle circle exists
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThan(0);
  });
});
