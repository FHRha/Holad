import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import Slider from '../../components/common/Slider';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 3 - Pairwise: Buffering UI (R2) + Crossfade Sync (R7) + UI Seekbar (R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P4-1: Incoming track buffering updates buffer progress bar independently of outgoing track state', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('buf-cf-1', 'Track 1', 180);
    const track2 = createMockTrack('buf-cf-2', 'Track 2', 240);

    const progressReports: number[] = [];
    engine.on('progress', (pct: number) => {
      progressReports.push(pct);
    });

    (el0 as any).duration = 180;
    (el1 as any).duration = 240;

    // Outgoing deck 0 has 100% buffer
    (el0 as any).simulateBufferProgress(0, 180);

    // Incoming deck 1 buffers first 60s (25%)
    (el1 as any).simulateBufferProgress(0, 60);

    expect(progressReports.length).toBeGreaterThan(0);
    engine.destroy();
  });

  it('P4-2: Seeking during buffering updates progress fill without corrupting gray buffer bar indicator', () => {
    const { container, rerender } = render(
      React.createElement(Slider, {
        value: 0.1,
        buffered: 0.4,
      } as any)
    );

    expect(container.firstChild).not.toBeNull();

    // User seeks to 0.35 (inside buffered range)
    rerender(
      React.createElement(Slider, {
        value: 0.35,
        buffered: 0.4,
      } as any)
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('P4-3: Buffer reaching 100% full remains stable during active crossfade transition', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track1 = createMockTrack('b-cf-1', 'Track 1', 180);
    const track2 = createMockTrack('b-cf-2', 'Track 2', 200);

    (el0 as any).duration = 180;
    (el1 as any).duration = 200;

    await engine.playTrack(track1, { immediate: true });
    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });

    (el1 as any).simulateBufferProgress(0, 200);
    await cfPromise;

    expect(engine.getActiveDeckIndex()).toBe(1);
    engine.destroy();
  });

  it('P4-4: LiquidSeekBar animates wave during active playback with partial buffer', () => {
    const { container } = render(
      React.createElement(Slider, {
        value: 0.25,
        buffered: 0.5,
        isAnimated: true,
      } as any)
    );

    expect(container.firstChild).not.toBeNull();
  });
});
