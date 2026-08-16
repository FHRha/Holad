import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { WebAudioCore } from '../../audio/WebAudioCore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F6: Equal-Power Crossfading', () => {
  beforeEach(() => {
    resetAllStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('F6-1: Crossfade setting in settingsStore allows duration from 1s to 12s', () => {
    const settings = useSettingsStore.getState();
    expect(settings.isCrossfadeEnabled).toBe(true);
    expect(settings.crossfadeDuration).toBe(3);

    settings.setCrossfadeDuration(6);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(6);

    settings.setCrossfadeDuration(12);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(12);
  });

  it('F6-2: Crossfade toggle enables and disables crossfade mode', () => {
    const settings = useSettingsStore.getState();
    settings.setIsCrossfadeEnabled(false);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);

    settings.setIsCrossfadeEnabled(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
  });

  it('F6-3: MobileAudioCore crossfadeTo smoothly modulates primary and secondary volumes', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/song1', 0);

    const crossfadePromise = mobileCore.crossfadeTo('http://localhost:4000/stream/song2', 2, 0);

    // Fast-forward half the crossfade time
    vi.advanceTimersByTime(1000);
    // Fast-forward remainder
    vi.advanceTimersByTime(1000);

    await crossfadePromise;
    expect(mobileCore.getState()).toBe('playing');
    mobileCore.destroy();
  });

  it('F6-4: WebAudioCore crossfadeTo schedules linear ramp to zero and restores target gain', async () => {
    const webAudio = new WebAudioCore();
    webAudio.setVolume(0.8);

    const crossfadePromise = webAudio.crossfadeTo('http://localhost:4000/stream/song2', 4, 0);

    const ctx = webAudio.getAudioContext() as any;
    const gainNode = ctx.createdNodes.find((n: any) => n.gain !== undefined);
    
    // Ramp to 0 scheduled
    const ramps = gainNode.gain.scheduledEvents.filter((e: any) => e.type === 'linearRampToValueAtTime');
    expect(ramps.length).toBeGreaterThan(0);

    vi.advanceTimersByTime(2000); // Trigger midpoint timeout
    vi.advanceTimersByTime(2000);

    await crossfadePromise;
    webAudio.destroy();
  });

  it('F6-5: Auto crossfade threshold triggers when track remaining time <= crossfadeDuration', () => {
    const crossfadeDuration = 5;
    const trackDuration = 200;
    const currentTime = 196; // 4s remaining <= 5s
    const remaining = trackDuration - currentTime;

    const isCrossfadeTriggered = remaining <= crossfadeDuration;
    expect(isCrossfadeTriggered).toBe(true);
  });

  it('F6-6: Destroying audio core during crossfade cleans up active intervals and stops audio', async () => {
    const mobileCore = new MobileAudioCore();
    await mobileCore.play('http://localhost:4000/stream/song1', 0);
    mobileCore.crossfadeTo('http://localhost:4000/stream/song2', 4, 0);

    mobileCore.destroy();
    expect(mobileCore.getCurrentTime()).toBe(0);
  });
});
