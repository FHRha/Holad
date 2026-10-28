import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { useAuthStore } from '../../../store/authStore';
import { UpdateService } from '../../../services/UpdateService';
import { openExternalLink } from '../../../utils/linkHelper';
import { clearAppCache } from '../../../utils/storage';
import { isTauri } from '../../../utils/StorageManager';
import SettingSection from '../SettingSection';

export interface PlatformSettingsSectionProps {
  variant?: 'desktop' | 'mobile' | 'auto';
  isMobile?: boolean;
  className?: string;
  showLogout?: boolean;
}

export default function PlatformSettingsSection({
  variant = 'auto',
  isMobile = false,
  className = '',
  showLogout = true,
}: PlatformSettingsSectionProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const { setAuthenticated, setCredentials } = useAuthStore();
  const [appVersion, setAppVersion] = useState<string>('');

  const isMobileMode = variant === 'mobile' || (variant === 'auto' && isMobile);

  useEffect(() => {
    if (isMobileMode) {
      UpdateService.getCurrentVersion().then((v) => {
        if (v && v !== '0.0.0') {
          setAppVersion(v);
        }
      });
    }
  }, [isMobileMode]);

  useEffect(() => {
    if (isTauri() && !isMobileMode) {
      import('@tauri-apps/plugin-autostart')
        .then(async ({ isEnabled }) => {
          try {
            const enabled = await isEnabled();
            if (settings.runOnStartup !== enabled) {
              settings.setRunOnStartup(enabled);
            }
          } catch (err) {
            console.error('Failed to check autostart status:', err);
          }
        })
        .catch(() => {});
    }
  }, [isMobileMode, settings]);

  const handleLogout = () => {
    setAuthenticated(false);
    setCredentials('', '', '', '');
    clearAppCache();
    window.location.reload();
  };

  if (isMobileMode) {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        {/* Version info and GitHub link */}
        <button
          onClick={() => openExternalLink('https://github.com/FHRha/Holad')}
          className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-foreground/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-colors"
        >
          <img src="/icons/github.png" className="w-[20px] h-[20px] invert" alt="GitHub" />
          <span>GitHub</span>
          {appVersion && <span className="text-xs text-secondary/70 ml-1">v{appVersion}</span>}
        </button>

        {/* Check for updates */}
        <button
          onClick={() => UpdateService.checkForUpdates(true)}
          className="flex items-center justify-center gap-2 w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold py-3 rounded-xl border border-primary/20 transition-colors"
        >
          <DownloadCloud size={20} />
          <span>{t('settings.check_updates') || 'Проверить обновления'}</span>
        </button>

        {/* Logout */}
        {showLogout && (
          <button
            onClick={handleLogout}
            className="w-full bg-red-500/10 text-red-500 font-bold py-3 rounded-xl border border-red-500/20 transition-colors hover:bg-red-500/20"
          >
            {t('views.logout')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Desktop / Tauri-only System Settings */}
      {('__TAURI_INTERNALS__' in window) && (
        <SettingSection title={t('settings.desktop')}>
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={settings.runOnStartup}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  settings.setRunOnStartup(checked);
                  try {
                    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
                    if (checked) await enable();
                    else await disable();
                  } catch (err) {
                    console.error('Failed to toggle autostart', err);
                    settings.setRunOnStartup(!checked);
                  }
                }}
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
              <span className="group-hover:text-primary transition-colors text-sm">
                {t('settings.run_on_startup')}
              </span>
            </label>

            <label
              className={`flex items-center gap-3 cursor-pointer group pl-6 ${
                !settings.runOnStartup ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={settings.startMinimized}
                onChange={(e) => settings.setStartMinimized(e.target.checked)}
                disabled={!settings.runOnStartup}
                className="accent-primary w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="group-hover:text-primary transition-colors text-sm">
                {t('settings.start_minimized')}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group mt-2">
              <input
                type="checkbox"
                checked={settings.closeToTray}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  settings.setCloseToTray(checked);
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('set_close_to_tray', { enabled: checked });
                  } catch (err) {
                    console.error('Failed to update close_to_tray state', err);
                  }
                }}
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
              <span className="group-hover:text-primary transition-colors text-sm">
                {t('settings.close_to_tray')}
              </span>
            </label>
          </div>
        </SettingSection>
      )}

      {/* Desktop Updates Section */}
      <SettingSection title={t('settings.updates') || 'Обновления'}>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => UpdateService.checkForUpdates(true)}
            className="flex items-center justify-center gap-2 w-full max-w-xs bg-primary/10 hover:bg-primary/20 text-primary font-semibold py-2.5 px-4 rounded-xl border border-primary/20 transition-colors text-sm"
          >
            <DownloadCloud size={18} />
            {t('settings.check_updates') || 'Проверить обновления'}
          </button>
        </div>
      </SettingSection>
    </div>
  );
}
