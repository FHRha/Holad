import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from 'i18next';

export type AppTheme = 'dark' | 'light' | 'system';
export type AccentColor = string;
export type ClickAction = 'play_now' | 'play_next';
export type StartPage = '/Holad' | '/Holad/albums' | '/Holad/radio' | '/Holad/favorites';

export interface SettingsState {
  theme: AppTheme;
  accentColor: AccentColor;
  customColors: [string, string, string];
  language: string;
  clickAction: ClickAction;
  startPage: StartPage;
  
  setTheme: (theme: AppTheme) => void;
  setAccentColor: (color: AccentColor) => void;
  setCustomColor: (index: number, color: string) => void;
  setLanguage: (lang: string) => void;
  setClickAction: (action: ClickAction) => void;
  setStartPage: (page: StartPage) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      accentColor: 'green',
      customColors: ['', '', ''],
      language: i18n.language || 'ru',
      clickAction: 'play_now',
      startPage: '/Holad',

      setTheme: (theme) => set({ theme }),
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
    }),
    {
      name: 'streamnavi-settings',
    }
  )
);
