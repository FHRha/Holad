export type Language = 'en' | 'ru';

export type InstallationView = 'clean' | 'upgrade' | 'installing' | 'finished' | 'error' | 'uninstall';

export interface SystemInfo {
  isInstalled: boolean;
  oldVersion: string | null;
  newVersion: string;
  detectedPath: string;
  defaultPath: string;
  defaultMusicPath: string;
  savedMusicPath?: string | null;
  savedLanguage: string | null;
  isAutostart: boolean;
  isUninstallMode: boolean;
  savedDesktopShortcut?: boolean | null;
  savedStartMenuShortcut?: boolean | null;
}

export interface InstallOptions {
  installPath: string;
  musicPath: string;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  enableAutostart: boolean;
  language: Language;
}

export interface InstallProgress {
  stage: string;
  percent: number;
  message: string;
  error?: string | null;
}
