import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from 'i18next';
import type { CrossfadeCurve } from '../audio/types';
import { setImageCacheLimit } from '../utils/imageCache';
import { applyAppIcon } from '../utils/appIconHelper';

export type AppTheme = 'dark' | 'light' | 'system';
export type AppIcon = 'wave_dark' | 'wave_light' | 'cassette';
export type AccentColor = string;
export type ClickAction = 'play_now' | 'play_next';
export type StartPage = '/Holad' | '/Holad/albums' | '/Holad/radio' | '/Holad/favorites';

export interface SettingsState {
  theme: AppTheme;
  appIcon: AppIcon;
  accentColor: AccentColor;
  customColors: [string, string, string];
  language: string;
  clickAction: ClickAction;
  startPage: StartPage;
  isCrossfadeEnabled: boolean;
  crossfadeDuration: number;
  crossfadeCurve: CrossfadeCurve;
  isGaplessEnabled: boolean;
  isLoudnessNormalizationEnabled: boolean;
  preloadNextTrack: boolean;
  runOnStartup: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  imageCacheLimitMb: number;
  totalStorageLimitGb: number;
  maxDownloadConcurrency: number;
  hideOfflineExplanationModal: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  
  useNavidrome: boolean;
  useLastFm: boolean;
  useYandex: boolean;
  lastFmKey: string;
  yandexToken: string;

  setTheme: (theme: AppTheme) => void;
  setAppIcon: (appIcon: AppIcon) => void;
  setAccentColor: (color: AccentColor) => void;
  setCustomColor: (index: number, color: string) => void;
  setLanguage: (lang: string) => void;
  setClickAction: (action: ClickAction) => void;
  setStartPage: (page: StartPage) => void;
  setIsCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  setCrossfadeCurve: (curve: CrossfadeCurve) => void;
  setIsGaplessEnabled: (enabled: boolean) => void;
  setIsLoudnessNormalizationEnabled: (enabled: boolean) => void;
  setPreloadNextTrack: (enabled: boolean) => void;
  setRunOnStartup: (enabled: boolean) => void;
  setStartMinimized: (enabled: boolean) => void;
  setCloseToTray: (enabled: boolean) => void;
  setImageCacheLimitMb: (limitMb: number) => void;
  setTotalStorageLimitGb: (limitGb: number) => void;
  setMaxDownloadConcurrency: (concurrency: number) => void;
  setHideOfflineExplanationModal: (hide: boolean) => void;
  setCompressorThreshold: (threshold: number) => void;
  setCompressorRatio: (ratio: number) => void;
  setCompressorAttack: (attack: number) => void;
  setCompressorRelease: (release: number) => void;

  setUseNavidrome: (enabled: boolean) => void;
  setUseLastFm: (enabled: boolean) => void;
  setUseYandex: (enabled: boolean) => void;
  setLastFmKey: (key: string) => void;
  setYandexToken: (token: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      appIcon: 'wave_dark',
      accentColor: 'green',
      customColors: ['', '', ''],
      language: i18n.language || 'ru',
      clickAction: 'play_now',
      startPage: '/Holad',
      isCrossfadeEnabled: true,
      crossfadeDuration: 3,
      crossfadeCurve: 'equalPower',
      isGaplessEnabled: false,
      isLoudnessNormalizationEnabled: false,
      preloadNextTrack: true,
      runOnStartup: true,
      startMinimized: true,
      closeToTray: true,
      imageCacheLimitMb: 256,
      totalStorageLimitGb: 10,
      maxDownloadConcurrency: 3,
      hideOfflineExplanationModal: false,
      compressorThreshold: -24,
      compressorRatio: 12,
      compressorAttack: 0.01,
      compressorRelease: 0.25,
      
      useNavidrome: true,
      useLastFm: false,
      useYandex: false,
      lastFmKey: '',
      yandexToken: '',

      setTheme: (theme) => set((state) => {
        let nextAppIcon = state.appIcon;
        if (state.appIcon !== 'cassette') {
          if (theme === 'dark') nextAppIcon = 'wave_dark';
          else if (theme === 'light') nextAppIcon = 'wave_light';
        }
        applyAppIcon(nextAppIcon);
        return { theme, appIcon: nextAppIcon };
      }),
      setAppIcon: (appIcon) => {
        applyAppIcon(appIcon);
        set({ appIcon });
      },
      setAccentColor: (accentColor) => set({ accentColor }),
      setCustomColor: (index, color) => set((state) => {
        const newColors = [...state.customColors] as [string, string, string];
        newColors[index] = color;
        return { customColors: newColors };
      }),
      setLanguage: (language) => {
        i18n.changeLanguage(language);
        set({ language });
      },
      setClickAction: (clickAction) => set({ clickAction }),
      setStartPage: (startPage) => set({ startPage }),
      setIsCrossfadeEnabled: (isCrossfadeEnabled) => set((state) => ({
        isCrossfadeEnabled,
        isGaplessEnabled: isCrossfadeEnabled ? false : state.isGaplessEnabled,
      })),
      setCrossfadeDuration: (crossfadeDuration) => set({ crossfadeDuration: Math.max(1, Math.min(12, crossfadeDuration)) }),
      setCrossfadeCurve: (crossfadeCurve) => set({ crossfadeCurve }),
      setIsGaplessEnabled: (isGaplessEnabled) => set((state) => ({
        isGaplessEnabled,
        isCrossfadeEnabled: isGaplessEnabled ? false : state.isCrossfadeEnabled,
      })),
      setIsLoudnessNormalizationEnabled: (isLoudnessNormalizationEnabled) => set({ isLoudnessNormalizationEnabled }),
      setPreloadNextTrack: (preloadNextTrack) => set({ preloadNextTrack }),
      setRunOnStartup: (runOnStartup) => set({ runOnStartup }),
      setStartMinimized: (startMinimized) => set({ startMinimized }),
      setCloseToTray: (closeToTray) => set({ closeToTray }),
      setImageCacheLimitMb: (limitMb) => {
        const clamped = Math.max(32, Math.min(2048, Math.round(limitMb)));
        setImageCacheLimit(clamped);
        set({ imageCacheLimitMb: clamped });
      },
      setTotalStorageLimitGb: (limitGb) => set({ totalStorageLimitGb: Math.max(0, limitGb) }),
      setMaxDownloadConcurrency: (concurrency) => set({ maxDownloadConcurrency: Math.max(1, Math.min(10, concurrency)) }),
      setHideOfflineExplanationModal: (hide) => set({ hideOfflineExplanationModal: hide }),
      setCompressorThreshold: (compressorThreshold) => set({ compressorThreshold }),
      setCompressorRatio: (compressorRatio) => set({ compressorRatio }),
      setCompressorAttack: (compressorAttack) => set({ compressorAttack }),
      setCompressorRelease: (compressorRelease) => set({ compressorRelease }),

      setUseNavidrome: (useNavidrome) => set({ useNavidrome }),
      setUseLastFm: (useLastFm) => set({ useLastFm }),
      setUseYandex: (useYandex) => set({ useYandex }),
      setLastFmKey: (lastFmKey) => set({ lastFmKey }),
      setYandexToken: (yandexToken) => set({ yandexToken }),
    }),
    {
      name: 'holad-settings',
      onRehydrateStorage: () => (state) => {
        if (state && typeof state.imageCacheLimitMb === 'number') {
          setImageCacheLimit(state.imageCacheLimitMb);
        }
      },
    }
  )
);

