import { useState, type ReactNode } from 'react';
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

export type MobileSettingsTab =
  | 'general'
  | 'appearance'
  | 'player'
  | 'audio'
  | 'storage'
  | 'about';

function TabChip({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all border ${
        isActive
          ? 'bg-primary/15 text-primary border-primary/30 shadow-sm shadow-primary/20'
          : 'bg-card text-secondary hover:bg-foreground/[0.06] hover:text-foreground border-border'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function MobileSettingsView() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const { setSearchOpen, setOfflineModalOpen } = useUIStore();
  const { isOffline } = useNetworkStatus();

  const [activeTab, setActiveTab] = useState<MobileSettingsTab>('general');

  const handleOfflineToggle = () => {
    toggleOfflineMode();
    if (!isOffline) {
      setOfflineModalOpen(true);
    }
  };

  return (
    <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto overflow-x-hidden flex-col pb-32 w-full">
      {/* Sticky Header with Search, Language and Tab Bar */}
      <div className="px-4 pt-4 pb-2 sticky top-0 bg-background/85 backdrop-blur-xl border-b border-border z-[60] w-full flex flex-col gap-3">
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

        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
          <TabChip
            icon={<Settings2 size={14} />}
            label={t('settings.general', 'Общие')}
            isActive={activeTab === 'general'}
            onClick={() => setActiveTab('general')}
          />
          <TabChip
            icon={<Palette size={14} />}
            label={t('settings.appearance', 'Внешний вид')}
            isActive={activeTab === 'appearance'}
            onClick={() => setActiveTab('appearance')}
          />
          <TabChip
            icon={<MonitorPlay size={14} />}
            label={t('settings.player', 'Плеер')}
            isActive={activeTab === 'player'}
            onClick={() => setActiveTab('player')}
          />
          <TabChip
            icon={<Speaker size={14} />}
            label={t('settings.audio', 'Звук')}
            isActive={activeTab === 'audio'}
            onClick={() => setActiveTab('audio')}
          />
          <TabChip
            icon={<HardDrive size={14} />}
            label={t('settings.storage', 'Хранилище')}
            isActive={activeTab === 'storage'}
            onClick={() => setActiveTab('storage')}
          />
          <TabChip
            icon={<Info size={14} />}
            label={t('settings.about_app', 'О приложении')}
            isActive={activeTab === 'about'}
            onClick={() => setActiveTab('about')}
          />

          <div className="h-4 w-[1px] bg-border mx-1 flex-shrink-0" />

          {/* Quick Filter Toggles */}
          <button
            type="button"
            onClick={() => settings.setShowAdvancedSettings(!settings.showAdvancedSettings)}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border ${
              settings.showAdvancedSettings
                ? 'bg-primary/15 text-primary border-primary/30 shadow-sm'
                : 'bg-card text-secondary hover:text-foreground border-border'
            }`}
          >
            <Sliders size={13} />
            <span>{t('settings.advanced', 'Расширенные')}</span>
          </button>

          <button
            type="button"
            onClick={handleOfflineToggle}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all border ${
              isOffline
                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                : 'bg-card text-secondary hover:text-foreground border-border'
            }`}
          >
            <CloudOff size={13} />
            <span>{t('views.filter_offline', 'Офлайн')}</span>
          </button>
        </div>
      </div>

      {/* Tab Content Panes */}
      <div className="w-full flex-1 flex flex-col px-4 py-5 gap-5">
        {/* 1. GENERAL TAB */}
        {activeTab === 'general' && (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            {/* General Preferences */}
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

            {/* Integrations (Discord RPC, LastFM, Yandex, Navidrome) */}
            <IntegrationsSettingsSection isMobile={true} />
          </div>
        )}

        {/* 2. APPEARANCE TAB */}
        {activeTab === 'appearance' && (
          <div className="animate-in fade-in duration-150">
            <AppearanceSettingsSection isMobile={true} showLanguage={false} />
          </div>
        )}

        {/* 3. PLAYER TAB */}
        {activeTab === 'player' && (
          <div className="animate-in fade-in duration-150">
            <PlaybackSettingsSection
              isMobile={true}
              mode="player"
              showAdvanced={settings.showAdvancedSettings}
            />
          </div>
        )}

        {/* 4. AUDIO TAB */}
        {activeTab === 'audio' && (
          <div className="animate-in fade-in duration-150">
            <PlaybackSettingsSection
              isMobile={true}
              mode="audio"
              showAdvanced={settings.showAdvancedSettings}
            />
          </div>
        )}

        {/* 5. STORAGE TAB */}
        {activeTab === 'storage' && (
          <div className="animate-in fade-in duration-150">
            <StorageSettingsSection
              isMobile={true}
              showAdvanced={settings.showAdvancedSettings}
            />
          </div>
        )}

        {/* 6. ABOUT TAB (Version, Updates, GitHub, and Account Logout) */}
        {activeTab === 'about' && (
          <div className="animate-in fade-in duration-150">
            <PlatformSettingsSection variant="mobile" showLogout={true} />
          </div>
        )}
      </div>
    </div>
  );
}
