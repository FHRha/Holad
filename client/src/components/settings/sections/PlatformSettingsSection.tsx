import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DownloadCloud, Monitor, LogOut, User, Server } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { useAuthStore } from '../../../store/authStore';
import { UpdateService } from '../../../services/UpdateService';
import { openExternalLink } from '../../../utils/linkHelper';
import { clearAppCache } from '../../../utils/storage';
import { isTauri } from '../../../utils/StorageManager';
import SettingSection from '../SettingSection';
import { SettingToggle } from '../controls';

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
  const { user, url, setAuthenticated, setCredentials, logout } = useAuthStore();
  const [appVersion, setAppVersion] = useState<string>('');

  const isMobileMode = variant === 'mobile' || (variant === 'auto' && isMobile);

  useEffect(() => {
    let mounted = true;
    UpdateService.getCurrentVersion().then((v) => {
      if (mounted && v && v !== '0.0.0') {
        setAppVersion(v);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

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
    logout();
    setAuthenticated(false);
    setCredentials('', '', '', '');
    clearAppCache();
    window.location.reload();
  };

  if (isMobileMode) {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        {/* Mobile Account Card */}
        {showLogout && (
          <div className="bg-card p-4 rounded-2xl border border-border flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                <User size={22} />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold text-foreground truncate">
                  {user || t('settings.anonymous_user', 'Пользователь')}
                </span>
                <span className="text-xs text-secondary truncate flex items-center gap-1.5 font-mono">
                  <Server size={11} className="inline flex-shrink-0" />
                  {url || 'localhost'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full mt-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold py-2.5 px-4 rounded-xl border border-red-500/20 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <LogOut size={16} />
              <span>{t('views.logout', 'Выйти из аккаунта')}</span>
            </button>
          </div>
        )}

        {/* Version info and GitHub link */}
        <button
          type="button"
          onClick={() => openExternalLink('https://github.com/FHRha/Holad')}
          className="flex items-center justify-center gap-2 w-full bg-foreground/[0.03] hover:bg-foreground/[0.06] text-foreground font-semibold py-3 px-4 rounded-xl border border-border transition-colors text-sm shadow-sm"
        >
          <img src="/icons/github.png" className="w-[18px] h-[18px] invert opacity-80" alt="GitHub" />
          <span>GitHub</span>
          {appVersion && <span className="text-xs text-secondary font-mono ml-1">v{appVersion}</span>}
        </button>

        {/* Check for updates */}
        <button
          type="button"
          onClick={() => UpdateService.checkForUpdates(true)}
          className="flex items-center justify-center gap-2 w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold py-3 px-4 rounded-xl border border-primary/20 transition-colors text-sm shadow-sm"
        >
          <DownloadCloud size={18} />
          <span>{t('settings.check_updates') || 'Проверить обновления'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Desktop / Tauri-only System Settings */}
      {('__TAURI_INTERNALS__' in window) && (
        <SettingSection
          title={t('settings.desktop', 'Системные параметры')}
          icon={<Monitor size={16} />}
        >
          <div className="flex flex-col gap-3.5">
            <SettingToggle
              title={t('settings.run_on_startup', 'Автозапуск при старте системы')}
              checked={settings.runOnStartup}
              onChange={async (checked) => {
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
            />

            <SettingToggle
              className={`pl-4 border-l-2 border-border ${
                !settings.runOnStartup ? 'opacity-40 pointer-events-none' : ''
              }`}
              title={t('settings.start_minimized', 'Запускать свёрнутым в трей')}
              checked={settings.startMinimized}
              disabled={!settings.runOnStartup}
              onChange={(checked) => settings.setStartMinimized(checked)}
            />

            <SettingToggle
              title={t('settings.close_to_tray', 'Сворачивать в трей при закрытии')}
              checked={settings.closeToTray}
              onChange={async (checked) => {
                settings.setCloseToTray(checked);
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('set_close_to_tray', { enabled: checked });
                } catch (err) {
                  console.error('Failed to update close_to_tray state', err);
                }
              }}
            />
          </div>
        </SettingSection>
      )}

      {/* Desktop Updates Section */}
      <SettingSection
        title={t('settings.updates') || 'Обновления'}
        icon={<DownloadCloud size={16} />}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                Holad {appVersion ? `v${appVersion}` : 'Desktop'}
              </span>
              <span className="text-xs text-secondary">
                {t('settings.updates_desc', 'Проверка актуальных версий приложения')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => UpdateService.checkForUpdates(true)}
              className="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary font-semibold py-2.5 px-4 rounded-xl border border-primary/20 transition-colors text-xs shadow-sm self-start sm:self-auto"
            >
              <DownloadCloud size={16} />
              <span>{t('settings.check_updates') || 'Проверить обновления'}</span>
            </button>
          </div>

          <div className="border-t border-border pt-3">
            <SettingToggle
              title={t('settings.include_prereleases', 'Получать предварительные сборки (бета-версии)')}
              description={t('settings.include_prereleases_desc', 'Проверять и предлагать к установке тестовые pre-release версии')}
              checked={settings.includePrereleases}
              onChange={(checked) => settings.setIncludePrereleases(checked)}
            />
          </div>
        </div>
      </SettingSection>
    </div>
  );
}
