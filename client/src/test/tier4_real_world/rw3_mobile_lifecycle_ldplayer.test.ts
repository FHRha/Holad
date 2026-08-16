import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { createMockAlbumTracks, resetAllStores } from '../helpers/testUtils';

describe('Tier 4 - RW3: Mobile First-Run Lifecycle (LD Player Android Simulation)', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('RW3-1: Complete mobile boot lifecycle strictly prevents autoplay until user initiates playback', async () => {
    const mobileCore = new MobileAudioCore();
    
    // Step 1: App Launch & Storage Hydration
    const savedQueue = createMockAlbumTracks(5);
    usePlayerStore.getState().setQueue(savedQueue);
    usePlayerStore.getState().setMobileVolume(0.8);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(mobileCore.getState()).toBe('idle');

    // Step 2: User taps around settings & navigates tabs
    useSettingsStore.getState().setStartPage('/Holad/albums');
    useSettingsStore.getState().setLanguage('en');
    usePlayerStore.getState().setMobileVolume(0.65);
    mobileCore.setVolume(0.65);

    // Audio MUST remain idle/paused
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(mobileCore.getState()).toBe('idle');

    // Step 3: Explicit User Tap on Track 2
    usePlayerStore.getState().setQueueAndPlay(savedQueue, 2);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(usePlayerStore.getState().currentIndex).toBe(2);

    await mobileCore.play(savedQueue[2].streamUrl, 0);
    expect(mobileCore.getState()).toBe('playing');

    mobileCore.destroy();
  });
});
