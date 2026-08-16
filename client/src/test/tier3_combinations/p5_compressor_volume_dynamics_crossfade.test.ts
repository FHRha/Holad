import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 3 - Pairwise: Dynamics Compressor (R4) + Desktop Volume Default (R1) + Web Volume (R5)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P5-1: Compressor process graph receives scaled volume from desktop default multiplier (0.20)', () => {
    const pipeline = new WebAudioPipeline();

    // 100% volume at 20% desktop multiplier -> 0.20 final gain
    pipeline.setMasterVolume(1.0, 0.2);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.2, 4);

    // Verify signal path connects through compressor
    expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);

    pipeline.destroy();
  });

  it('P5-2: Web volume slider adjustment modulates master gain while compressor active normalization operates', () => {
    const pipeline = new WebAudioPipeline();

    // Modulate volume slider: 0.1 -> 0.5 -> 0.9 under active compressor
    const sliderPositions = [0.1, 0.5, 0.9];
    sliderPositions.forEach((pos) => {
      pipeline.setMasterVolume(pos, 1.0);
      expect(pipeline.masterGainNode.gain.value).toBeCloseTo(pos, 4);
    });

    pipeline.destroy();
  });

  it('P5-3: AudioEngine crossfade operates with loudness normalization active through entire song handover', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({ isLoudnessNormalizationEnabled: true });
    engine.setVolumeMultiplier(0.2);

    const track1 = createMockTrack('norm-cf-1', 'Loud Track 1', 180);
    const track2 = createMockTrack('norm-cf-2', 'Quiet Track 2', 200);

    await engine.playTrack(track1, { immediate: true });
    const cfPromise = engine.playTrack(track2, { immediate: false, transitionDuration: 1 });
    await cfPromise;

    expect(engine.getActiveDeckIndex()).toBe(1);
    const pipeline = engine.getWebAudioPipeline();
    if (pipeline) {
      expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);
    }

    engine.destroy();
  });

  it('P5-4: Disabling normalization during active volume slider modulation preserves clean master output', () => {
    const pipeline = new WebAudioPipeline();

    pipeline.setMasterVolume(0.7, 0.2);
    pipeline.setNormalizationEnabled(false);

    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.14, 4);

    pipeline.setNormalizationEnabled(true);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.14, 4);

    pipeline.destroy();
  });
});
