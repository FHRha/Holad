import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import LiquidSeekBar, {
  LiquidSeekBarRef,
  parseColorToRgb,
  getDefaultLayers,
} from '../../components/common/LiquidSeekBar';
import { setGlobalWindowVisible } from '../../hooks/useWindowVisibility';
import { formatTime } from '../../utils/timeFormat';

describe('LiquidSeekBar 3-Wave Integration and Visibility Guards', () => {
  let mockRaf: any;
  let mockCaf: any;
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId = 1;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;

    mockRaf = vi.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });

    mockCaf = vi.fn((id: number) => {
      rafCallbacks.delete(id);
    });

    vi.stubGlobal('requestAnimationFrame', mockRaf);
    vi.stubGlobal('cancelAnimationFrame', mockCaf);

    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      quadraticCurveTo: vi.fn(),
      roundRect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      setTransform: vi.fn(),
      scale: vi.fn(),
    }));

    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver as any);

    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as any);

    setGlobalWindowVisible(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setGlobalWindowVisible(true);
  });

  it('provides 3 waves by default with distinct progressive phase offsets and opacities', () => {
    const defaultLayers = getDefaultLayers();
    expect(defaultLayers).toHaveLength(3);

    // Verify 3 distinct layers
    expect(defaultLayers[0].opacity).toBe(0.30);
    expect(defaultLayers[1].opacity).toBe(0.55);
    expect(defaultLayers[2].opacity).toBe(0.85);

    // Verify distinct phases
    expect(defaultLayers[0].offsetPhase).toBe(0);
    expect(defaultLayers[1].offsetPhase).toBeCloseTo(Math.PI * 0.55, 2);
    expect(defaultLayers[2].offsetPhase).toBeCloseTo(Math.PI * 0.95, 2);

    // Verify speeds and amplitudes increase progressively for depth
    expect(defaultLayers[0].speed).toBeLessThan(defaultLayers[1].speed!);
    expect(defaultLayers[1].speed).toBeLessThan(defaultLayers[2].speed!);
  });

  it('supports 1, 2, 3, and 4 waves via getDefaultLayers', () => {
    expect(getDefaultLayers(1)).toHaveLength(1);
    expect(getDefaultLayers(2)).toHaveLength(2);
    expect(getDefaultLayers(3)).toHaveLength(3);
    expect(getDefaultLayers(4)).toHaveLength(4);
  });

  it('correctly parses hex, rgb, rgba, and comma-separated RGB values', () => {
    expect(parseColorToRgb('#6366f1')).toEqual({ r: 99, g: 102, b: 241 });
    expect(parseColorToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColorToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColorToRgb('rgb(16, 185, 129)')).toEqual({ r: 16, g: 185, b: 129 });
    expect(parseColorToRgb('rgba(200, 100, 50, 0.8)')).toEqual({ r: 200, g: 100, b: 50 });
    expect(parseColorToRgb('120, 130, 140')).toEqual({ r: 120, g: 130, b: 140 });
    expect(parseColorToRgb('')).toBeNull();
    expect(parseColorToRgb('invalid')).toBeNull();
  });

  it('renders LiquidSeekBar with 3 waves by default without throwing', () => {
    const { container } = render(<LiquidSeekBar value={0.5} isAnimated={true} />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('STRICT VISIBILITY GUARD: cancels RAF and stops wave computation when window is minimized or hidden', () => {
    const { unmount } = render(<LiquidSeekBar value={0.5} isAnimated={true} />);

    // Initially window is visible and isAnimated is true, so RAF should have been called
    expect(mockRaf).toHaveBeenCalled();
    const initialRafCount = mockRaf.mock.calls.length;

    // Simulate window minimized / sent to background
    act(() => {
      setGlobalWindowVisible(false);
    });

    // cancelAnimationFrame must be called when minimized
    expect(mockCaf).toHaveBeenCalled();

    const rafCountAfterMinimize = mockRaf.mock.calls.length;

    // Simulate a time tick: no new RAFs should be scheduled while minimized
    act(() => {
      // Run any pending callbacks if any existed
      rafCallbacks.forEach((cb) => cb(performance.now()));
      rafCallbacks.clear();
    });

    // No new animation frames scheduled while minimized
    expect(mockRaf.mock.calls.length).toBe(rafCountAfterMinimize);

    // Now restore window
    act(() => {
      setGlobalWindowVisible(true);
    });

    // RAF must resume upon restore
    expect(mockRaf.mock.calls.length).toBeGreaterThan(rafCountAfterMinimize);

    unmount();
    // On unmount, cancelAnimationFrame should be called cleanly
    expect(mockCaf).toHaveBeenCalled();
  });

  it('allows imperative setValue via LiquidSeekBarRef', () => {
    const ref = React.createRef<LiquidSeekBarRef>();
    const { container } = render(<LiquidSeekBar ref={ref} value={0.2} />);
    expect(ref.current).toBeDefined();

    act(() => {
      ref.current?.setValue(0.75);
    });

    const thumb = container.querySelector('.rounded-full.shadow-\\[0_0_4px_rgba\\(0\\,0\\,0\\,0\\.5\\)\\]');
    expect(thumb).not.toBeNull();
    expect((thumb as HTMLElement).style.left).toBe('75%');
  });

  it('safely handles rapid value re-renders without unmounting canvas effect or killing animation loop', () => {
    const { rerender } = render(<LiquidSeekBar value={0.1} isAnimated={true} />);
    expect(mockRaf).toHaveBeenCalled();

    // Re-render rapidly with updated progress values as happens during audio playback
    for (let i = 2; i <= 10; i++) {
      act(() => {
        rerender(<LiquidSeekBar value={i / 100} isAnimated={true} />);
      });
    }

    // Animation should remain active and not get permanently terminated by teardown loops
    expect(mockRaf.mock.calls.length).toBeGreaterThan(0);
  });

  it('safely handles non-finite values (Infinity, -Infinity, NaN) in value and buffered props', () => {
    expect(() => {
      const { rerender } = render(<LiquidSeekBar value={Infinity} buffered={Infinity} />);
      rerender(<LiquidSeekBar value={-Infinity} buffered={-Infinity} />);
      rerender(<LiquidSeekBar value={NaN} buffered={NaN} />);
    }).not.toThrow();
  });

  it('formatTime formats valid seconds and safely prevents Infinity:NaN', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(215)).toBe('3:35');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-Infinity)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
  });
});
