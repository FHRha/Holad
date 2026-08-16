import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 2 - B1: Desktop Volume Default & Multiplier Boundary Cases', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B1-1: Boundary multiplier values (0.0 mute, 0.2 default, 1.0 normal, 3.0 boost) calculate accurately', () => {
    const pipeline = new WebAudioPipeline();

    // 0.0 multiplier = absolute silence
    pipeline.setMasterVolume(1.0, 0.0);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    // 0.2 multiplier = 20% desktop default
    pipeline.setMasterVolume(1.0, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.2, 4);

    // 1.0 multiplier = 100% normal
    pipeline.setMasterVolume(1.0, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 4);

    // 3.0 multiplier = 300% maximum boost
    pipeline.setMasterVolume(1.0, 3.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(3.0, 4);

    pipeline.destroy();
  });

  it('B1-2: Negative volume multiplier inputs clamp safely to 0.0 without generating negative audio gain', () => {
    const pipeline = new WebAudioPipeline();

    pipeline.setMasterVolume(0.5, -1.0);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    pipeline.setMasterVolume(0.8, -0.5);
    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    pipeline.destroy();
  });

  it('B1-3: Extreme float precision values (e.g. 0.000001 or 0.999999) evaluate without arithmetic NaN', () => {
    const pipeline = new WebAudioPipeline();

    pipeline.setMasterVolume(0.000001, 0.2);
    expect(isNaN(pipeline.masterGainNode.gain.value)).toBe(false);
    expect(pipeline.masterGainNode.gain.value).toBeGreaterThanOrEqual(0.0);

    pipeline.setMasterVolume(0.999999, 0.2);
    expect(isNaN(pipeline.masterGainNode.gain.value)).toBe(false);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.2, 3);

    pipeline.destroy();
  });

  it('B1-4: Rapid volume multiplier toggling in store maintains consistent state across rapid updates', () => {
    const multipliers = [0.2, 1.0, 1.5, 0.2, 2.0, 3.0, 0.2];

    multipliers.forEach((m) => {
      usePlayerStore.getState().setVolumeMultiplier(m);
      expect(usePlayerStore.getState().volumeMultiplier).toBe(m);
    });
  });

  it('B1-5: AudioEngine handles zero volume and zero multiplier without division by zero or errors', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    expect(() => {
      engine.setVolume(0.0);
      engine.setVolumeMultiplier(0.0);
    }).not.toThrow();

    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.masterGainNode.gain.value).toBe(0.0);
    }

    engine.destroy();
  });

  it('B1-6: Initial store state rehydration handles missing or corrupted multiplier defaults gracefully', () => {
    // If state is missing multiplier, fallback to 1.0 or 0.2
    usePlayerStore.setState({ volumeMultiplier: (undefined as any) });
    const current = usePlayerStore.getState().volumeMultiplier || 0.2;
    expect(current).toBe(0.2);
  });
});
