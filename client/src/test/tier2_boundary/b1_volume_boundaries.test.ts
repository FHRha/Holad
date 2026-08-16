import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { VolumeManager } from '../../audio/VolumeManager';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 2 - B1: Volume Boundaries & Headroom Values', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('B1-1: Exact 0.0 volume sets gain to absolute silence without negative artifacts', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.0);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.0);
    expect(Object.is(gainNode.gain.value, -0)).toBe(false);

    webAudio.destroy();
  });

  it('B1-2: Ultra-low volume (0.0001) is preserved without rounding to 0', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.0001);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.0001);
    expect(gainNode.gain.value).toBeGreaterThan(0);

    webAudio.destroy();
  });

  it('B1-3: Exact midpoint volume (0.5) delivers balanced gain scaling', () => {
    const vm = new VolumeManager();
    vm.setMasterVolume(0.5);
    expect(vm.getFinalVolume()).toBe(0.5);
  });

  it('B1-4: High boundary volume (0.9999 and 1.0) achieves full unattenuated scale', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.9999);
    
    const ctx = webAudio.getAudioContext() as any;
    let gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.9999);

    webAudio.setVolume(1.0);
    expect(gainNode.gain.value).toBe(1.0);

    webAudio.destroy();
  });

  it('B1-5: Maximum 3.0x volume multiplier safely clamps or boosts headroom', () => {
    const store = usePlayerStore.getState();
    store.setVolumeMultiplier(3.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(3.0);
  });

  it('B1-6: Negative or out-of-bounds volume inputs are clamped safely', () => {
    const vm = new VolumeManager();
    vm.setMasterVolume(-0.5);
    expect(vm.getFinalVolume()).toBe(0.0);

    vm.setMasterVolume(1.5);
    expect(vm.getFinalVolume()).toBe(1.0);
  });
});
