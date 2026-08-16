import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 3 - Pairwise: Desktop Volume Default (R1) + Web Volume Slider (R5) + UI Preservation (R8)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P1-1: Desktop volume initialization sets 20% multiplier and scales slider output across master gain', () => {
    const store = usePlayerStore.getState();
    const pipeline = new WebAudioPipeline();

    // Set desktop volume default multiplier (0.2)
    store.setVolumeMultiplier(0.2);
    // User adjusts slider to 80% (0.8)
    store.setVolume(0.8);
    pipeline.setMasterVolume(0.8, 0.2);

    expect(usePlayerStore.getState().volumeMultiplier).toBe(0.2);
    expect(usePlayerStore.getState().volume).toBe(0.8);
    // Final master gain is 0.8 * 0.2 = 0.16
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.16, 4);

    pipeline.destroy();
  });

  it('P1-2: Adjusting web volume slider to 100% on desktop outputs capped 20% gain without distortion', () => {
    const pipeline = new WebAudioPipeline();

    pipeline.setMasterVolume(1.0, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.2, 4);

    pipeline.destroy();
  });

  it('P1-3: User overrides volume multiplier to 100% and then modulates web volume slider', () => {
    const pipeline = new WebAudioPipeline();

    // Override to standard 1.0x
    pipeline.setMasterVolume(0.5, 1.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.5, 4);

    // Boost to 2.0x
    pipeline.setMasterVolume(0.5, 2.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 4);

    pipeline.destroy();
  });

  it('P1-4: AudioEngine setVolume coordinates with volumeMultiplier across continuous playback session', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.setVolumeMultiplier(0.2);
    engine.setVolume(0.5);

    const track = createMockTrack('vol-pair-1', 'Pairwise Volume Track', 180);
    await engine.playTrack(track, { immediate: true });

    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.1, 4);
    }

    engine.destroy();
  });
});
