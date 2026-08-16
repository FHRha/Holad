import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import { useAudioStore } from '../../store/audioStore';
import LiquidSeekBar from '../../components/common/LiquidSeekBar';
import Slider from '../../components/common/Slider';
import { MockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F10: UI Buffering, Volume Slider & Settings Layout', () => {
  beforeEach(() => {
    resetAllStores();
    useAudioStore.setState({
      audioElement: null,
      progress: 0,
      buffered: 0,
      duration: 0,
      isSeeking: false,
    });
  });

  it('F10-1: audioStore initializes buffered to 0 and updates via setBuffered', () => {
    expect(useAudioStore.getState().buffered).toBe(0);
    useAudioStore.getState().setBuffered(75);
    expect(useAudioStore.getState().buffered).toBe(75);
  });

  it('F10-2: audioStore automatically updates buffered from audioElement progress event', () => {
    const audio = new MockAudioElement();
    audio.duration = 200;
    Object.defineProperty(audio, 'buffered', {
      value: new MockTimeRanges([{ start: 0, end: 120 }]),
      writable: true,
    });

    useAudioStore.getState().setAudioElement(audio as any);

    // Trigger progress
    audio.dispatchEvent(new Event('progress'));
    expect(useAudioStore.getState().buffered).toBe(60); // 120 / 200 * 100 = 60%
  });

  it('F10-3: LiquidSeekBar renders gray buffered bar with bg-white/40 rounded-full matching buffered value', () => {
    const { container, rerender } = render(<LiquidSeekBar value={0.3} buffered={0.65} />);
    
    let bufferBar = container.querySelector('.bg-white\\/40.rounded-full');
    expect(bufferBar).not.toBeNull();
    expect((bufferBar as HTMLElement).style.width).toBe('65%');

    // Test with percentage scale (e.g. 80)
    rerender(<LiquidSeekBar value={0.3} buffered={80} />);
    bufferBar = container.querySelector('.bg-white\\/40.rounded-full');
    expect(bufferBar).not.toBeNull();
    expect((bufferBar as HTMLElement).style.width).toBe('80%');
  });

  it('F10-4: Slider renders gray buffered bar with bg-white/40 rounded-full when buffered > 0', () => {
    const { container } = render(<Slider value={0.2} buffered={0.5} />);
    const bufferBar = container.querySelector('.bg-white\\/40.rounded-full');
    expect(bufferBar).not.toBeNull();
    expect((bufferBar as HTMLElement).style.width).toBe('50%');
  });

  it('F10-5: Slider fires onChange on pointer interaction without requiring continuous drag', () => {
    let changedVal: number | null = null;
    const handleChange = (val: number) => {
      changedVal = val;
    };

    const { container } = render(<Slider value={0.5} onChange={handleChange} />);
    const sliderContainer = container.firstElementChild as HTMLElement;

    // Mock getBoundingClientRect
    sliderContainer.getBoundingClientRect = () => ({
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

    fireEvent.pointerDown(sliderContainer, { clientX: 70, clientY: 10 });
    expect(changedVal).toBeCloseTo(0.7, 1);
  });
});
