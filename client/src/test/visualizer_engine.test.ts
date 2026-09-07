import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VisualizerEngine, VisualizerStyle } from '../components/visualizer/VisualizerEngine';
import { useSettingsStore } from '../store/settingsStore';

describe('VisualizerEngine & Settings Integration', () => {
  let canvas: HTMLCanvasElement;
  let mockCtx: any;
  let mockAnalyser: any;

  beforeEach(() => {
    // Reset settingsStore
    useSettingsStore.setState({ visualizerStyle: 'classic' });

    mockCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      resetTransform: vi.fn(),
      scale: vi.fn(),
      roundRect: vi.fn(),
      quadraticCurveTo: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      drawImage: vi.fn(),
      setTransform: vi.fn(),
    };

    canvas = {
      getContext: vi.fn(() => mockCtx),
      getBoundingClientRect: vi.fn(() => ({
        width: 800,
        height: 400,
        top: 0,
        left: 0,
        right: 800,
        bottom: 400,
      })),
      width: 800,
      height: 400,
    } as any;

    mockAnalyser = {
      frequencyBinCount: 512,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => {
        arr.fill(128);
      }),
      getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
        arr.fill(128);
      }),
    };

    if (typeof (window as any).ResizeObserver === 'undefined') {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserverMock, configurable: true });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates visualizer style in settingsStore correctly', () => {
    expect(useSettingsStore.getState().visualizerStyle).toBe('classic');

    const styles: VisualizerStyle[] = ['modern', 'wave', 'radial', 'peaks', 'classic'];
    styles.forEach(style => {
      useSettingsStore.getState().setVisualizerStyle(style);
      expect(useSettingsStore.getState().visualizerStyle).toBe(style);
    });
  });

  it('instantiates VisualizerEngine without errors and handles resize', () => {
    let currentStyle: VisualizerStyle = 'classic';
    let isPlaying = true;

    const engine = new VisualizerEngine({
      canvas,
      getAnalyser: () => mockAnalyser,
      getIsPlaying: () => isPlaying,
      getStyle: () => currentStyle,
    });

    expect(engine).toBeDefined();

    // Resize
    engine.handleResize();
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);

    engine.destroy();
  });

  it('renders all 5 styles without throwing exceptions', () => {
    const styles: VisualizerStyle[] = ['classic', 'modern', 'wave', 'radial', 'peaks'];

    styles.forEach((style) => {
      let isPlaying = true;
      const engine = new VisualizerEngine({
        canvas,
        getAnalyser: () => mockAnalyser,
        getIsPlaying: () => isPlaying,
        getStyle: () => style,
      });

      engine.handleResize();
      engine.start();

      // Trigger evaluation
      engine.evaluateRunningState();

      // Ensure no crash occurred and stop engine
      engine.stop();
      engine.destroy();
    });
  });
});
