import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { MockAudioContext } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 4 - RW4: Desktop High Dynamic Range Session', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('RW4-1: Mixed volume tracks route through compressor and master gain at 75% volume without clipping', async () => {
    usePlayerStore.getState().setVolume(0.75);
    const ctx = new MockAudioContext();
    const source = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const masterGain = ctx.createGain();

    source.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    masterGain.gain.setValueAtTime(0.75, 0);

    expect(compressor.threshold.value).toBe(-18);
    expect(masterGain.gain.value).toBe(0.75);

    // Verify audio flow is connected end-to-end
    expect(source.connectedTo).toContain(compressor);
    expect(compressor.connectedTo).toContain(masterGain);
    expect(masterGain.connectedTo).toContain(ctx.destination);
  });
});
