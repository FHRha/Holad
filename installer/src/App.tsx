import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './components/TitleBar';
import { CleanInstallView } from './components/CleanInstallView';
import { UpgradeView } from './components/UpgradeView';
import { InstallingView } from './components/InstallingView';
import { FinishedView } from './components/FinishedView';
import { UninstallView } from './components/UninstallView';
import {
  InstallOptions,
  InstallationView,
  Language,
  SystemInfo,
  InstallProgress,
} from './types';
import { t } from './i18n';

export const App: React.FC = () => {
  const [view, setView] = useState<InstallationView>('clean');
  const [language, setLanguage] = useState<Language>('en');
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    isInstalled: false,
    oldVersion: null,
    newVersion: '2.0.0',
    detectedPath: '',
    defaultPath: 'C:\\Users\\User\\AppData\\Local\\Programs\\Holad',
    defaultMusicPath: 'C:\\Users\\User\\Downloads\\Holad',
    savedMusicPath: null,
    savedLanguage: null,
    isAutostart: false,
    isUninstallMode: false,
  });

  const [options, setOptions] = useState<InstallOptions>({
    installPath: '',
    musicPath: '',
    createDesktopShortcut: true,
    createStartMenuShortcut: false, // Disabled by default as requested
    enableAutostart: false,         // Disabled by default as requested
    language: 'en',
  });

  const [progress, setProgress] = useState<InstallProgress>({
    stage: 'preparing',
    percent: 0,
    message: '',
    error: null,
  });

  // Initialize and check environment
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;

    const init = async () => {
      try {
        // Register listener for progress events emitted by Rust backend
        unlistenProgress = await listen<InstallProgress>(
          'install-progress',
          (event) => {
            const payload = event.payload;
            setProgress({
              stage: payload.stage,
              percent: payload.percent,
              message: payload.message,
              error: payload.error || null,
            });

            if (payload.stage === 'complete') {
              setTimeout(() => {
                setView('finished');
              }, 500);
            } else if (payload.stage === 'error') {
              setView('finished');
            }
          }
        );

        // Fetch system information from Rust backend
        const info = await invoke<SystemInfo>('get_system_info');
        setSystemInfo(info);

        // Language resolution:
        // Priority 1: Saved in HKCU\Software\Holad\Language
        // Priority 2: 'en' by default upon clean installation
        let initialLang: Language = 'en';
        if (info.savedLanguage === 'ru' || info.savedLanguage === 'en') {
          initialLang = info.savedLanguage as Language;
        }
        setLanguage(initialLang);

        const targetPath = info.isInstalled && info.detectedPath
          ? info.detectedPath
          : info.defaultPath;

        const targetMusicPath = info.savedMusicPath || info.defaultMusicPath;

        const defaultDesktop = info.savedDesktopShortcut !== undefined && info.savedDesktopShortcut !== null
          ? info.savedDesktopShortcut
          : true;

        const defaultStartMenu = info.savedStartMenuShortcut !== undefined && info.savedStartMenuShortcut !== null
          ? info.savedStartMenuShortcut
          : false;

        setOptions({
          installPath: targetPath,
          musicPath: targetMusicPath,
          createDesktopShortcut: defaultDesktop,
          createStartMenuShortcut: defaultStartMenu,
          enableAutostart: info.isAutostart,
          language: initialLang,
        });

        if (info.isUninstallMode) {
          setView('uninstall');
        } else if (info.isInstalled) {
          setView('upgrade');
        } else {
          setView('clean');
        }
      } catch (err) {
        console.error('Failed to initialize installer:', err);
      }
    };

    init();

    return () => {
      if (unlistenProgress) {
        unlistenProgress();
      }
    };
  }, []);

  const handleLanguageChange = async (newLang: Language) => {
    setLanguage(newLang);
    setOptions((prev) => ({ ...prev, language: newLang }));
    try {
      await invoke('save_language', { lang: newLang });
    } catch {
      // fallback
    }
  };

  const handleBrowsePath = async () => {
    try {
      const selected = await invoke<string | null>('browse_folder', {
        defaultPath: options.installPath,
      });
      if (selected) {
        setOptions((prev) => ({ ...prev, installPath: selected }));
      }
    } catch (err) {
      console.error('Folder selection dialog error:', err);
    }
  };

  const handleBrowseMusicPath = async () => {
    try {
      const selected = await invoke<string | null>('browse_folder', {
        defaultPath: options.musicPath,
      });
      if (selected) {
        setOptions((prev) => ({ ...prev, musicPath: selected }));
      }
    } catch (err) {
      console.error('Music folder selection dialog error:', err);
    }
  };

  const handleStartInstall = async (isAutoSilent: boolean) => {
    setView('installing');
    setProgress({
      stage: 'stopping',
      percent: 5,
      message: t(language, 'stageStopping'),
      error: null,
    });

    try {
      await invoke('start_installation', {
        options: {
          ...options,
          language,
        },
        autoUpdate: isAutoSilent,
      });
    } catch (err: any) {
      setProgress({
        stage: 'error',
        percent: 0,
        message: 'Error',
        error: String(err),
      });
      setView('finished');
    }
  };

  const handleStartUninstall = async (deleteUserData: boolean) => {
    setView('installing');
    setProgress({
      stage: 'stopping',
      percent: 10,
      message: t(language, 'stageStopping'),
      error: null,
    });

    try {
      await invoke('start_uninstallation', { deleteUserData });
    } catch (err: any) {
      setProgress({
        stage: 'error',
        percent: 0,
        message: 'Error',
        error: String(err),
      });
      setView('finished');
    }
  };

  const handleFinish = async (launchApp: boolean) => {
    try {
      await invoke('finish_and_exit', {
        installPath: options.installPath,
        launchApp,
      });
    } catch {
      window.close();
    }
  };

  const handleCardMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button, input, select, a, [role="button"]')) {
      try {
        await invoke('start_dragging');
      } catch {
        // fallback
      }
    }
  };

  // Map progress stage to localized message if empty
  const getStageMessage = () => {
    if (progress.message) return progress.message;
    switch (progress.stage) {
      case 'stopping':
        return t(language, 'stageStopping');
      case 'extracting':
        return t(language, 'stageExtracting');
      case 'registry':
        return t(language, 'stageRegistry');
      case 'shortcuts':
        return t(language, 'stageShortcuts');
      case 'complete':
        return t(language, 'stageComplete');
      default:
        return t(language, 'installing');
    }
  };

  return (
    <div
      onMouseDown={handleCardMouseDown}
      className="fixed inset-0 flex flex-col bg-[#121212] text-zinc-100 overflow-hidden rounded-2xl border border-white/10"
    >
      {/* Custom TitleBar */}
      <TitleBar
        language={language}
        onLanguageChange={handleLanguageChange}
        showLanguageToggle={view === 'clean' || view === 'upgrade' || view === 'uninstall'}
      />

      {/* Main Content View Container */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-[#121212]">
        {view === 'clean' && (
          <CleanInstallView
            version={systemInfo.newVersion}
            options={options}
            onChangeOptions={(patch) =>
              setOptions((prev) => ({ ...prev, ...patch }))
            }
            onBrowsePath={handleBrowsePath}
            onBrowseMusicPath={handleBrowseMusicPath}
            onStartInstall={() => handleStartInstall(false)}
          />
        )}

        {view === 'upgrade' && (
          <UpgradeView
            language={language}
            oldVersion={systemInfo.oldVersion || '1.0.0'}
            newVersion={systemInfo.newVersion}
            options={options}
            onChangeOptions={(patch) =>
              setOptions((prev) => ({ ...prev, ...patch }))
            }
            onBrowsePath={handleBrowsePath}
            onBrowseMusicPath={handleBrowseMusicPath}
            onUpgrade={() => handleStartInstall(false)}
          />
        )}

        {view === 'uninstall' && (
          <UninstallView
            language={language}
            installPath={options.installPath || systemInfo.detectedPath}
            onConfirmUninstall={handleStartUninstall}
            onCancel={() => invoke('exit_app')}
          />
        )}

        {view === 'installing' && (
          <InstallingView
            language={language}
            isUpgrade={systemInfo.isInstalled}
            percent={progress.percent}
            stageMessage={getStageMessage()}
          />
        )}

        {view === 'finished' && (
          <FinishedView
            language={language}
            isUpgrade={systemInfo.isInstalled}
            isUninstall={systemInfo.isUninstallMode}
            error={progress.error}
            onFinish={handleFinish}
            onRetry={() => (systemInfo.isUninstallMode ? handleStartUninstall(false) : handleStartInstall(false))}
          />
        )}
      </main>
    </div>
  );
};

export default App;

