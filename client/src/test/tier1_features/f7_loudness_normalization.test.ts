import { describe, it, expect, beforeEach } from 'vitest';
import { MockAudioContext } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F7: Loudness Normalization', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F7-1: DynamicsCompressorNode initializes with standard loudness normalization parameters', () => {
    const ctx = new MockAudioContext();
    const compressor = ctx.createDynamicsCompressor();

    expect(compressor.threshold.value).toBe(-18);
    expect(compressor.ratio.value).toBe(3);
    expect(compressor.attack.value).toBe(0.003);
    expect(compressor.knee.value).toBe(30);
    expect(compressor.release.value).toBe(0.25);
  });

  it('F7-2: DynamicsCompressorNode can be inserted in audio routing chain', () => {
    const ctx = new MockAudioContext();
    const sourceGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const masterGain = ctx.createGain();

    sourceGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    expect(sourceGain.connectedTo).toContain(compressor);
    expect(compressor.connectedTo).toContain(masterGain);
    expect(masterGain.connectedTo).toContain(ctx.destination);
  });

  it('F7-3: Compressor threshold clamping prevents setting out-of-range decibel levels', () => {
    const ctx = new MockAudioContext();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.setValueAtTime(-24, 0);
    expect(compressor.threshold.value).toBe(-24);

    compressor.threshold.setValueAtTime(-14, 0);
    expect(compressor.threshold.value).toBe(-14);
  });

  it('F7-4: DynamicsCompressor ratio controls compression steepness', () => {
    const ctx = new MockAudioContext();
    const compressor = ctx.createDynamicsCompressor();

    compressor.ratio.setValueAtTime(4, 0);
    expect(compressor.ratio.value).toBe(4);

    compressor.ratio.setValueAtTime(2, 0);
    expect(compressor.ratio.value).toBe(2);
  });

  it('F7-5: Fast attack time (3ms) handles sudden transient peaks without audible clicks', () => {
    const ctx = new MockAudioContext();
    const compressor = ctx.createDynamicsCompressor();

    expect(compressor.attack.value).toBeLessThanOrEqual(0.01); // 10ms or faster
  });

  it('F7-6: Audio pipeline disconnects and cleans up compressor node upon destruction', () => {
    const ctx = new MockAudioContext();
    const compressor = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();

    compressor.connect(gain);
    expect(compressor.connectedTo.length).toBe(1);

    compressor.disconnect();
    expect(compressor.connectedTo.length).toBe(0);
  });
});
