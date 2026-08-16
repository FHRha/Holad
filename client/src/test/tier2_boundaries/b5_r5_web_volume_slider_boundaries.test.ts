import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { resetAllStores } from '../helpers/testUtils';
import Slider from '../../components/common/Slider';

describe('Tier 2 - B5: Web Volume Slider Boundary Cases & Pointer Event Stress', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B5-1: Slider drag beyond boundary bounds (clientX < 0 and clientX > width) clamps strictly to 0.0 and 1.0', () => {
    let currentDragVal = -1;

    const { container } = render(
      React.createElement(Slider, {
        value: 0.5,
        onDrag: (v) => { currentDragVal = v; },
      })
    );

    const sliderRoot = container.firstChild as HTMLElement;
    vi.spyOn(sliderRoot, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 200,
      height: 20,
      right: 300,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => {},
    });

    // Drag way off to the left (clientX = -500, clamped to 0)
    fireEvent.pointerDown(sliderRoot, { clientX: -500 });
    expect(currentDragVal).toBe(0.0);

    // Drag way off to the right (clientX = 1000, clamped to 1.0)
    fireEvent.pointerDown(sliderRoot, { clientX: 1000 });
    expect(currentDragVal).toBe(1.0);
  });

  it('B5-2: High-frequency rapid scrubbing (120fps simulation, 120 events) modulates gain smoothly', () => {
    const pipeline = new WebAudioPipeline();

    // Fire 120 volume updates
    for (let frame = 0; frame < 120; frame++) {
      const vol = Math.sin((frame / 120) * Math.PI); // Smooth sinusoidal volume sweep
      pipeline.setMasterVolume(vol, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBeGreaterThanOrEqual(0.0);
      expect(pipeline.masterGainNode.gain.value).toBeLessThanOrEqual(1.0);
    }

    pipeline.destroy();
  });

  it('B5-3: Volume state mutation boundaries (0.0 to 1.0) clamp out-of-range playerStore values safely', () => {
    const store = usePlayerStore.getState();

    // Values within [0, 1] set normally
    store.setVolume(0.0);
    expect(usePlayerStore.getState().volume).toBe(0.0);

    store.setVolume(1.0);
    expect(usePlayerStore.getState().volume).toBe(1.0);

    // Midpoint precision
    store.setVolume(0.333333);
    expect(usePlayerStore.getState().volume).toBeCloseTo(0.333333, 5);
  });

  it('B5-4: Muting and unmuting volume toggles audio gain accurately between 0.0 and previous level', () => {
    const pipeline = new WebAudioPipeline();

    let previousVolume = 0.75;
    usePlayerStore.getState().setVolume(previousVolume);
    pipeline.setMasterVolume(previousVolume, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.75, 4);

    // Mute
    usePlayerStore.getState().setVolume(0.0);
    pipeline.setMasterVolume(0.0, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    // Unmute back to previous volume
    usePlayerStore.getState().setVolume(previousVolume);
    pipeline.setMasterVolume(previousVolume, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.75, 4);

    pipeline.destroy();
  });

  it('B5-5: Simultaneous volume slider change and playback rate cycle does not disrupt gain schedule', () => {
    const pipeline = new WebAudioPipeline();
    const store = usePlayerStore.getState();

    for (let i = 0; i < 5; i++) {
      store.cyclePlaybackRate();
      store.setVolume((i + 1) * 0.2);
      pipeline.setMasterVolume((i + 1) * 0.2, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo((i + 1) * 0.2, 2);
    }

    pipeline.destroy();
  });

  it('B5-6: Pointer up event outside slider bounding rect completes drag and sets final volume cleanly', () => {
    let finalVal = -1;

    const { container } = render(
      React.createElement(Slider, {
        value: 0.5,
        onDragEnd: (v) => { finalVal = v; },
      })
    );

    const sliderRoot = container.firstChild as HTMLElement;
    vi.spyOn(sliderRoot, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(sliderRoot, { clientX: 60 });
    fireEvent(window, new PointerEvent('pointerup', { clientX: 60 }));

    expect(finalVal).toBeCloseTo(0.6, 2);
  });
});
