import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProfileStore, captureCurrentProfileData, applyProfileDataToSettings, type ProfileData } from '../../store/profileStore';
import { useSettingsStore } from '../../store/settingsStore';
import * as preferencesApi from '../../api/preferences';

vi.mock('../../api/preferences', () => ({
  pushPreferences: vi.fn().mockResolvedValue(true),
  fetchPreferences: vi.fn().mockResolvedValue(null),
}));

describe('Settings Profiles (3 Custom Presets System)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({
      slots: [null, null, null],
      activeSlot: null,
      profilesUpdatedAt: 0,
    });
  });

  it('captures current settings and saves to slot 1', async () => {
    // Configure settings in store
    useSettingsStore.setState({
      isCrossfadeEnabled: true,
      crossfadeDuration: 7,
      crossfadeCurve: 'exponential',
      isGaplessEnabled: true,
      isLoudnessNormalizationEnabled: true,
      streamingQuality: 'opus-128',
      preloadLookahead: 30,
      clickAction: 'play_next',
      autoDjRepeatBehavior: 'infinite_stream',
    });

    const store = useProfileStore.getState();
    await store.saveCurrentToSlot(1, 'Мой Студийный Сетап');

    const state = useProfileStore.getState();
    expect(state.slots[0]).not.toBeNull();
    expect(state.slots[0]?.name).toBe('Мой Студийный Сетап');
    expect(state.slots[0]?.slot).toBe(1);
    expect(state.slots[0]?.data.crossfadeDuration).toBe(7);
    expect(state.slots[0]?.data.streamingQuality).toBe('opus-128');
    expect(state.slots[0]?.data.clickAction).toBe('play_next');
    expect(state.activeSlot).toBe(1);

    // Verify pushPreferences was called to sync to server DB
    expect(preferencesApi.pushPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: expect.stringContaining('Мой Студийный Сетап'),
      })
    );
  });

  it('applies a saved slot back to useSettingsStore', async () => {
    const customData: ProfileData = {
      isCrossfadeEnabled: true,
      crossfadeDuration: 10,
      crossfadeCurve: 'equalPower',
      isGaplessEnabled: true,
      isLoudnessNormalizationEnabled: false,
      compressorThreshold: -24,
      compressorRatio: 4,
      compressorAttack: 0.003,
      compressorRelease: 0.25,
      streamingQuality: 'raw',
      preloadNextTrack: true,
      preloadLookahead: 15,
      preloadMode: 'always',
      clickAction: 'play_now',
      autoDjRepeatBehavior: 'pause_on_repeat',
      autoResumeOnHeadphonesConnect: true,
    };

    useProfileStore.setState({
      slots: [
        { slot: 1, name: 'Hi-Fi Pure', data: customData, updatedAt: Date.now() },
        null,
        null,
      ],
      activeSlot: null,
    });

    // Reset settings store to different values
    useSettingsStore.setState({
      crossfadeDuration: 2,
      streamingQuality: 'opus-128',
      preloadLookahead: 5,
    });

    // Apply slot 1
    useProfileStore.getState().applySlot(1);

    expect(useProfileStore.getState().activeSlot).toBe(1);
    expect(useSettingsStore.getState().crossfadeDuration).toBe(10);
    expect(useSettingsStore.getState().streamingQuality).toBe('raw');
    expect(useSettingsStore.getState().preloadLookahead).toBe(15);
  });

  it('renames a profile slot and pushes update to server', async () => {
    useProfileStore.setState({
      slots: [
        { slot: 1, name: 'Old Name', data: captureCurrentProfileData(), updatedAt: Date.now() },
        null,
        null,
      ],
      activeSlot: 1,
    });

    await useProfileStore.getState().renameSlot(1, 'New Car Profile');

    const state = useProfileStore.getState();
    expect(state.slots[0]?.name).toBe('New Car Profile');
    expect(preferencesApi.pushPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: expect.stringContaining('New Car Profile'),
      })
    );
  });

  it('clears a slot and updates activeSlot if cleared slot was active', async () => {
    useProfileStore.setState({
      slots: [
        { slot: 1, name: 'Slot 1', data: captureCurrentProfileData(), updatedAt: Date.now() },
        { slot: 2, name: 'Slot 2', data: captureCurrentProfileData(), updatedAt: Date.now() },
        null,
      ],
      activeSlot: 1,
    });

    await useProfileStore.getState().clearSlot(1);

    const state = useProfileStore.getState();
    expect(state.slots[0]).toBeNull();
    expect(state.slots[1]).not.toBeNull();
    expect(state.activeSlot).toBeNull();
  });

  it('syncWithServerProfiles respects Database priority when server is newer', () => {
    const serverProfiles = [
      { slot: 1, name: 'Server Profile 1', data: captureCurrentProfileData(), updatedAt: 2000 },
      { slot: 2, name: 'Server Profile 2', data: captureCurrentProfileData(), updatedAt: 2000 },
    ];

    useProfileStore.setState({
      slots: [null, null, null],
      profilesUpdatedAt: 1000,
    });

    useProfileStore.getState().syncWithServerProfiles(serverProfiles, 2000);

    const state = useProfileStore.getState();
    expect(state.slots[0]?.name).toBe('Server Profile 1');
    expect(state.slots[1]?.name).toBe('Server Profile 2');
    expect(state.slots[2]).toBeNull();
  });

  it('syncWithServerProfiles resolves offline edits by pushing local profiles if local is newer', () => {
    const localData = captureCurrentProfileData();
    useProfileStore.setState({
      slots: [
        { slot: 1, name: 'Offline Edited Profile', data: localData, updatedAt: 5000 },
        null,
        null,
      ],
      profilesUpdatedAt: 5000,
    });

    const staleServerProfiles = [
      { slot: 1, name: 'Stale Server Profile', data: localData, updatedAt: 2000 },
    ];

    useProfileStore.getState().syncWithServerProfiles(staleServerProfiles, 2000);

    // Should NOT overwrite local! Should upload local instead
    expect(useProfileStore.getState().slots[0]?.name).toBe('Offline Edited Profile');
    expect(preferencesApi.pushPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        profiles: expect.stringContaining('Offline Edited Profile'),
      })
    );
  });

  it('SSOT: server profiles take priority when local slots are all null even if localUpdatedAt > serverUpdatedAt', () => {
    const serverProfiles = [
      { slot: 1, name: 'Server Master HiFi', data: captureCurrentProfileData(), updatedAt: 100 },
      null,
      null,
    ];

    // Local client has all null slots, but localUpdatedAt is mistakenly large (e.g. newly initialized store)
    useProfileStore.setState({
      slots: [null, null, null],
      profilesUpdatedAt: 999999,
    });

    useProfileStore.getState().syncWithServerProfiles(serverProfiles, 100);

    // Server profiles MUST be applied, NOT overwritten with empty slots!
    const state = useProfileStore.getState();
    expect(state.slots[0]?.name).toBe('Server Master HiFi');
    expect(state.slots[1]).toBeNull();
    expect(state.slots[2]).toBeNull();
    // pushPreferences should NOT have been called with empty slots
    expect(preferencesApi.pushPreferences).not.toHaveBeenCalled();
  });
});
