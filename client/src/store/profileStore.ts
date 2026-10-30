import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSettingsStore, type StreamingQuality, type PreloadMode, type PreloadLookahead, type ClickAction, type AutoDjRepeatBehavior } from './settingsStore';
import type { CrossfadeCurve } from '../audio/types';
import { pushPreferences } from '../api/preferences';

export interface ProfileData {
  isCrossfadeEnabled: boolean;
  crossfadeDuration: number;
  crossfadeCurve: CrossfadeCurve;
  crossfadeTension?: { x: number; y: number };
  isGaplessEnabled: boolean;
  isLoudnessNormalizationEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  streamingQuality: StreamingQuality;
  preloadNextTrack: boolean;
  preloadLookahead: PreloadLookahead;
  preloadMode: PreloadMode;
  clickAction: ClickAction;
  autoDjRepeatBehavior: AutoDjRepeatBehavior;
  autoResumeOnHeadphonesConnect: boolean;
}

export interface ProfileSlot {
  slot: 1 | 2 | 3;
  name: string;
  data: ProfileData;
  updatedAt: number;
}

export interface ProfileState {
  slots: [ProfileSlot | null, ProfileSlot | null, ProfileSlot | null];
  activeSlot: 1 | 2 | 3 | null;
  profilesUpdatedAt: number;

  saveCurrentToSlot: (slot: 1 | 2 | 3, name: string) => Promise<void>;
  applySlot: (slot: 1 | 2 | 3) => void;
  renameSlot: (slot: 1 | 2 | 3, newName: string) => Promise<void>;
  clearSlot: (slot: 1 | 2 | 3) => Promise<void>;
  syncWithServerProfiles: (rawProfiles: string | (ProfileSlot | null)[], serverUpdatedAt?: number) => void;
}

export function captureCurrentProfileData(): ProfileData {
  const s = useSettingsStore.getState();
  return {
    isCrossfadeEnabled: s.isCrossfadeEnabled,
    crossfadeDuration: s.crossfadeDuration,
    crossfadeCurve: s.crossfadeCurve,
    crossfadeTension: s.crossfadeTension ? { ...s.crossfadeTension } : undefined,
    isGaplessEnabled: s.isGaplessEnabled,
    isLoudnessNormalizationEnabled: s.isLoudnessNormalizationEnabled,
    compressorThreshold: s.compressorThreshold,
    compressorRatio: s.compressorRatio,
    compressorAttack: s.compressorAttack,
    compressorRelease: s.compressorRelease,
    streamingQuality: s.streamingQuality,
    preloadNextTrack: s.preloadNextTrack,
    preloadLookahead: s.preloadLookahead,
    preloadMode: s.preloadMode,
    clickAction: s.clickAction,
    autoDjRepeatBehavior: s.autoDjRepeatBehavior,
    autoResumeOnHeadphonesConnect: s.autoResumeOnHeadphonesConnect,
  };
}

