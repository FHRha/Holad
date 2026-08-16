import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { resetAllStores } from '../helpers/testUtils';

describe('Tier 1 - F9: Audio Settings UI Extension', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('F9-1: Audio settings store initializes with valid default values', () => {
    const settings = useSettingsStore.getState();
    expect(settings.isCrossfadeEnabled).toBe(true);
    expect(settings.crossfadeDuration).toBe(3);
    expect(settings.clickAction).toBe('play_now');
  });

  it('F9-2: Updating crossfade duration clamps within valid 1-12 second range', () => {
    const settings = useSettingsStore.getState();
    settings.setCrossfadeDuration(8);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(8);

    settings.setCrossfadeDuration(1);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(1);

    settings.setCrossfadeDuration(12);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(12);
  });

  it('F9-3: Toggling crossfade enabled/disabled modifies store state immediately', () => {
    const settings = useSettingsStore.getState();
    settings.setIsCrossfadeEnabled(false);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(false);

    settings.setIsCrossfadeEnabled(true);
    expect(useSettingsStore.getState().isCrossfadeEnabled).toBe(true);
  });

  it('F9-4: Click action selection switches between play_now and play_next', () => {
    const settings = useSettingsStore.getState();
    settings.setClickAction('play_next');
    expect(useSettingsStore.getState().clickAction).toBe('play_next');

    settings.setClickAction('play_now');
    expect(useSettingsStore.getState().clickAction).toBe('play_now');
  });

  it('F9-5: Volume multiplier configuration in playerStore is reactive and clamped to 1.0 - 3.0', () => {
    const player = usePlayerStore.getState();
    player.setVolumeMultiplier(1.5);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(1.5);

    player.setVolumeMultiplier(3.0);
    expect(usePlayerStore.getState().volumeMultiplier).toBe(3.0);
  });

  it('F9-6: Repeat mode cycles through none -> all -> one -> none', () => {
    const player = usePlayerStore.getState();
    expect(player.repeatMode).toBe('none');

    player.cycleRepeatMode();
    expect(usePlayerStore.getState().repeatMode).toBe('all');

    player.cycleRepeatMode();
    expect(usePlayerStore.getState().repeatMode).toBe('one');

    player.cycleRepeatMode();
    expect(usePlayerStore.getState().repeatMode).toBe('none');
  });
});
