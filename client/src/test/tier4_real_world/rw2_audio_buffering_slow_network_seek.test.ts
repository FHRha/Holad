import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { AudioEngine } from '../../audio/AudioEngine';
// oxlint-disable-next-line
import { createMockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import Slider from '../../components/common/Slider';

describe('Tier 4 - Scenario 2: Slow Network Buffering, Seekbar Interaction & Recovery (R2, R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('RW2-1: End-to-end slow buffering workflow: Track streams initial chunk, buffers next chunk, user seeks into buffer, playback continues', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    (el0 as any).duration = 200;
    const engine = new AudioEngine([el0, el1]);

    const track = createMockTrack('slow-trk-1', 'Slow Stream Song', 200);
    usePlayerStore.setState({
      queue: [track],
      currentIndex: 0,
      isPlaying: true,
    });

    const progressReports: number[] = [];
    engine.on('progress', (pct: number) => {
      progressReports.push(pct);
    });

    // 1. Initial 15% buffer received
    (el0 as any).simulateBufferProgress(0, 30);
    await engine.playTrack(track, { immediate: true });
    expect(engine.getState()).toBe('playing');

    // 2. Render seekbar with 15% buffer
    const { container, rerender } = render(
      React.createElement(Slider, {
        value: 0.05,
        buffered: 0.15,
      } as any)
    );
    expect(container.firstChild).not.toBeNull();

    // 3. Network delivers next chunk (up to 50% buffer = 100s)
    (el0 as any).simulateBufferProgress(0, 100);
    rerender(
      React.createElement(Slider, {
        value: 0.1,
        buffered: 0.5,
      } as any)
    );

    // 4. User seeks forward to 40s (0.20), inside buffered range
    engine.seek(40);
    rerender(
      React.createElement(Slider, {
        value: 0.2,
        buffered: 0.5,
      } as any)
    );
    expect(engine.getState()).toBe('playing');

    // 5. Final buffer completion (100%)
    (el0 as any).simulateBufferProgress(0, 200);
    rerender(
      React.createElement(Slider, {
        value: 0.2,
        buffered: 1.0,
      } as any)
    );

    engine.destroy();
  });

  it('RW2-2: User seeks past buffered range into unbuffered region: engine enters buffering state and resumes upon data arrival', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    (el0 as any).duration = 300;
    const engine = new AudioEngine([el0, el1]);

    let bufferingLogged = false;
    engine.on('buffering', (isBuffering: boolean) => {
      if (isBuffering) bufferingLogged = true;
    });

    const track = createMockTrack('unbuf-trk', 'Unbuffered Song', 300);
    await engine.playTrack(track, { immediate: true });

    // Initial buffer: 0-60s (20%)
    (el0 as any).simulateBufferProgress(0, 60);

    // User seeks to 200s (unbuffered territory)
    engine.seek(200);
    (el0 as any).simulateWaiting();
    expect(bufferingLogged).toBe(true);

    // Server responds with chunk at 200-250s
    (el0 as any).simulateBufferProgress(200, 250);
    (el0 as any).simulateCanPlay();
    expect(engine.getState()).toBe('playing');

    engine.destroy();
  });
});
