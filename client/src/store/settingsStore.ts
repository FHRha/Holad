import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from 'i18next';
import type { CrossfadeCurve } from '../audio/types';
import { setImageCacheLimit } from '../utils/imageCache';
import { applyAppIcon } from '../utils/appIconHelper';
import { isTauri } from '../utils/StorageManager';

export async function syncAppLanguageToBackend(language: string) {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const normalized = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
      await invoke('set_app_language', { language: normalized });
    } catch (e) {
      console.warn('Failed to sync app language to backend:', e);
    }
  }
}

export type AppTheme = 'dark' | 'light' | 'system';
export type AppIcon = 'wave_dark' | 'wave_light' | 'cassette';
export type AccentColor = string;
export type ClickAction = 'play_now' | 'play_next';
export type AutoDjRepeatBehavior = 'pause_on_repeat' | 'infinite_stream';
export type StartPage = '/' | '/albums' | '/radio' | '/favorites';
export type VisualizerStyle = 'classic' | 'modern' | 'wave' | 'radial' | 'peaks';
export type StreamingQuality = 'opus-256' | 'raw' | 'opus-192' | 'opus-128' | 'mp3-320';
export type PreloadMode = 'wifi_only' | 'always' | 'disabled';
export type PreloadLookahead = 5 | 15 | 30;

export interface SettingsState {
  theme: AppTheme;
  appIcon: AppIcon;
  accentColor: AccentColor;
  customColors: [string, string, string];
  language: string;
  clickAction: ClickAction;
  autoDjRepeatBehavior: AutoDjRepeatBehavior;
  startPage: StartPage;
  isCrossfadeEnabled: boolean;
  crossfadeDuration: number;
  crossfadeCurve: CrossfadeCurve;
  crossfadeTension?: { x: number; y: number };
  isGaplessEnabled: boolean;
  isLoudnessNormalizationEnabled: boolean;
  preloadNextTrack: boolean;
  streamingQuality: StreamingQuality;
  preloadMode: PreloadMode;
  preloadLookahead: PreloadLookahead;
  preloadCovers: boolean;
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
  visualizerStyle: VisualizerStyle;

