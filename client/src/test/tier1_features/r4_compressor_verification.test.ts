import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { AudioEngine } from '../../audio/AudioEngine';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - R4: DynamicsCompressorNode Verification & Output Dynamics', () => {
  beforeEach(() => {
    resetAllStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('R4-1: WebAudioPipeline initializes DynamicsCompressorNode in audio graph', () => {
    const pipeline = new WebAudioPipeline();

    expect(pipeline.compressorNode).toBeDefined();
    expect(pipeline.compressorNode.threshold).toBeDefined();
    expect(pipeline.compressorNode.ratio).toBeDefined();

    pipeline.destroy();
  });

  it('R4-2: DynamicsCompressorNode parameters match audio dynamics specifications', () => {
    const pipeline = new WebAudioPipeline();

    // Verify standard audio compressor values for loudness normalization
    expect(pipeline.compressorNode.threshold.value).toBe(-18);
    expect(pipeline.compressorNode.knee.value).toBe(30);
    expect(pipeline.compressorNode.ratio.value).toBe(3);
    expect(pipeline.compressorNode.attack.value).toBeCloseTo(0.003, 4);
    expect(pipeline.compressorNode.release.value).toBeCloseTo(0.25, 4);

    pipeline.destroy();
  });

  it('R4-3: Compressor is correctly connected between Deck Gains and Master Gain when normalization is enabled', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    pipeline.setNormalizationEnabled(true);

    // Verify connections
    const deckGains = (pipeline as any).deckGains;
    expect(deckGains[0].connectedTo).toContain(pipeline.compressorNode);
    expect(deckGains[1].connectedTo).toContain(pipeline.compressorNode);
    expect(pipeline.compressorNode.connectedTo).toContain(pipeline.masterGainNode);

    pipeline.destroy();
  });

  it('R4-4: Disabling loudness normalization bypasses CompressorNode directly to MasterGainNode', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    pipeline.setNormalizationEnabled(false);

    // Verify bypass connection: deck gains connect directly to master gain
    const deckGains = (pipeline as any).deckGains;
    expect(deckGains[0].connectedTo).toContain(pipeline.masterGainNode);
    expect(deckGains[1].connectedTo).toContain(pipeline.masterGainNode);
    expect(deckGains[0].connectedTo).not.toContain(pipeline.compressorNode);

    pipeline.destroy();
  });

  it('R4-5: AudioEngine propagates loudness normalization setting changes to WebAudioPipeline dynamically', () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const engine = new AudioEngine([el0, el1]);

    engine.updateSettings({ isLoudnessNormalizationEnabled: false });
    let pipeline = engine.getWebAudioPipeline() as WebAudioPipeline;
    let deckGains = (pipeline as any).deckGains;
    expect(deckGains[0].connectedTo).toContain(pipeline.masterGainNode);

    engine.updateSettings({ isLoudnessNormalizationEnabled: true });
    deckGains = (pipeline as any).deckGains;
    expect(deckGains[0].connectedTo).toContain(pipeline.compressorNode);

    engine.destroy();
  });

  it('R4-6: WebAudioPipeline destruction cleans up compressor node connections cleanly', () => {
    const pipeline = new WebAudioPipeline();
    pipeline.destroy();

    expect(pipeline.compressorNode.connectedTo.length).toBe(0);
  });
});
