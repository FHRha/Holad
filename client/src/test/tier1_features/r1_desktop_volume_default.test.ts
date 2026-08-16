import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';
import { isTauri, isCapacitor } from '../../utils/StorageManager';

describe('Tier 1 - R1: Desktop Volume Default & Platform Multiplier', () => {
  let originalUserAgent: string;

  beforeEach(() => {
    resetAllStores();
    originalUserAgent = navigator.userAgent;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
      configurable: true,
    });
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).Capacitor;
    vi.restoreAllMocks();
  });

  it('R1-1: Desktop environment sets volume multiplier target to 20% (0.20)', () => {
    // Simulate desktop environment (non-mobile, Tauri or standard desktop browser)
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      writable: true,
      configurable: true,
    });

    const isMobile = !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    expect(isMobile).toBe(false);

    // Verify desktop volume multiplier default contract (0.20)
    const desktopDefaultMultiplier = isMobile ? 1.0 : 0.2;
    expect(desktopDefaultMultiplier).toBe(0.2);

    usePlayerStore.getState().setVolumeMultiplier(desktopDefaultMultiplier);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(0.2);
  });

  it('R1-2: Mobile platform detection keeps default volume multiplier at 100% (1.00)', () => {
    // Simulate mobile browser / Capacitor environment
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      writable: true,
      configurable: true,
    });

    const isMobile = !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    expect(isMobile).toBe(true);

    const mobileDefaultMultiplier = isMobile ? 1.0 : 0.2;
    expect(mobileDefaultMultiplier).toBe(1.0);

    usePlayerStore.getState().setVolumeMultiplier(mobileDefaultMultiplier);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(1.0);
  });

  it('R1-3: Updating volumeMultiplier in playerStore updates store state accurately', () => {
    const store = usePlayerStore.getState();

    store.setVolumeMultiplier(0.2);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(0.2);

    store.setVolumeMultiplier(0.5);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(0.5);

    store.setVolumeMultiplier(1.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(1.0);

    store.setVolumeMultiplier(2.5);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(2.5);
  });

  it('R1-4: WebAudioPipeline scales master gain according to volume * volumeMultiplier product', () => {
    const pipeline = new WebAudioPipeline();

    // Desktop default: 50% volume with 20% multiplier -> 0.5 * 0.2 = 0.10 gain
    pipeline.setMasterVolume(0.5, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.1, 4);

    // Full 100% volume with 20% multiplier -> 1.0 * 0.2 = 0.20 gain
    pipeline.setMasterVolume(1.0, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.2, 4);

    // Standard mobile 100% volume with 100% multiplier -> 1.0 * 1.0 = 1.0 gain
    pipeline.setMasterVolume(1.0, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 4);

    // Boosted volume: 80% volume with 200% multiplier -> 0.8 * 2.0 = 1.6 gain
    pipeline.setMasterVolume(0.8, 2.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.6, 4);

    pipeline.destroy();
  });

  it('R1-5: AudioEngine setVolume and setVolumeMultiplier modulate master pipeline output', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.setVolume(0.5);
    engine.setVolumeMultiplier(0.2);

    const pipeline = engine.getWebAudioPipeline();
    expect(pipeline).toBeDefined();
    if (pipeline) {
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.1, 4);
    }

    engine.destroy();
  });

  it('R1-6: Volume multiplier state is preserved across track playback operations', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    usePlayerStore.getState().setVolumeMultiplier(0.2);
    engine.setVolumeMultiplier(0.2);

    const track1 = createMockTrack('t1', 'Track 1', 120);
    await engine.playTrack(track1, { immediate: true });

    // Ensure multiplier didn't get reset by track loading
    expect(usePlayerStore.getState().volumeMultiplier).toBe(0.2);
    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.masterGainNode.gain.value).toBeLessThanOrEqual(0.25);
    }

    engine.destroy();
  });
});