  setTheme: (theme: AppTheme) => void;
  setAppIcon: (appIcon: AppIcon) => void;
  setAccentColor: (color: AccentColor) => void;
  setCustomColor: (index: number, color: string) => void;
  setLanguage: (lang: string) => void;
  setClickAction: (action: ClickAction) => void;
  setAutoDjRepeatBehavior: (behavior: AutoDjRepeatBehavior) => void;
  setStartPage: (page: StartPage) => void;
  setIsCrossfadeEnabled: (enabled: boolean) => void;
  setCrossfadeDuration: (duration: number) => void;
  setCrossfadeCurve: (curve: CrossfadeCurve) => void;
  setCrossfadeTension: (tension: { x: number; y: number }) => void;
  setIsGaplessEnabled: (enabled: boolean) => void;
  setIsLoudnessNormalizationEnabled: (enabled: boolean) => void;
  setPreloadNextTrack: (enabled: boolean) => void;
  setStreamingQuality: (quality: StreamingQuality) => void;
  setPreloadMode: (mode: PreloadMode) => void;
  setPreloadLookahead: (seconds: PreloadLookahead) => void;
  setPreloadCovers: (enabled: boolean) => void;
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
  setVisualizerStyle: (style: VisualizerStyle) => void;
  includePrereleases: boolean;
  setIncludePrereleases: (enabled: boolean) => void;
  syncTheme: boolean;
  setSyncTheme: (sync: boolean) => void;
  syncLanguage: boolean;
  setSyncLanguage: (sync: boolean) => void;
  autoResumeOnHeadphonesConnect: boolean;
  setAutoResumeOnHeadphonesConnect: (enabled: boolean) => void;
  showAdvancedSettings: boolean;
  setShowAdvancedSettings: (show: boolean) => void;
  dataSaver: boolean;
  previousStreamingQuality?: StreamingQuality;
  setDataSaver: (enabled: boolean) => void;
  enableDiscordRpc: boolean;
  setEnableDiscordRpc: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      appIcon: 'wave_dark',
      accentColor: 'green',
      visualizerStyle: 'classic',
      customColors: ['', '', ''],
      language: i18n.language || 'ru',
      clickAction: 'play_now',
      autoDjRepeatBehavior: 'pause_on_repeat',
      startPage: '/',
      isCrossfadeEnabled: true,
      crossfadeDuration: 3,
      crossfadeCurve: 'equalPower',
      crossfadeTension: { x: 0.5, y: 0.707 },
      isGaplessEnabled: false,
      isLoudnessNormalizationEnabled: false,
      preloadNextTrack: true,
      streamingQuality: 'raw',
      previousStreamingQuality: 'raw',
      preloadMode: 'wifi_only',
      preloadLookahead: 15,
      preloadCovers: true,
      runOnStartup: false,
      startMinimized: false,
      closeToTray: true,
      imageCacheLimitMb: 48,
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
        syncAppLanguageToBackend(language);
        set({ language });
      },
      setClickAction: (clickAction) => set({ clickAction }),
      setAutoDjRepeatBehavior: (autoDjRepeatBehavior) => set({ autoDjRepeatBehavior }),
      setStartPage: (startPage) => set({ startPage }),
      setIsCrossfadeEnabled: (isCrossfadeEnabled) => set((state) => ({
        isCrossfadeEnabled,
        isGaplessEnabled: isCrossfadeEnabled ? false : state.isGaplessEnabled,
      })),
      setCrossfadeDuration: (crossfadeDuration) => set({ crossfadeDuration: Math.max(1, Math.min(12, crossfadeDuration)) }),
      setCrossfadeCurve: (crossfadeCurve) => set((state) => {
        let tension = state.crossfadeTension || { x: 0.5, y: 0.707 };
        if (crossfadeCurve === 'equalPower') tension = { x: 0.5, y: 0.707 };
        else if (crossfadeCurve === 'linear') tension = { x: 0.5, y: 0.5 };
        else if (crossfadeCurve === 'exponential') tension = { x: 0.5, y: 0.35 };
        return { crossfadeCurve, crossfadeTension: tension };
      }),
      setCrossfadeTension: (crossfadeTension) => set({
        crossfadeTension,
        crossfadeCurve: 'custom',
      }),
      setIsGaplessEnabled: (isGaplessEnabled) => set((state) => ({
        isGaplessEnabled,
        isCrossfadeEnabled: isGaplessEnabled ? false : state.isCrossfadeEnabled,
      })),
      setIsLoudnessNormalizationEnabled: (isLoudnessNormalizationEnabled) => set({ isLoudnessNormalizationEnabled }),
      setPreloadNextTrack: (preloadNextTrack) => set({ preloadNextTrack }),
      setStreamingQuality: (streamingQuality) => set({ streamingQuality, previousStreamingQuality: streamingQuality }),
      setPreloadMode: (preloadMode) => set({ preloadMode }),
      setPreloadLookahead: (preloadLookahead) => set({ preloadLookahead }),
      setPreloadCovers: (preloadCovers) => set({ preloadCovers }),
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
      setVisualizerStyle: (visualizerStyle) => set({ visualizerStyle }),
      includePrereleases: false,
      setIncludePrereleases: (includePrereleases) => set({ includePrereleases }),
      syncTheme: true,
      setSyncTheme: (syncTheme) => set({ syncTheme }),
      syncLanguage: true,
      setSyncLanguage: (syncLanguage) => set({ syncLanguage }),
      autoResumeOnHeadphonesConnect: false,
      setAutoResumeOnHeadphonesConnect: (autoResumeOnHeadphonesConnect) => set({ autoResumeOnHeadphonesConnect }),
      showAdvancedSettings: false,
      setShowAdvancedSettings: (showAdvancedSettings) => set({ showAdvancedSettings }),
      dataSaver: false,
      setDataSaver: (dataSaver) => set((state) => {
        if (dataSaver) {
          const prev = state.streamingQuality;
          return {
            dataSaver: true,
            previousStreamingQuality: prev !== 'opus-128' ? prev : (state.previousStreamingQuality || 'raw'),
            streamingQuality: 'opus-128',
            preloadMode: 'wifi_only',
          };
        } else {
          const restored = state.previousStreamingQuality || 'raw';
          return {
            dataSaver: false,
            streamingQuality: restored,
          };
        }
      }),
      enableDiscordRpc: true,
      setEnableDiscordRpc: (enableDiscordRpc) => {
        set({ enableDiscordRpc });
        if (isTauri()) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('set_discord_rpc_enabled', { enabled: enableDiscordRpc }).catch(() => {});
          }).catch(() => {});
        }
      },
    }),
    {
      name: 'holad-settings',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version < 2 && persistedState) {
          persistedState.autoResumeOnHeadphonesConnect = false;
        }
        if (version < 3 && persistedState) {
          if (persistedState.showAdvancedSettings === undefined) {
            persistedState.showAdvancedSettings = false;
          }
          if (persistedState.dataSaver === undefined) {
            persistedState.dataSaver = false;
          }
          if (persistedState.enableDiscordRpc === undefined) {
            persistedState.enableDiscordRpc = true;
          }
        }
        if (persistedState) {
          if (!persistedState.crossfadeTension) {
            persistedState.crossfadeTension = { x: 0.5, y: 0.707 };
          }
        }
        return persistedState;
      },
      onRehydrateStorage: () => (state) => {
        if (state && typeof state.imageCacheLimitMb === 'number') {
          setImageCacheLimit(state.imageCacheLimitMb);
        }
        if (state && state.startPage) {
          if ((state.startPage as string).startsWith('/Holad')) {
            const migrated = (state.startPage as string).replace(/^\/Holad(\/|$)/, '/') || '/';
            state.startPage = (migrated === '' ? '/' : migrated) as StartPage;
          }
        }
        const initialLang = state?.language || i18n.language || 'ru';
        syncAppLanguageToBackend(initialLang);
      },
    }
  )
);

