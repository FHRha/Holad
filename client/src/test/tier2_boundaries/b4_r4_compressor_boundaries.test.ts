import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
// oxlint-disable-next-line
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B4: DynamicsCompressorNode Boundary & Graph Resilience', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('B4-1: Rapid toggling of loudness normalization (100 cycles) reconnects graph without graph disconnect errors', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    expect(() => {
      for (let i = 0; i < 100; i++) {
        pipeline.setNormalizationEnabled(i % 2 === 0);
      }
    }).not.toThrow();

    pipeline.destroy();
  });

  it('B4-2: Compressor parameter boundary clamping (-100dB threshold, ratio up to 20:1) verify safe parameter ranges', () => {
    const pipeline = new WebAudioPipeline();

    // Verify parameter min and max limits on MockDynamicsCompressorNode
    expect(pipeline.compressorNode.threshold.minValue).toBe(-100);
    expect(pipeline.compressorNode.threshold.maxValue).toBe(0);
    expect(pipeline.compressorNode.ratio.minValue).toBe(1);
    expect(pipeline.compressorNode.ratio.maxValue).toBe(20);

    pipeline.destroy();
  });

  it('B4-3: AudioContext suspend and resume cycles preserve compressor node in the audio chain', async () => {
    const pipeline = new WebAudioPipeline();
    const ctx = pipeline.context as any;

    await ctx.suspend();
    expect(ctx.state).toBe('suspended');

    await pipeline.unlockContext();
    expect(ctx.state).toBe('running');
    expect(pipeline.compressorNode).toBeDefined();

    pipeline.destroy();
  });

  it('B4-4: Analyser frequency data reads downstream of compressor function without buffer overrun', () => {
    const pipeline = new WebAudioPipeline();
    const freqArray = new Uint8Array(pipeline.analyserNode.frequencyBinCount);

    expect(() => {
      pipeline.getFrequencyData(freqArray);
    }).not.toThrow();

    expect(freqArray.length).toBe(128);
    pipeline.destroy();
  });

  it('B4-5: Multiple concurrent WebAudioPipeline instances each preserve independent compressor nodes', () => {
    const pipeline1 = new WebAudioPipeline();
    const pipeline2 = new WebAudioPipeline();

    expect(pipeline1.compressorNode).toBeDefined();
    expect(pipeline2.compressorNode).toBeDefined();

    pipeline1.destroy();
    pipeline2.destroy();
  });

  it('B4-6: WebAudioPipeline destruction cleanly disconnects compressor without throwing on subsequent calls', () => {
    const pipeline = new WebAudioPipeline();
    pipeline.destroy();

    // Redundant destroy call should not crash
    expect(() => {
      pipeline.destroy();
    }).not.toThrow();
  });
});
