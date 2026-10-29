import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Palette, Settings2, MonitorPlay, HardDrive, Speaker, Sliders, Globe, RotateCcw } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { StartPage } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import Dropdown from '../common/Dropdown';
import FlagIcon from '../common/FlagIcon';
import { pushPreferences } from '../../api/preferences';
import SettingSection from '../settings/SettingSection';
import SettingsProfilesSection from '../settings/SettingsProfilesSection';
import {
  AppearanceSettingsSection,
  PlaybackSettingsSection,
  IntegrationsSettingsSection,
  StorageSettingsSection,
  PlatformSettingsSection,
} from '../settings/sections';

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  initialTab?: 'general' | 'appearance' | 'player' | 'audio' | 'storage';
} = {}) {
  const { t } = useTranslation();
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const settings = useSettingsStore();
  const isModalOpen = typeof isOpen === 'boolean' ? isOpen : isSettingsOpen;

  const role = usePlayerStore((state) => state.role);
  const isJamGuest =
    window.location.pathname.startsWith('/jam') &&
    (role === 'listener' || role === 'cohost');

  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'player' | 'audio' | 'storage'>(
    initialTab || (isJamGuest ? 'appearance' : typeof isOpen === 'boolean' ? 'player' : 'general')
  );

  // Force active tab to appearance if jam guest
  useEffect(() => {
    if (isJamGuest && activeTab !== 'appearance') {
      setActiveTab('appearance');
    }
  }, [isJamGuest, activeTab]);

  useEffect(() => {
    if (isModalOpen && '__TAURI_INTERNALS__' in window) {
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
  }, [isModalOpen, settings]);

  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'done'>('idle');

  const handleClose = useCallback(() => {
    if (onClose) onClose();
    setSettingsOpen(false);
  }, [onClose, setSettingsOpen]);

  const handleReset = () => {
    if (resetState === 'idle') {
      setResetState('confirm');
      setTimeout(() => {
        setResetState((prev) => (prev === 'confirm' ? 'idle' : prev));
      }, 3000);
    } else if (resetState === 'confirm') {
      settings.setTheme('dark');
      settings.setAppIcon('wave_dark');
      settings.setAccentColor('green');
      settings.setCustomColor(0, '');
      settings.setCustomColor(1, '');
      settings.setCustomColor(2, '');
      settings.setStartPage('/');
      settings.setLanguage('ru');
      setResetState('done');
      setTimeout(() => setResetState('idle'), 2000);
    }
  };

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, handleClose]);

  // If closed, return nothing
  if (!isModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className="bg-card w-full max-w-4xl rounded-xl shadow-2xl border border-border flex h-[88vh] md:h-[600px] max-h-[800px] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Navigation Sidebar */}
        <div className="w-60 bg-background/50 border-r border-border flex flex-col p-4 shrink-0">
          <h2 className="text-lg font-bold mb-4 px-2">{t('sidebar.settings')}</h2>

          <div className="flex flex-col gap-2 relative">
            {!isJamGuest && (
              <button
                onClick={() => setActiveTab('general')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                  activeTab === 'general'
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10'
                    : 'text-secondary hover:text-foreground hover:bg-foreground/[0.05]'
                }`}
              >
                <Settings2
                  size={20}
                  className={activeTab === 'general' ? 'animate-pulse-slow' : ''}
                />
                <span>{t('settings.general')}</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                activeTab === 'appearance'
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10'
                  : 'text-secondary hover:text-foreground hover:bg-foreground/[0.05]'
              }`}
            >
              <Palette
                size={20}
                className={activeTab === 'appearance' ? 'animate-pulse-slow' : ''}
              />
              <span>{t('settings.appearance')}</span>
            </button>

            {!isJamGuest && (
              <>
                <button
                  onClick={() => setActiveTab('player')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    activeTab === 'player'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10'
                      : 'text-secondary hover:text-foreground hover:bg-foreground/[0.05]'
                  }`}
                >
                  <MonitorPlay
                    size={20}
                    className={activeTab === 'player' ? 'animate-pulse-slow' : ''}
                  />
                  <span>{t('settings.player')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('audio')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    activeTab === 'audio'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10'
                      : 'text-secondary hover:text-foreground hover:bg-foreground/[0.05]'
                  }`}
                >
                  <Speaker
                    size={20}
                    className={activeTab === 'audio' ? 'animate-pulse-slow' : ''}
                  />
                  <span>{t('settings.audio')}</span>
                </button>

                <button
                  onClick={() => setActiveTab('storage')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
                    activeTab === 'storage'
                      ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10'
                      : 'text-secondary hover:text-foreground hover:bg-foreground/[0.05]'
                  }`}
                >
                  <HardDrive
                    size={20}
                    className={activeTab === 'storage' ? 'animate-pulse-slow' : ''}
                  />
                  <span>{t('settings.storage')}</span>
                </button>
              </>
            )}
          </div>

          {!isJamGuest && (
            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={resetState === 'done'}
                className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition-all duration-200 border flex items-center justify-center gap-2 shadow-xs cursor-pointer select-none ${
                  resetState === 'idle'
                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30 active:scale-[0.99]'
                    : resetState === 'confirm'
                      ? 'bg-red-500 text-white border-red-600 animate-pulse shadow-md shadow-red-500/20'
                      : 'bg-green-500/15 text-green-500 border-green-500/30'
                }`}
              >
                <RotateCcw size={15} />
                <span>
                  {resetState === 'idle'
                    ? t('settings.reset', 'Сбросить настройки')
                    : resetState === 'confirm'
                      ? t('settings.confirm_reset', 'Подтвердите сброс')
                      : t('settings.reset_done', 'Настройки сброшены')}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Content Pane */}
        <div id="settings-content-pane" className="flex-1 flex flex-col relative overflow-hidden min-w-0">
          <div className="flex items-center justify-between p-6 pb-3 shrink-0 z-20 bg-card/80 backdrop-blur-md border-b border-border">
            <h3 className="text-xl font-bold">
              {activeTab === 'general' && t('settings.general')}
              {activeTab === 'appearance' && t('settings.appearance')}
              {activeTab === 'player' && t('settings.player')}
              {activeTab === 'audio' && t('settings.audio')}
              {activeTab === 'storage' && t('settings.storage')}
            </h3>

            <div className="flex items-center gap-3">
              {/* Advanced Settings Toggle Button */}
              <button
                type="button"
                onClick={() => settings.setShowAdvancedSettings(!settings.showAdvancedSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  settings.showAdvancedSettings
                    ? 'bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/20'
                    : 'bg-foreground/[0.03] text-secondary hover:text-foreground border-border hover:bg-foreground/[0.06]'
                }`}
                title={t('settings.toggle_advanced', 'Переключить расширенные настройки')}
              >
                <Sliders size={14} className={settings.showAdvancedSettings ? 'text-primary' : ''} />
                <span className="hidden sm:inline">
                  {t('settings.advanced', 'Расширенные настройки')}
                </span>
              </button>

              <button
                onClick={handleClose}
                className="p-2 -mr-2 rounded-full hover:bg-foreground/10 transition-colors bg-background/50 backdrop-blur-md"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 px-6 pb-6 pt-4 overflow-y-auto overflow-x-hidden">
            {/* 1. GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                <SettingsProfilesSection />
                <SettingSection
                  title={t('settings.general_preferences', 'Региональные настройки и запуск')}
                  icon={<Globe size={16} />}
                >
                  <div className="flex flex-col">
                    {/* Row 1: Language */}
                    <div className="pb-4 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{t('settings.language')}</div>
                          <div className="text-xs text-secondary">{t('settings.language_desc', 'Язык интерфейса приложения')}</div>
                        </div>
                        <div className="w-full sm:w-60">
                          <Dropdown
                            value={settings.language}
                            onChange={(val) => {
                              settings.setLanguage(val);
                              if (settings.syncLanguage) {
                                pushPreferences({ language: val });
                              }
                            }}
                            options={[
                              { label: 'Русский', value: 'ru', icon: <FlagIcon code="ru" /> },
                              { label: 'English', value: 'en', icon: <FlagIcon code="en" /> },
                            ]}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2.5 cursor-pointer group pt-0.5">
                        <input
                          type="checkbox"
                          checked={settings.syncLanguage}
                          onChange={(e) => {
                            const val = e.target.checked;
                            settings.setSyncLanguage(val);
                            if (val) {
                              pushPreferences({ language: settings.language });
                            }
                          }}
                          className="accent-primary w-4 h-4 rounded cursor-pointer"
                        />
                        <span className="group-hover:text-primary transition-colors text-xs text-secondary">
                          {t('settings.sync_language')}
                        </span>
                      </label>
                    </div>

                    {/* Divider */}
                    <div className="border-b border-border my-1" />

                    {/* Row 2: Start Page */}
                    <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{t('settings.startPage')}</div>
                        <div className="text-xs text-secondary">{t('settings.start_page_desc', 'Раздел, открываемый при запуске приложения')}</div>
                      </div>
                      <div className="w-full sm:w-60">
                        <Dropdown
                          value={settings.startPage}
                          onChange={(val) => settings.setStartPage(val as StartPage)}
                          options={[
                            { label: t('settings.start_home'), value: '/' },
                            { label: t('settings.start_albums'), value: '/albums' },
                            { label: t('settings.start_radio'), value: '/radio' },
                            { label: t('settings.start_favorites'), value: '/favorites' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </SettingSection>

                <IntegrationsSettingsSection />

                <PlatformSettingsSection variant="desktop" />
              </div>
            )}

            {/* 2. APPEARANCE TAB */}
            {activeTab === 'appearance' && (
              <AppearanceSettingsSection />
            )}

            {/* 3. PLAYER TAB */}
            {activeTab === 'player' && (
              <PlaybackSettingsSection mode="player" showAdvanced={settings.showAdvancedSettings} />
            )}

            {/* 4. AUDIO TAB */}
            {activeTab === 'audio' && (
              <PlaybackSettingsSection mode="audio" showAdvanced={settings.showAdvancedSettings} />
            )}

            {/* 5. STORAGE TAB */}
            {activeTab === 'storage' && (
              <StorageSettingsSection showAdvanced={settings.showAdvancedSettings} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
