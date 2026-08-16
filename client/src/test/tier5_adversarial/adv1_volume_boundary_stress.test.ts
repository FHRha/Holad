import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { AudioEngine } from '../../audio/AudioEngine';
import { WebAudioPipeline } from '../../audio/WebAudioPipeline';
import { VolumeManager, volumeManager } from '../../audio/VolumeManager';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { createMockAudioElement } from '../mocks/mockAudio';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 5 Adversarial: Desktop Volume & Boundary Stress Testing', () => {
  beforeEach(() => {
    resetAllStores();
    volumeManager.reset();
  });

  it('ADV-VOL-1: Rapid volume churn (1000 iterations) maintains finite, clamped values in Web Audio pipeline', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    // Blast 1000 rapid volume updates across full range including edge values
    for (let i = 0; i < 1000; i++) {
      const vol = (i % 100) / 100; // 0.0 to 0.99
      const multiplier = 1.0 + ((i % 20) / 10); // 1.0 to 2.9
      pipeline.setMasterVolume(vol, multiplier);

      const gainValue = pipeline.masterGainNode.gain.value;
      expect(Number.isFinite(gainValue)).toBe(true);
      expect(isNaN(gainValue)).toBe(false);
      expect(gainValue).toBeGreaterThanOrEqual(0.0);
      expect(gainValue).toBeCloseTo(vol * multiplier, 2);
    }

    pipeline.destroy();
  });

  it('ADV-VOL-2: Extreme adversarial volume inputs (negative, NaN, Infinity, overflow) clamp safely without throwing', () => {
    const pipeline = new WebAudioPipeline();
    const engine = new AudioEngine([createMockAudioElement(), createMockAudioElement()]);

    const adversarialInputs = [
      -100, -1, -0.00001, -0.0,
      NaN, Infinity, -Infinity,
      1.0001, 2.5, 9999,
      undefined as any, null as any, '0.5' as any, {} as any
    ];

    adversarialInputs.forEach((input) => {
      expect(() => {
        engine.setVolume(input);
      }).not.toThrow();

      expect(() => {
        pipeline.setMasterVolume(input, 1.0);
      }).not.toThrow();

      const gainVal = pipeline.masterGainNode.gain.value;
      expect(Number.isFinite(gainVal)).toBe(true);
      expect(isNaN(gainVal)).toBe(false);
      expect(gainVal).toBeGreaterThanOrEqual(0.0);
    });

    engine.destroy();
    pipeline.destroy();
  });

  it('ADV-VOL-3: Volume boost multiplier boundaries (0.0 to 3.0+) scale accurately without signal distortion or attenuation', () => {
    const store = usePlayerStore.getState();
    const pipeline = new WebAudioPipeline();

    // Verify 100% volume at 3.0x multiplier produces 3.0 gain without 9% clamping
    store.setVolume(1.0);
    store.setVolumeMultiplier(3.0);
    pipeline.setMasterVolume(1.0, 3.0);

    expect(usePlayerStore.getState().volume).toBe(1.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(3.0);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(3.0, 2);

    // Verify midpoint 0.5 volume at 2.0x multiplier produces 1.0 gain
    store.setVolume(0.5);
    store.setVolumeMultiplier(2.0);
    pipeline.setMasterVolume(0.5, 2.0);

    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(1.0, 2);

    // Verify silence (0.0 volume) at 3.0x multiplier remains absolute silence (0.0)
    store.setVolume(0.0);
    store.setVolumeMultiplier(3.0);
    pipeline.setMasterVolume(0.0, 3.0);

    expect(pipeline.masterGainNode.gain.value).toBe(0.0);

    pipeline.destroy();
  });

  it('ADV-VOL-4: Concurrent deck gain adjustments during crossfade do not desynchronize master gain', () => {
    const pipeline = new WebAudioPipeline();
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    pipeline.attachDeck(0, el0);
    pipeline.attachDeck(1, el1);

    // Ramp deck gains while concurrently changing master volume
    pipeline.setDeckGain(0, 0.707, 0.05);
    pipeline.setDeckGain(1, 0.707, 0.05);
    pipeline.setMasterVolume(0.8, 1.2, 0.05);

    expect(pipeline.getDeckGain(0)).toBeCloseTo(0.707, 3);
    expect(pipeline.getDeckGain(1)).toBeCloseTo(0.707, 3);
    expect(pipeline.masterGainNode.gain.value).toBeCloseTo(0.96, 2);

    pipeline.destroy();
  });

  it('ADV-VOL-5: VolumeManager multi-layer category and track attenuation stress validation', () => {
    const vm = new VolumeManager();

    // Random walk volume test over 500 steps
    let currentMaster = 0.5;
    for (let step = 0; step < 500; step++) {
      const delta = (Math.random() - 0.5) * 0.2;
      currentMaster = Math.max(0, Math.min(1, currentMaster + delta));
      vm.setMasterVolume(currentMaster);

      const finalVol = vm.getFinalVolume();
      expect(finalVol).toBeGreaterThanOrEqual(0.0);
      expect(finalVol).toBeLessThanOrEqual(1.0);
      expect(isNaN(finalVol)).toBe(false);
      expect(finalVol).toBeCloseTo(currentMaster, 4);
    }
  });

  it('ADV-VOL-6: Rapid linear ramp scheduling cancellations do not throw in WebAudioCore', () => {
    const webAudio = new WebAudioCore();

    for (let i = 0; i < 100; i++) {
      const targetVol = (i % 2 === 0) ? 0.0 : 1.0;
      webAudio.setVolume(targetVol);
    }

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(1.0);
    expect(Number.isFinite(gainNode.gain.value)).toBe(true);

    webAudio.destroy();
  });
});
