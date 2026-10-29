import { useState } from 'react';
import {
  Search,
  CloudOff,
  Palette,
  HardDrive,
  Info,
  Sliders,
  Settings2,
  MonitorPlay,
  Speaker,
  ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type StartPage } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { toggleOfflineMode } from '../../utils/networkStatus';
import LanguageSelector from '../common/LanguageSelector';
import Dropdown from '../common/Dropdown';
import FlagIcon from '../common/FlagIcon';
import SettingSection from '../settings/SettingSection';
import {
  AppearanceSettingsSection,
  PlaybackSettingsSection,
  IntegrationsSettingsSection,
  StorageSettingsSection,
  PlatformSettingsSection,
} from '../settings/sections';

export default function MobileSettingsView() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const { setSearchOpen, setOfflineModalOpen } = useUIStore();
  const { isOffline } = useNetworkStatus();

  const [expandedSection, setExpandedSection] = useState<string | null>('general');
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'done'>('idle');

  const toggleSection = (id: string) => {
    setExpandedSection((prev) => (prev === id ? null : id));
  };

  const handleOfflineToggle = () => {
    toggleOfflineMode();
    if (!isOffline) {
      setOfflineModalOpen(true);
    }
  };

  const handleReset = () => {
    if (resetState === 'idle') {
      setResetState('confirm');
      setTimeout(() => {
        setResetState((curr) => (curr === 'confirm' ? 'idle' : curr));
      }, 3000);
    } else if (resetState === 'confirm') {
      settings.setTheme('dark');
      settings.setAccentColor('#1db954');
      settings.setCustomColor(0, '#1db954');
      settings.setCustomColor(1, '');
      settings.setCustomColor(2, '');
      settings.setStartPage('/');
      settings.setLanguage('ru');
      setResetState('done');
      setTimeout(() => setResetState('idle'), 2000);
    }
  };

  const sections = [
    {
      id: 'general',
      title: t('settings.general', 'Общие'),
      subtitle: t('settings.general_desc', 'Язык интерфейса, стартовая страница и внешние сервисы'),
      icon: <Settings2 size={20} className="text-primary" />,
      content: (
        <div className="flex flex-col gap-4">
          <SettingSection
            title={t('settings.general_preferences', 'Региональные настройки и запуск')}
            icon={<Settings2 size={16} />}
            isMobile={true}
          >
            <div className="flex flex-col">
              <div className="flex flex-col gap-2 pb-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {t('settings.language', 'Язык интерфейса')}
                  </span>
                  <span className="text-xs text-secondary">
                    {t('settings.language_desc', 'Язык интерфейса приложения')}
                  </span>
                </div>
                <Dropdown
                  value={settings.language}
                  onChange={(val) => {
                    settings.setLanguage(val);
                    if (settings.syncLanguage) {
                      settings.setSyncLanguage(true);
                    }
                  }}
                  options={[
                    { label: 'Русский', value: 'ru', icon: <FlagIcon code="ru" /> },
                    { label: 'English', value: 'en', icon: <FlagIcon code="en" /> },
                  ]}
                />
                <label className="flex items-center gap-2.5 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={settings.syncLanguage}
                    onChange={(e) => settings.setSyncLanguage(e.target.checked)}
                    className="accent-primary w-4 h-4 rounded cursor-pointer"
                  />
                  <span className="text-xs text-secondary">
                    {t('settings.sync_language', 'Синхронизировать язык с сервером')}
                  </span>
                </label>
              </div>

              <div className="h-[1px] w-full bg-border my-2" />

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {t('settings.startPage', 'Стартовая страница')}
                  </span>
                  <span className="text-xs text-secondary">
                    {t('settings.start_page_desc', 'Раздел, открываемый при запуске')}
                  </span>
                </div>
                <Dropdown
                  value={settings.startPage}
                  onChange={(val) => settings.setStartPage(val as StartPage)}
                  options={[
                    { label: t('settings.start_home', 'Главная'), value: '/' },
                    { label: t('settings.start_albums', 'Альбомы'), value: '/albums' },
                    { label: t('settings.start_radio', 'Радио'), value: '/radio' },
                    { label: t('settings.start_favorites', 'Избранное'), value: '/favorites' },
                  ]}
                />
              </div>
            </div>
          </SettingSection>

          <IntegrationsSettingsSection isMobile={true} />
        </div>
      ),
    },
    {
      id: 'appearance',
      title: t('settings.appearance', 'Внешний вид'),
      subtitle: t('settings.appearance_desc', 'Тема оформления, акцентный цвет и оформление интерфейса'),
      icon: <Palette size={20} className="text-primary" />,
      content: <AppearanceSettingsSection isMobile={true} showLanguage={false} />,
    },
    {
      id: 'player',
      title: t('settings.player', 'Плеер'),
      subtitle: t('settings.player_desc', 'Режимы воспроизведения, буферизация и экономия трафика'),
      icon: <MonitorPlay size={20} className="text-primary" />,
      content: (
        <PlaybackSettingsSection
          isMobile={true}
          mode="player"
          showAdvanced={settings.showAdvancedSettings}
        />
      ),
    },
    {
      id: 'audio',
      title: t('settings.audio', 'Звук'),
      subtitle: t('settings.audio_desc', 'Кроссфейд, усилитель сигнала и звуковые эффекты'),
      icon: <Speaker size={20} className="text-primary" />,
      content: (
        <PlaybackSettingsSection
          isMobile={true}
          mode="audio"
          showAdvanced={settings.showAdvancedSettings}
        />
      ),
    },
    {
      id: 'storage',
      title: t('settings.storage', 'Хранилище'),
      subtitle: t('settings.storage_desc', 'Кэш изображений, аудиобуфер и скачанные треки'),
      icon: <HardDrive size={20} className="text-primary" />,
      content: (
        <StorageSettingsSection
          isMobile={true}
          showAdvanced={settings.showAdvancedSettings}
        />
      ),
    },
    {
      id: 'about',
      title: t('settings.about_app', 'О приложении'),
      subtitle: t('settings.about_app_desc', 'Версия приложения, обновления, сервер и аккаунт'),
      icon: <Info size={20} className="text-primary" />,
      content: <PlatformSettingsSection variant="mobile" showLogout={true} />,
    },
  ];

  return (
    <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto overflow-x-hidden flex-col pb-32 w-full">
      {/* Sticky Header with Search, Language and Quick Action Bar */}
      <div className="px-4 pt-4 pb-2.5 sticky top-0 bg-background/85 backdrop-blur-xl border-b border-border z-[60] w-full flex flex-col gap-3">
        <div className="flex items-center gap-3 w-full relative z-[70]">
          <div
            className="flex items-center flex-1 bg-card rounded-xl px-3 py-2.5 border border-border cursor-text shadow-xs"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={18} className="text-secondary mr-2 pointer-events-none" />
            <div className="bg-transparent text-secondary outline-none flex-1 text-sm font-medium select-none pointer-events-none truncate">
              {t('views.search_placeholder')}
            </div>
          </div>
          <div className="flex-shrink-0">
            <LanguageSelector align="right" />
          </div>
        </div>

        {/* Quick Action Toolbar (Advanced Settings & Offline Mode) */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => settings.setShowAdvancedSettings(!settings.showAdvancedSettings)}
            className={`flex-shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all border ${
              settings.showAdvancedSettings
                ? 'bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/20'
                : 'bg-card text-secondary hover:text-foreground border-border'
            }`}
          >
            <Sliders size={14} className={settings.showAdvancedSettings ? 'text-primary' : ''} />
            <span>{t('settings.advanced', 'Расширенные настройки')}</span>
          </button>

          <button
            type="button"
            onClick={handleOfflineToggle}
            className={`flex-shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all border ${
              isOffline
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-card text-secondary hover:text-foreground border-border'
            }`}
          >
            <CloudOff size={14} />
            <span>{t('views.filter_offline', 'Офлайн')}</span>
          </button>
        </div>
      </div>

      {/* Accordion Sections List */}
      <div className="w-full flex-1 flex flex-col px-4 py-4 gap-3">
        {sections.map((section) => {
          const isExpanded = expandedSection === section.id;

          return (
            <div
              key={section.id}
              className="bg-card rounded-2xl border border-border overflow-hidden transition-all duration-200 shadow-xs"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center p-3.5 sm:p-4 gap-3.5 text-left cursor-pointer hover:bg-foreground/[0.02] transition-colors select-none"
              >
                <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center flex-shrink-0 text-primary">
                  {section.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-foreground text-[16px] font-semibold leading-tight">
                    {section.title}
                  </h3>
                  <p className="text-secondary text-xs mt-0.5 leading-normal line-clamp-1">
                    {section.subtitle}
                  </p>
                </div>
                <div className="flex-shrink-0 text-secondary pl-1">
                  <ChevronDown
                    size={19}
                    className={`transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-primary' : 'text-secondary/70'
                    }`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0 animate-in fade-in duration-150">
                  <div className="h-[1px] w-full bg-border mb-3" />
                  {section.content}
                </div>
              )}
            </div>
          );
        })}

        {/* Reset settings button */}
        <div className="pt-3 pb-6 flex justify-center">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetState === 'done'}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors border ${
              resetState === 'idle'
                ? 'text-secondary hover:text-foreground border-transparent hover:border-border'
                : resetState === 'confirm'
                  ? 'bg-red-500/15 text-red-500 border-red-500/30 animate-pulse'
                  : 'bg-green-500/15 text-green-500 border-green-500/30'
            }`}
          >
            {resetState === 'idle'
              ? t('settings.reset', 'Сбросить настройки')
              : resetState === 'confirm'
                ? t('settings.confirm_reset', 'Подтвердите сброс')
                : t('settings.reset_done', 'Настройки сброшены')}
          </button>
        </div>
      </div>
    </div>
  );
}
