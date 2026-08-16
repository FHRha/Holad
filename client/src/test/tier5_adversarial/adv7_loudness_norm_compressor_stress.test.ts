import { describe, it, expect, beforeEach } from 'vitest';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement, MockAudioContext } from '../mocks/mockAudio';
import { resetAllStores, createMockTrack } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Loudness Normalization & Dynamics Compressor Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('ADV-NRM-1: Full DynamicsCompressorNode parameters verification matching Spotify / EBU R128 loudness standards', () => {
    const pipeline = new WebAudioPipeline();

    const comp = pipeline.compressorNode;
    expect(comp).toBeDefined();

    // Standard Spotify-like normalization compressor parameters:
    // Threshold: -18 dBFS
    expect(comp.threshold.value).toBe(-18);
    // Knee: 30 dB (soft knee for imperceptible compression onset)
    expect(comp.knee.value).toBe(30);
    // Ratio: 3:1 (gentle dynamic control)
    expect(comp.ratio.value).toBe(3);
    // Attack: 3ms (0.003s fast transient catching without click)
    expect(comp.attack.value).toBe(0.003);
    // Release: 250ms (0.25s smooth recovery without pumping)
    expect(comp.release.value).toBe(0.25);

    pipeline.destroy();
  });

  it('ADV-NRM-2: Dynamic switching churn (100 rapid toggles) during active dual-deck playback maintains graph continuity', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    // Rapidly toggle normalization 100 times
    for (let i = 0; i < 100; i++) {
      const enable = (i % 2 === 0);
      pipeline.setNormalizationEnabled(enable);

      // Verify master gain and analyser are intact
      expect(pipeline.masterGainNode).toBeDefined();
      expect(pipeline.analyserNode).toBeDefined();
      expect(pipeline.analyserNode.connectedTo).toContain(pipeline.context.destination);
    }

    pipeline.destroy();
  });

  it('ADV-NRM-3: WebAudio graph reconnection integrity check verifies compressor insertion and bypass', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    // When normalization is ON:
    pipeline.setNormalizationEnabled(true);
    const compNode = pipeline.compressorNode as any;
    expect(compNode.connectedTo).toContain(pipeline.masterGainNode);

    // When normalization is OFF (Bypassed):
    pipeline.setNormalizationEnabled(false);
    expect(compNode.connectedTo.length).toBe(0); // Compressor is bypassed
    expect((pipeline.masterGainNode as any).connectedTo).toContain(pipeline.analyserNode);

    pipeline.destroy();
  });

  it('ADV-NRM-4: AudioEngine updateSettings reactivity updates pipeline normalization immediately', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    const track = createMockTrack('norm-track-1', 'Loudness Test', 180);
    await engine.playTrack(track, { immediate: true });

    // Disable normalization via settings
    engine.updateSettings({ isLoudnessNormalizationEnabled: false });
    const pipeline = engine.getWebAudioPipeline() as any;
    expect(pipeline).toBeDefined();

    // Enable normalization via settings
    engine.updateSettings({ isLoudnessNormalizationEnabled: true });
    expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);

    engine.destroy();
  });

  it('ADV-NRM-5: DynamicsCompressor parameter modification handles boundary values safely', () => {
    const ctx = new MockAudioContext();
    const comp = ctx.createDynamicsCompressor();

    // Test extreme parameter assignments
    comp.threshold.setValueAtTime(-100, 0);
    expect(comp.threshold.value).toBe(-100);

    comp.threshold.setValueAtTime(0, 0);
    expect(comp.threshold.value).toBe(0);

    comp.knee.setValueAtTime(0, 0);
    expect(comp.knee.value).toBe(0);

    comp.knee.setValueAtTime(40, 0);
    expect(comp.knee.value).toBe(40);

    comp.ratio.setValueAtTime(1, 0);
    expect(comp.ratio.value).toBe(1);

    comp.ratio.setValueAtTime(20, 0);
    expect(comp.ratio.value).toBe(20);

    comp.attack.setValueAtTime(0, 0);
    expect(comp.attack.value).toBe(0);

    comp.release.setValueAtTime(1, 0);
    expect(comp.release.value).toBe(1);
  });

  it('ADV-NRM-6: Pipeline destruction cleanly disconnects compressor without dangling nodes', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    const comp = pipeline.compressorNode as any;
    const master = pipeline.masterGainNode as any;
    const analyser = pipeline.analyserNode as any;

    expect(comp.connectedTo.length).toBeGreaterThan(0);
    expect(master.connectedTo.length).toBeGreaterThan(0);

    pipeline.destroy();

    expect(comp.connectedTo.length).toBe(0);
    expect(master.connectedTo.length).toBe(0);
    expect(analyser.connectedTo.length).toBe(0);
  });
});
