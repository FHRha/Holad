import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { VolumeManager, volumeManager } from '../../audio/VolumeManager';
import { UnifiedAudioEngine } from '../../audio/UnifiedAudioEngine';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F1: Desktop Volume Control', () => {
  beforeEach(() => {
    resetAllStores();
    volumeManager.reset();
  });

  it('F1-1: Desktop volume slider sets volume state in playerStore accurately from 0.0 to 1.0', () => {
    const store = usePlayerStore.getState();
    store.setVolume(0.0);
    expect(usePlayerStore.getState().volume).toBe(0.0);

    store.setVolume(0.42);
    expect(usePlayerStore.getState().volume).toBe(0.42);

    store.setVolume(1.0);
    expect(usePlayerStore.getState().volume).toBe(1.0);
  });

  it('F1-2: VolumeManager calculates accurate linear volume product without artificial 9% clamping', () => {
    const vm = new VolumeManager();
    vm.setMasterVolume(0.5);
    vm.setTrackVolume(1.0);
    vm.setCategoryVolume(1.0);
    expect(vm.getFinalVolume()).toBe(0.5);

    vm.setMasterVolume(1.0);
    expect(vm.getFinalVolume()).toBe(1.0);

    vm.setMasterVolume(0.0);
    expect(vm.getFinalVolume()).toBe(0.0);
  });

  it('F1-3: WebAudioCore sets GainNode target accurately when setVolume is invoked', () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.75);

    const ctx = webAudio.getAudioContext() as any;
    const gainNodes = ctx.createdNodes.filter((n: any) => n.gain !== undefined);
    expect(gainNodes.length).toBeGreaterThan(0);
    
    const masterGain = gainNodes[0];
    expect(masterGain.gain.value).toBe(0.75);
    expect(masterGain.gain.scheduledEvents.length).toBeGreaterThan(0);
    const lastEvent = masterGain.gain.scheduledEvents[masterGain.gain.scheduledEvents.length - 1];
    expect(lastEvent.type).toBe('setTargetAtTime');
    expect(lastEvent.target).toBe(0.75);

    webAudio.destroy();
  });

  it('F1-4: Volume multiplier properly updates store state up to 300% (3.0)', () => {
    const store = usePlayerStore.getState();
    store.setVolumeMultiplier(2.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(2.0);

    store.setVolumeMultiplier(3.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(3.0);

    store.setVolumeMultiplier(1.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(1.0);
  });

  it('F1-5: UnifiedAudioEngine coordinates VolumeManager and driver setVolume', () => {
    const webAudio = new WebAudioCore();
    const engine = new UnifiedAudioEngine(webAudio);

    engine.setVolume(0.6);
    expect(volumeManager.getState().master).toBe(0.6);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    expect(gainNode.gain.value).toBe(0.6);

    engine.destroy();
  });

  it('F1-6: Volume changes reflect immediately without audio clipping or NaN values', () => {
    const webAudio = new WebAudioCore();
    const testVolumes = [0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

    testVolumes.forEach((vol) => {
      webAudio.setVolume(vol);
      const ctx = webAudio.getAudioContext() as any;
      const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
      expect(gainNode.gain.value).toBe(vol);
      expect(isNaN(gainNode.gain.value)).toBe(false);
      expect(gainNode.gain.value).toBeGreaterThanOrEqual(0);
      expect(gainNode.gain.value).toBeLessThanOrEqual(1.0);
    });

    webAudio.destroy();
  });
});
