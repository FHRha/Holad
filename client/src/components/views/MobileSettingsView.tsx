import { useState, type ReactNode } from 'react';
import {
  Search,
  CloudOff,
  Database,
  Palette,
  Music,
  Globe,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Info,
  Sliders,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDemoStore } from '../../store/demoStore';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { toggleOfflineMode } from '../../utils/networkStatus';
import { clearAppCache } from '../../utils/storage';
import LanguageSelector from '../common/LanguageSelector';
import {
  AppearanceSettingsSection,
  PlaybackSettingsSection,
  IntegrationsSettingsSection,
  StorageSettingsSection,
  PlatformSettingsSection,
} from '../settings/sections';

function FilterChip({
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
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-all border ${
        isActive
          ? 'bg-primary text-white border-transparent shadow-md'
          : 'dark:bg-zinc-800 text-[#b3b3b3] hover:bg-foreground/10 hover:text-foreground border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MobileSettingsView() {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const isDemoMode = useDemoStore((state) => state.isDemoMode);
  const { setAuthenticated, setCredentials } = useAuthStore();
  const { setSearchOpen, setOfflineModalOpen } = useUIStore();
  const { isOffline } = useNetworkStatus();

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setExpandedSection((prev) => (prev === id ? null : id));
  };

  const handleOfflineToggle = () => {
    toggleOfflineMode();
    if (!isOffline) {
      setOfflineModalOpen(true);
    }
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setCredentials('', '', '', '');
    clearAppCache();
    window.location.reload();
  };

  const sections = [
    {
      id: 'about',
      title: t('settings.about_app') || 'О приложении',
      subtitle: t('settings.about_app_desc') || 'Версия, обновления и исходный код',
      icon: <Info className="text-primary" size={24} />,
      content: <PlatformSettingsSection variant="mobile" showLogout={false} />,
    },
    ...(!isDemoMode
      ? [
          {
            id: 'server',
            title: t('views.settings_server_account'),
            subtitle: t('views.settings_server_desc'),
            icon: <Database className="text-primary" size={24} />,
            content: (
              <div className="flex flex-col gap-4 mt-4">
                <button
                  onClick={handleLogout}
                  className="w-full bg-red-500/10 text-red-500 font-bold py-3 rounded-xl border border-red-500/20 transition-colors hover:bg-red-500/20"
                >
                  {t('views.logout')}
                </button>
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'datasources',
      title: t('settings.data_sources') || 'Источники информации',
      subtitle: t('settings.data_sources_desc') || 'Настройки Data Sources',
      icon: <Globe className="text-primary" size={24} />,
      content: <IntegrationsSettingsSection isMobile={true} />,
    },
    {
      id: 'appearance',
      title: t('views.settings_appearance'),
      subtitle: t('views.settings_appearance_desc'),
      icon: <Palette className="text-primary" size={24} />,
      content: <AppearanceSettingsSection isMobile={true} />,
    },
    {
      id: 'audio',
      title: t('views.settings_audio'),
      subtitle: t('views.settings_audio_desc'),
      icon: <Music className="text-primary" size={24} />,
      content: (
        <PlaybackSettingsSection
          isMobile={true}
          mode="all"
          showAdvanced={settings.showAdvancedSettings}
        />
      ),
    },
    {
      id: 'network',
      title: t('views.settings_network'),
      subtitle: t('views.settings_network_desc'),
      icon: <Globe className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl cursor-pointer">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">
                {t('settings.offline_mode')}
              </span>
              <span className="text-[13px] text-[#b3b3b3]">
                {t('settings.offline_mode_desc')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={isOffline}
              onChange={handleOfflineToggle}
              className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
            />
          </label>
        </div>
      ),
    },
    {
      id: 'storage',
      title: t('views.settings_storage'),
      subtitle: t('views.settings_storage_desc'),
      icon: <HardDrive className="text-primary" size={24} />,
      content: (
        <StorageSettingsSection
          isMobile={true}
          showAdvanced={settings.showAdvancedSettings}
        />
      ),
    },
  ];

  return (
    <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto overflow-x-hidden flex-col pb-32 w-full">
      <div className="px-4 pt-4 pb-2 sticky top-0 bg-black/40 backdrop-blur-xl z-[60] w-full">
        <div className="flex items-center gap-3 mb-4 w-full relative z-[70]">
          <div
            className="flex items-center flex-1 bg-[#282828] rounded-xl px-3 py-2.5 border border-white/5 cursor-text"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
            <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
              {t('views.search_placeholder')}
            </div>
          </div>
          <div className="flex-shrink-0">
            <LanguageSelector align="right" />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
          <FilterChip
            icon={<CloudOff size={16} />}
            label={t('views.filter_offline')}
            isActive={isOffline}
            onClick={handleOfflineToggle}
          />
          <FilterChip
            icon={<Sliders size={16} />}
            label={t('settings.advanced', 'Расширенные')}
            isActive={settings.showAdvancedSettings}
            onClick={() => settings.setShowAdvancedSettings(!settings.showAdvancedSettings)}
          />
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col px-4 py-6 gap-4">
        {sections.map((section) => {
          const isExpanded = expandedSection === section.id;

          return (
            <div
              key={section.id}
              className="bg-[#181818]/90 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden transition-all duration-300"
            >
              <div
                className="flex items-center p-5 gap-4 cursor-pointer"
                onClick={() => toggleSection(section.id)}
              >
                <div className="flex-shrink-0">{section.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-[17px] font-bold mb-1">{section.title}</h3>
                  <p className="text-[#b3b3b3] text-[13px] leading-snug pr-4">
                    {section.subtitle}
                  </p>
                </div>
                <div className="flex-shrink-0 text-[#b3b3b3]">
                  {isExpanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-0 animate-in fade-in slide-in-from-top-4">
                  <div className="h-[1px] w-full bg-white/5 mb-4" />
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
