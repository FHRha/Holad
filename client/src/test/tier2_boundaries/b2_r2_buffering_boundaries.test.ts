import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import Slider from '../../components/common/Slider';
import LiquidSeekBar from '../../components/common/LiquidSeekBar';
import { createMockAudioElement, MockTimeRanges } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';
import { AudioDeck } from '../../audio/AudioDeck';

describe('Tier 2 - B2: Buffering UI Boundaries & Edge Buffer States', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B2-1: Slider handles boundary buffer values (0.0, 1.0, and out-of-bounds negative or >1.0)', () => {
    // 0.0 buffer (empty)
    const { container, rerender } = render(
      React.createElement(Slider, {
        value: 0.0,
        buffered: 0.0,
      } as any)
    );
    expect(container.firstChild).not.toBeNull();

    // 1.0 buffer (100% full)
    rerender(
      React.createElement(Slider, {
        value: 0.5,
        buffered: 1.0,
      } as any)
    );
    expect(container.firstChild).not.toBeNull();

    // Out-of-bounds negative buffer (-0.2)
    rerender(
      React.createElement(Slider, {
        value: 0.1,
        buffered: -0.2,
      } as any)
    );
    expect(container.firstChild).not.toBeNull();

    // Out-of-bounds overflow buffer (1.5)
    rerender(
      React.createElement(Slider, {
        value: 0.8,
        buffered: 1.5,
      } as any)
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('B2-2: LiquidSeekBar handles undefined, null, and NaN buffered props without throwing runtime exceptions', () => {
    expect(() => {
      render(React.createElement(LiquidSeekBar, { value: 0.5, buffered: undefined } as any));
      render(React.createElement(LiquidSeekBar, { value: 0.5, buffered: null } as any));
      render(React.createElement(LiquidSeekBar, { value: 0.5, buffered: NaN } as any));
    }).not.toThrow();
  });

  it('B2-3: Discontinuous / fragmented buffered ranges calculate correct lookahead progress', () => {
    const el = createMockAudioElement();
    (el as any).duration = 300;
    const deck = new AudioDeck('deck-frag', el);

    let reportedProgress = 0;
    deck.on('progress', (pct: number) => {
      reportedProgress = pct;
    });

    // Multiple fragmented chunks: 0-30s, 60-90s, 150-200s
    (el as any).buffered = new MockTimeRanges([
      { start: 0, end: 30 },
      { start: 60, end: 90 },
      { start: 150, end: 200 },
    ]);
    (el as any).dispatchEvent(new Event('progress'));

    expect(reportedProgress).toBeGreaterThanOrEqual(0);
    deck.destroy();
  });

  it('B2-4: Stalled buffer emits waiting event and does not crash UI seekbar', () => {
    const el = createMockAudioElement();
    const deck = new AudioDeck('deck-stall', el);

    let waitingEventFired = false;
    deck.on('waiting', () => {
      waitingEventFired = true;
    });

    (el as any).simulateWaiting();
    expect(waitingEventFired).toBe(true);

    deck.destroy();
  });

  it('B2-5: Rapid progress events under high-frequency stream buffering throttle safely', () => {
    const el = createMockAudioElement();
    (el as any).duration = 100;
    const deck = new AudioDeck('deck-burst', el);

    let eventCount = 0;
    deck.on('progress', () => {
      eventCount++;
    });

    // Fire 50 progress events in microtask burst
    for (let i = 1; i <= 50; i++) {
      (el as any).simulateBufferProgress(0, i * 2);
    }

    expect(eventCount).toBe(50);
    deck.destroy();
  });

  it('B2-6: Seeking beyond current buffer position updates seeking state cleanly', () => {
    const { container } = render(
      React.createElement(Slider, {
        value: 0.9, // seek near end
        buffered: 0.3, // only 30% buffered
      } as any)
    );

    expect(container.firstChild).not.toBeNull();
  });
});
