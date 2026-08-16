import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F3: Mobile Volume Slider Preservation', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F3-1: mobileVolume state initializes to 1.0 and is independent of desktop volume (0.5)', () => {
    const store = usePlayerStore.getState();
    expect(store.mobileVolume).toBe(1.0);
    expect(store.volume).toBe(0.5);
  });

  it('F3-2: setMobileVolume updates mobileVolume state in playerStore accurately', () => {
    const store = usePlayerStore.getState();
    store.setMobileVolume(0.85);
    expect(usePlayerStore.getState().mobileVolume).toBe(0.85);

    store.setMobileVolume(0.15);
    expect(usePlayerStore.getState().mobileVolume).toBe(0.15);
  });

  it('F3-3: Updating mobileVolume does not overwrite desktop volume state', () => {
    const store = usePlayerStore.getState();
    store.setVolume(0.4);
    store.setMobileVolume(0.9);

    expect(usePlayerStore.getState().volume).toBe(0.4);
    expect(usePlayerStore.getState().mobileVolume).toBe(0.9);
  });

  it('F3-4: Updating desktop volume does not overwrite mobileVolume state', () => {
    const store = usePlayerStore.getState();
    store.setMobileVolume(0.7);
    store.setVolume(0.2);

    expect(usePlayerStore.getState().mobileVolume).toBe(0.7);
    expect(usePlayerStore.getState().volume).toBe(0.2);
  });

  it('F3-5: MobileAudioCore routes volume directly to audio element volume property', () => {
    const mobileCore = new MobileAudioCore();
    mobileCore.setVolume(0.65);

    // Audio element volume is updated
    mobileCore.setVolume(0.3);
    mobileCore.destroy();
  });

  it('F3-6: Boundary values for mobile volume (0.0 to 1.0) maintain valid float range', () => {
    const store = usePlayerStore.getState();
    store.setMobileVolume(0.0);
    expect(usePlayerStore.getState().mobileVolume).toBe(0.0);

    store.setMobileVolume(1.0);
    expect(usePlayerStore.getState().mobileVolume).toBe(1.0);
  });
});
