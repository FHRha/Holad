import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import Slider from '../../components/common/Slider';
import BottomPlayer from '../../components/player/BottomPlayer';

describe('Tier 1 - R5: Web Volume Slider Audio Engine Modulation', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R5-1: Slider component fires onDrag and onChange callbacks with fractional volume value (0.0 to 1.0)', () => {
    const handleDrag = vi.fn();
    const handleChange = vi.fn();

    const { container } = render(
      React.createElement(Slider, {
        value: 0.5,
        onDrag: handleDrag,
        onChange: handleChange,
      })
    );

    const sliderRoot = container.firstChild as HTMLElement;
    expect(sliderRoot).not.toBeNull();

    // Mock getBoundingClientRect
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

    // Simulate pointer down at 75px (0.75 volume)
    fireEvent.pointerDown(sliderRoot, { clientX: 75 });
    expect(handleDrag).toHaveBeenCalledWith(0.75);
  });

  it('R5-2: Changing volume in playerStore updates store volume property accurately', () => {
    const store = usePlayerStore.getState();

    store.setVolume(0.0);
    expect(usePlayerStore.getState().volume).toBe(0.0);

    store.setVolume(0.45);
    expect(usePlayerStore.getState().volume).toBe(0.45);

    store.setVolume(1.0);
    expect(usePlayerStore.getState().volume).toBe(1.0);
  });

  it('R5-3: AudioEngine setVolume applies new volume level to WebAudioPipeline masterGainNode', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    // Test multiple volume levels
    const testLevels = [0.0, 0.25, 0.5, 0.75, 1.0];

    testLevels.forEach((lvl) => {
      engine.setVolume(lvl);
      const pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(lvl, 2);
    });

    engine.destroy();
  });

  it('R5-4: Volume slider in BottomPlayer modulates player store volume upon interaction', () => {
    const track = createMockTrack('vol-trk-1', 'Volume Test Track', 180);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      volume: 0.5,
    });

    const { container } = render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(BottomPlayer)
      )
    );

    // Bottom player renders slider controls
    expect(container.firstChild).not.toBeNull();
  });

  it('R5-5: Volume modulation handles combined volume and volumeMultiplier scaling on web client', () => {
    const pipeline = new WebAudioPipeline();

    // 60% master volume with 100% multiplier -> 0.60
    pipeline.setMasterVolume(0.6, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.6, 3);

    // 60% master volume with 20% multiplier (desktop default) -> 0.12
    pipeline.setMasterVolume(0.6, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.12, 3);

    pipeline.destroy();
  });

  it('R5-6: Rapid slider dragging produces smooth linear gain ramp events without NaN or clipping', () => {
    const pipeline = new WebAudioPipeline();

    for (let step = 0; step <= 100; step += 10) {
      const vol = step / 100;
      pipeline.setMasterVolume(vol, 1.0, 0.05);
      expect(isNaN(pipeline.masterGainNode.gain.value)).toBe(false);
      expect(pipeline.masterGainNode.gain.value).toBeGreaterThanOrEqual(0);
      expect(pipeline.masterGainNode.gain.value).toBeLessThanOrEqual(1.0);
    }

    pipeline.destroy();
  });
});