export function applyProfileDataToSettings(data: ProfileData): void {
  const s = useSettingsStore.getState();
  if (data.isCrossfadeEnabled !== undefined) s.setIsCrossfadeEnabled(data.isCrossfadeEnabled);
  if (data.crossfadeDuration !== undefined) s.setCrossfadeDuration(data.crossfadeDuration);
  if (data.crossfadeCurve !== undefined) s.setCrossfadeCurve(data.crossfadeCurve);
  if (data.crossfadeTension !== undefined) s.setCrossfadeTension(data.crossfadeTension);
  if (data.isGaplessEnabled !== undefined) s.setIsGaplessEnabled(data.isGaplessEnabled);
  if (data.isLoudnessNormalizationEnabled !== undefined) s.setIsLoudnessNormalizationEnabled(data.isLoudnessNormalizationEnabled);
  if (data.compressorThreshold !== undefined) s.setCompressorThreshold(data.compressorThreshold);
  if (data.compressorRatio !== undefined) s.setCompressorRatio(data.compressorRatio);
  if (data.compressorAttack !== undefined) s.setCompressorAttack(data.compressorAttack);
  if (data.compressorRelease !== undefined) s.setCompressorRelease(data.compressorRelease);
  if (data.streamingQuality !== undefined) s.setStreamingQuality(data.streamingQuality);
  if (data.preloadNextTrack !== undefined) s.setPreloadNextTrack(data.preloadNextTrack);
  if (data.preloadLookahead !== undefined) s.setPreloadLookahead(data.preloadLookahead);
  if (data.preloadMode !== undefined) s.setPreloadMode(data.preloadMode);
  if (data.clickAction !== undefined) s.setClickAction(data.clickAction);
  if (data.autoDjRepeatBehavior !== undefined) s.setAutoDjRepeatBehavior(data.autoDjRepeatBehavior);
  if (data.autoResumeOnHeadphonesConnect !== undefined) s.setAutoResumeOnHeadphonesConnect(data.autoResumeOnHeadphonesConnect);
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      slots: [null, null, null],
      activeSlot: null,
      profilesUpdatedAt: 0,

      saveCurrentToSlot: async (slot, name) => {
        const data = captureCurrentProfileData();
        const now = Date.now();
        const newSlot: ProfileSlot = {
          slot,
          name: name.trim() || `Профиль ${slot}`,
          data,
          updatedAt: now,
        };

        const currentSlots = [...get().slots] as [ProfileSlot | null, ProfileSlot | null, ProfileSlot | null];
        currentSlots[slot - 1] = newSlot;

        set({
          slots: currentSlots,
          activeSlot: slot,
          profilesUpdatedAt: now,
        });

        // Persist to SQLite Server
        pushPreferences({
          profiles: JSON.stringify(currentSlots),
        }).catch((err) => console.warn('[ProfileStore] Failed to push profiles to server:', err));
      },

      applySlot: (slot) => {
        const target = get().slots[slot - 1];
        if (!target) return;
        applyProfileDataToSettings(target.data);
        set({ activeSlot: slot });
      },

      renameSlot: async (slot, newName) => {
        const current = get().slots[slot - 1];
        if (!current) return;
        const now = Date.now();
        const updatedSlot: ProfileSlot = {
          ...current,
          name: newName.trim() || current.name,
          updatedAt: now,
        };
        const currentSlots = [...get().slots] as [ProfileSlot | null, ProfileSlot | null, ProfileSlot | null];
        currentSlots[slot - 1] = updatedSlot;

        set({
          slots: currentSlots,
          profilesUpdatedAt: now,
        });

        pushPreferences({
          profiles: JSON.stringify(currentSlots),
        }).catch((err) => console.warn('[ProfileStore] Failed to push renamed profile:', err));
      },

      clearSlot: async (slot) => {
        const currentSlots = [...get().slots] as [ProfileSlot | null, ProfileSlot | null, ProfileSlot | null];
        currentSlots[slot - 1] = null;
        const now = Date.now();

        set({
          slots: currentSlots,
          activeSlot: get().activeSlot === slot ? null : get().activeSlot,
          profilesUpdatedAt: now,
        });

        pushPreferences({
          profiles: JSON.stringify(currentSlots),
        }).catch((err) => console.warn('[ProfileStore] Failed to clear profile slot on server:', err));
      },

      syncWithServerProfiles: (rawProfiles, serverUpdatedAt = 0) => {
        if (!rawProfiles) return;
        try {
          const parsed = typeof rawProfiles === 'string' ? JSON.parse(rawProfiles) : rawProfiles;
          if (!Array.isArray(parsed)) return;

          const localUpdatedAt = get().profilesUpdatedAt || 0;
          const localSlots = get().slots;
          const hasLocalProfiles = localSlots.some((s) => s !== null);
          const hasServerProfiles = parsed.some((item) => item && typeof item === 'object' && item.name && item.data);

          // SSOT Priority: If server has at least one valid profile slot, and local has NO profiles (all null),
          // server ALWAYS takes priority (SSOT), regardless of localUpdatedAt. Never overwrite server profiles with empty slots!
          if (!hasLocalProfiles && hasServerProfiles) {
            // Server always takes priority over empty local slots
          } else if (hasLocalProfiles && !hasServerProfiles && localUpdatedAt > serverUpdatedAt) {
            // Local has profiles, but server has none: push local profiles to server
            pushPreferences({
              profiles: JSON.stringify(localSlots),
            }).catch(() => {});
            return;
          } else if (localUpdatedAt > serverUpdatedAt && localUpdatedAt > 0 && hasLocalProfiles) {
            // Priority: Database (SSOT). If local has newer un-synced offline edits, push local to server.
            console.log('[ProfileStore] Local profiles are newer than server DB, uploading local profiles...');
            pushPreferences({
              profiles: JSON.stringify(localSlots),
            }).catch(() => {});
            return;
          }

          // Otherwise, apply server profiles to store
          const sanitizedSlots: [ProfileSlot | null, ProfileSlot | null, ProfileSlot | null] = [null, null, null];
          for (let i = 0; i < 3; i++) {
            const item = parsed[i];
            if (item && typeof item === 'object' && item.name && item.data) {
              sanitizedSlots[i] = {
                slot: (i + 1) as 1 | 2 | 3,
                name: item.name,
                data: item.data,
                updatedAt: item.updatedAt || serverUpdatedAt || Date.now(),
              };
            }
          }

          // Verify if activeSlot is still valid
          const currentActive = get().activeSlot;
          const nextActive = currentActive && sanitizedSlots[currentActive - 1] ? currentActive : null;

          set({
            slots: sanitizedSlots,
            activeSlot: nextActive,
            profilesUpdatedAt: (!hasLocalProfiles && hasServerProfiles)
              ? (serverUpdatedAt || Date.now())
              : Math.max(serverUpdatedAt, localUpdatedAt),
          });
        } catch (e) {
          console.warn('[ProfileStore] Error parsing server profiles:', e);
        }
      },
    }),
    {
      name: 'holad-settings-profiles',
    }
  )
);
