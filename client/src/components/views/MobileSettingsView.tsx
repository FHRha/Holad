import { useState, useEffect } from 'react';
import { Search, CloudOff, Database, Palette, Music, Globe, HardDrive, ChevronRight, ChevronDown, Check, Pencil, Info, DownloadCloud, Eye, EyeOff, RefreshCw, Moon } from 'lucide-react';
import { UpdateService } from '../../services/UpdateService';
import { useSettingsStore } from '../../store/settingsStore';
import type { AccentColor } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { clearAppCache } from '../../utils/storage';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { toggleOfflineMode } from '../../utils/networkStatus';
import LiquidSeekBar from '../common/LiquidSeekBar';
import { pushPreferences } from '../../api/preferences';
import { pushIntegrations } from '../../api/integrations';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';
import DeleteDownloadsModal from '../modals/DeleteDownloadsModal';
import StorageStatsBar from '../settings/StorageStatsBar';
import StorageLimitControl from '../settings/StorageLimitControl';
import ImageMemoryLimitControl from '../settings/ImageMemoryLimitControl';
import StorageDangerZone from '../settings/StorageDangerZone';
import DownloadedMusicGrid from '../settings/DownloadedMusicGrid';
import { openExternalLink } from '../../utils/linkHelper';
import { useDemoStore } from '../../store/demoStore';

function FilterChip({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-all border ${
        isActive ? 'bg-primary text-white border-transparent shadow-md' : 'dark:bg-zinc-800 text-[#b3b3b3] hover:bg-foreground/10 hover:text-foreground border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function AppIconOption({ label, value, current, onSelect }: { label: string, value: 'wave_dark' | 'wave_light' | 'cassette', current: string, onSelect: (v: any) => void }) {
  return (
    <button 
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium shadow-sm transition-colors ${current === value ? 'border-primary text-primary bg-primary/5' : 'border-foreground/10 text-secondary hover:border-foreground/30 hover:text-foreground'}`}
    >
      {label}
    </button>
  );
}

function ColorOption({ color, hex, current, onSelect }: { color: AccentColor, hex: string, current: AccentColor, onSelect: (v: AccentColor) => void }) {
  return (
    <button 
      onClick={() => onSelect(color)}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${current === color ? 'ring-2 ring-offset-2 ring-offset-black ring-primary scale-110' : 'hover:scale-110'}`}
      style={{ backgroundColor: hex }}
    />
  );
}

// Inline Color Picker (Simplified for mobile)
function hexToHsl(hex: string) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number) {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function MobileSettingsView() {
  const { t } = useTranslation();
  const isDemoMode = useDemoStore(state => state.isDemoMode);
  const { setAuthenticated, setCredentials } = useAuthStore();
  const { setSearchOpen, setOfflineModalOpen } = useUIStore();
  const { isOffline } = useNetworkStatus();
  const settings = useSettingsStore();
  const volume = usePlayerStore(state => typeof state.mobileVolume === 'number' ? state.mobileVolume : 1.0);
  const isAutoDjEnabled = usePlayerStore(state => state.isAutoDjEnabled);
  const setVolume = usePlayerStore(state => state.setMobileVolume);
  const toggleAutoDj = usePlayerStore(state => state.toggleAutoDj);
  const volumeMultiplier = usePlayerStore(state => typeof state.volumeMultiplier === 'number' ? state.volumeMultiplier : 1.0);
  const setVolumeMultiplier = usePlayerStore(state => state.setVolumeMultiplier);
  
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const refreshStats = () => setStatsKey((prev) => prev + 1);
  
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [light, setLight] = useState(50);
  
  const [showLastFmKey, setShowLastFmKey] = useState(false);
  const [showYandexToken, setShowYandexToken] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    UpdateService.getCurrentVersion().then((v) => {
      if (v && v !== '0.0.0') {
        setAppVersion(v);
      }
    });
  }, []);
  
  const toggleSection = (id: string) => {
    setExpandedSection(prev => prev === id ? null : id);
  };

  const openColorPicker = (index: number, color: string) => {
    const baseColor = color || '#1db954';
    setEditingColorIndex(index);
    const [h, s, l] = hexToHsl(baseColor);
    setHue(h);
    setSat(s);
    setLight(l);
  };

  const updateColor = (h: number, s: number, l: number) => {
    setHue(h); setSat(s); setLight(l);
    const hex = hslToHex(h, s, l);
    if (editingColorIndex !== null) {
      settings.setCustomColor(editingColorIndex, hex);
      settings.setAccentColor(hex);
    }
  };

  const handleOfflineToggle = () => {
    toggleOfflineMode();
    if (!isOffline && !settings.hideOfflineExplanationModal) {
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
      content: (
        <div className="flex flex-col gap-4 mt-4">
          <button 
            onClick={() => openExternalLink('https://github.com/FHRha/Holad')} 
            className="flex items-center justify-center gap-2 w-full bg-white/5 hover:bg-foreground/10 text-white font-bold py-3 rounded-xl border border-white/10 transition-colors"
          >
            <img src="/icons/github.png" className="w-[20px] h-[20px] invert" alt="GitHub" />
            GitHub {appVersion && <span className="text-xs text-secondary/70 ml-1">v{appVersion}</span>}
          </button>
          <button 
            onClick={() => {
              UpdateService.checkForUpdates(true);
            }} 
            className="flex items-center justify-center gap-2 w-full bg-primary/10 hover:bg-primary/20 text-primary font-bold py-3 rounded-xl border border-primary/20 transition-colors"
          >
            <DownloadCloud size={20} />
            {t('settings.check_updates') || 'Проверить обновления'}
          </button>
        </div>
      )
    },
    ...(!isDemoMode ? [{
      id: 'server',
      title: t('views.settings_server_account'),
      subtitle: t('views.settings_server_desc'),
      icon: <Database className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-4 mt-4">
          <button onClick={handleLogout} className="w-full bg-red-500/10 text-red-500 font-bold py-3 rounded-xl border border-red-500/20">
            {t('views.logout')}
          </button>
        </div>
      )
    }] : []),
    {
      id: 'datasources',
      title: t('settings.data_sources') || 'Источники информации',
      subtitle: t('settings.data_sources_desc') || 'Настройки Data Sources',
      icon: <Globe className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex justify-end mb-[-1rem]">
            <button 
              onClick={() => window.location.reload()} 
              className="flex items-center gap-2 px-3 py-1.5 bg-black/20 hover:bg-black/40 rounded-lg text-secondary hover:text-white transition-colors"
            >
              <RefreshCw size={14} />
              <span className="text-xs">{t('common.refresh') || 'Обновить'}</span>
            </button>
          </div>
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl cursor-pointer mt-4">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">{t('settings.navidrome') || 'Navidrome/Subsonic'}</span>
            </div>
            <input 
              type="checkbox" 
              checked={settings.useNavidrome} 
              onChange={(e) => settings.setUseNavidrome(e.target.checked)}
              className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl cursor-pointer">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">{t('settings.lastfm') || 'Last.fm'}</span>
            </div>
            <input 
              type="checkbox" 
              checked={settings.useLastFm} 
              onChange={(e) => {
                const val = e.target.checked;
                settings.setUseLastFm(val);
                pushIntegrations([
                  { integration_name: 'lastfm', token: settings.lastFmKey, enabled: val }
                ]);
              }}
              className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
            />
          </label>
          {settings.useLastFm && (
            <div className="bg-black/20 p-4 rounded-xl">
              <div className="relative mb-2">
                <input 
                  type={showLastFmKey ? "text" : "password"}
                  placeholder={t('settings.lastfm_key_placeholder') || "Last.fm API Key"}
                  value={settings.lastFmKey}
                  onChange={(e) => settings.setLastFmKey(e.target.value)}
                  onBlur={() => {
                    pushIntegrations([
                      { integration_name: 'lastfm', token: settings.lastFmKey, enabled: settings.useLastFm }
                    ]);
                  }}
                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full outline-none focus:border-primary transition-colors text-white pr-10"
                />
                <button 
                  type="button"
                  onClick={() => setShowLastFmKey(!showLastFmKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1"
                >
                  {showLastFmKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-secondary">
                {t('settings.lastfm_get_key_part1')}<a href="https://www.last.fm/api/authentication" target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('settings.lastfm_get_key_link')}</a>{t('settings.lastfm_get_key_part2')}
                <br />
                <span className="text-red-400 font-medium block mt-1">{t('settings.lastfm_vpn_warning')}</span>
              </p>
            </div>
          )}
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl cursor-pointer">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">{t('settings.yandex_music') || 'Яндекс.Музыка'}</span>
            </div>
            <input 
              type="checkbox" 
              checked={settings.useYandex} 
              onChange={(e) => {
                const val = e.target.checked;
                settings.setUseYandex(val);
                pushIntegrations([
                  { integration_name: 'yandex', token: settings.yandexToken, enabled: val }
                ]);
              }}
              className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
            />
          </label>
          {settings.useYandex && (
            <div className="bg-black/20 p-4 rounded-xl">
              <div className="relative mb-2">
                <input 
                  type={showYandexToken ? "text" : "password"}
                  placeholder={t('settings.yandex_token_placeholder') || "Yandex Token"}
                  value={settings.yandexToken}
                  onChange={(e) => settings.setYandexToken(e.target.value)}
                  onBlur={() => {
                    pushIntegrations([
                      { integration_name: 'yandex', token: settings.yandexToken, enabled: settings.useYandex }
                    ]);
                  }}
                  className="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm w-full outline-none focus:border-primary transition-colors text-white pr-10"
                />
                <button 
                  type="button"
                  onClick={() => setShowYandexToken(!showYandexToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-1"
                >
                  {showYandexToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-secondary">
                {t('settings.yandex_token_desc_part1')}<a href="https://github.com/MarshalX/yandex-music-api/discussions/513" target="_blank" rel="noreferrer" className="text-primary hover:underline">{t('settings.yandex_token_desc_link')}</a>{t('settings.yandex_token_desc_part2')}
              </p>
            </div>
          )}
        </div>
      )
    },
    {
      id: 'appearance',
      title: t('views.settings_appearance'),
      subtitle: t('views.settings_appearance_desc'),
      icon: <Palette className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_theme')}</span>
              <span className="text-xs text-secondary font-medium">{t('settings.mobile_dark_only', 'Только тёмная тема')}</span>
            </div>
            <div className="flex gap-2">
              <button 
                disabled
                className="flex-1 py-3 px-4 rounded-lg border text-sm font-medium shadow-sm border-primary text-primary bg-primary/5 cursor-default flex items-center justify-center gap-2"
              >
                <Moon size={16} />
                <span>{t('settings.theme_dark', 'Dark')}</span>
              </button>
            </div>
            <label className="flex items-center gap-3 cursor-pointer group mt-2">
              <input 
                type="checkbox" 
                checked={settings.syncTheme} 
                onChange={(e) => {
                  const val = e.target.checked;
                  settings.setSyncTheme(val);
                  if (val) {
                    pushPreferences({
                      theme: settings.theme,
                      accent_color: settings.accentColor,
                      custom_colors: JSON.stringify(settings.customColors)
                    });
                  }
                }}
                className="accent-primary w-4 h-4 rounded cursor-pointer"
              />
              <span className="text-xs text-secondary">
                {t('settings.sync_theme', 'Синхронизировать тему и оформление с сервером')}
              </span>
            </label>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('settings.appIcon') || 'App Icon'}</span>
            <div className="flex gap-2">
              <AppIconOption label="Wave Dark" value="wave_dark" current={settings.appIcon} onSelect={settings.setAppIcon} />
              <AppIconOption label="Wave Light" value="wave_light" current={settings.appIcon} onSelect={settings.setAppIcon} />
              <AppIconOption label="Cassette" value="cassette" current={settings.appIcon} onSelect={settings.setAppIcon} />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_accent')}</span>
            <div className="flex gap-2 flex-wrap">
              <ColorOption color="green" hex="#1db954" current={settings.accentColor} onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                }
              }} />
              <ColorOption color="blue" hex="#3b82f6" current={settings.accentColor} onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                }
              }} />
              <ColorOption color="purple" hex="#a855f7" current={settings.accentColor} onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                }
              }} />
              <ColorOption color="pink" hex="#ec4899" current={settings.accentColor} onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                }
              }} />
              <ColorOption color="orange" hex="#f97316" current={settings.accentColor} onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                }
              }} />
            </div>

            <div className="flex items-center gap-2 mt-2">
              {settings.customColors?.map((color, idx) => {
                const isSelected = color && settings.accentColor === color;
                const isEmpty = !color;
                
                return (
                  <div 
                    key={idx}
                    onClick={() => {
                      if (isEmpty || isSelected) {
                        if (editingColorIndex === idx) setEditingColorIndex(null);
                        else openColorPicker(idx, color);
                      } else {
                        settings.setAccentColor(color);
                        setEditingColorIndex(null);
                        if (settings.syncTheme) {
                          pushPreferences({ theme: settings.theme, accent_color: color, custom_colors: JSON.stringify(settings.customColors) });
                        }
                      }
                    }}
                    className={`relative w-10 h-10 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                      isSelected 
                        ? 'border-primary ring-2 ring-primary' 
                        : isEmpty 
                          ? 'border-dashed border-foreground/20 hover:bg-foreground/10'
                          : 'border-white/10 hover:border-white/30'
                    }`}
                    style={color ? { backgroundColor: color } : {}}
                  >
                    {isEmpty && <span className="text-foreground/40 text-lg font-light">+</span>}
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                        <Pencil size={14} className="text-[#b3b3b3]" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {editingColorIndex !== null && (
              <div className="bg-black/30 p-4 rounded-2xl border border-white/10 mt-2 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">{t('views.settings_color_setup')}</span>
                  <button onClick={() => {
                    setEditingColorIndex(null);
                    if (settings.syncTheme) {
                      pushPreferences({ theme: settings.theme, accent_color: settings.accentColor, custom_colors: JSON.stringify(settings.customColors) });
                    }
                  }}><Check size={18} className="text-primary" /></button>
                </div>
                <input 
                  type="range" min="0" max="360" 
                  value={hue} onChange={(e) => updateColor(parseInt(e.target.value), sat, light)}
                  className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-red-500 via-green-500 to-blue-500"
                />
                <input 
                  type="range" min="0" max="100" 
                  value={sat} onChange={(e) => updateColor(hue, parseInt(e.target.value), light)}
                  className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-gray-500 to-blue-500"
                />
                <input 
                  type="range" min="0" max="100" 
                  value={light} onChange={(e) => updateColor(hue, sat, parseInt(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-black via-gray-500 to-white"
                />
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'audio',
      title: t('views.settings_audio'),
      subtitle: t('views.settings_audio_desc'),
      icon: <Music className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('settings.streaming_quality')}</span>
            <div className="bg-black/20 p-4 rounded-xl flex flex-col gap-2">
              <div className="relative">
                <select
                  value={settings.streamingQuality}
                  onChange={(e) => settings.setStreamingQuality(e.target.value as any)}
                  className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                >
                  <option value="opus-256" className="bg-zinc-900 text-white">{t('settings.quality_opus_256')}</option>
                  <option value="raw" className="bg-zinc-900 text-white">{t('settings.quality_raw')}</option>
                  <option value="opus-192" className="bg-zinc-900 text-white">{t('settings.quality_opus_192')}</option>
                  <option value="opus-128" className="bg-zinc-900 text-white">{t('settings.quality_opus_128')}</option>
                  <option value="mp3-320" className="bg-zinc-900 text-white">{t('settings.quality_mp3_320')}</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
              </div>
              <span className="text-xs text-[#b3b3b3] mt-1">{t('settings.streaming_quality_desc')}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_click_action')}</span>
            <div className="flex flex-col gap-3 bg-black/20 p-4 rounded-xl">
              <label className="flex items-center gap-3">
                <input 
                  type="radio" name="clickAction" value="play_now" 
                  checked={settings.clickAction === 'play_now'} 
                  onChange={() => settings.setClickAction('play_now')}
                  className="accent-primary w-5 h-5"
                />
                <span className="text-[15px] font-medium text-white">{t('views.settings_play_now')}</span>
              </label>
              <label className="flex items-center gap-3">
                <input 
                  type="radio" name="clickAction" value="play_next" 
                  checked={settings.clickAction === 'play_next'} 
                  onChange={() => settings.setClickAction('play_next')}
                  className="accent-primary w-5 h-5"
                />
                <span className="text-[15px] font-medium text-white">{t('views.settings_play_next')}</span>
              </label>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_default_volume')}</span>
            <div className="bg-black/20 p-4 rounded-xl">
              <LiquidSeekBar value={volume} onChange={setVolume} />
              <div className="flex justify-between text-xs text-secondary mt-3">
                <span>0%</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('settings.volume_multiplier')}</span>
            <div className="bg-black/20 p-4 rounded-xl flex items-center justify-between">
              <span className="text-[15px] font-medium text-white">{t('views.multiplier_value')}</span>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  min="1"
                  max="300"
                  value={Math.round(volumeMultiplier * 100)}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val)) setVolumeMultiplier(Math.min(Math.max(val, 1), 300) / 100);
                  }}
                  className="bg-foreground/10 border border-white/20 rounded-lg py-1 px-2 w-16 text-center outline-none focus:border-primary transition-colors text-white font-mono"
                />
                <span className="text-sm text-[#b3b3b3]">%</span>
              </div>
            </div>
          </div>

          <div className="bg-black/20 p-4 rounded-xl flex flex-col gap-4">
            <label className="flex items-center justify-between">
              <div className="flex flex-col pr-4">
                <span className="text-[15px] font-medium text-white">{t('settings.crossfade')}</span>
                <span className="text-[13px] text-[#b3b3b3]">{t('settings.crossfade_desc')}</span>
              </div>
              <input 
                type="checkbox" 
                checked={settings.isCrossfadeEnabled} 
                onChange={(e) => settings.setIsCrossfadeEnabled(e.target.checked)}
                className="accent-primary w-6 h-6 rounded flex-shrink-0"
              />
            </label>
            {settings.isCrossfadeEnabled && (
              <div className="pt-2 pb-1 opacity-100 transition-opacity border-t border-white/5 space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-[#b3b3b3] mb-2 mt-2">
                    <span>{t('settings.crossfade_duration')}</span>
                    <span>{settings.crossfadeDuration} {t('common.seconds_short', 'сек')}</span>
                  </div>
                  <input 
                    type="range" 
                    min="1" 
                    max="12" 
                    value={settings.crossfadeDuration} 
                    onChange={(e) => settings.setCrossfadeDuration(parseInt(e.target.value))}
                    className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-[#b3b3b3] mt-2">
                    <span>1s</span>
                    <span>12s</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                  <span className="text-xs text-[#b3b3b3] font-medium">{t('settings.crossfade_curve')}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => settings.setCrossfadeCurve('equalPower')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${settings.crossfadeCurve === 'equalPower' ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-[#b3b3b3]'}`}
                    >
                      Equal-Power
                    </button>
                    <button
                      type="button"
                      onClick={() => settings.setCrossfadeCurve('linear')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${settings.crossfadeCurve === 'linear' ? 'border-primary text-primary bg-primary/10' : 'border-white/10 text-[#b3b3b3]'}`}
                    >
                      Linear
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">{t('settings.gapless')}</span>
              <span className="text-[13px] text-[#b3b3b3]">{t('settings.gapless_desc')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={settings.isGaplessEnabled} 
              onChange={(e) => settings.setIsGaplessEnabled(e.target.checked)}
              className="accent-primary w-6 h-6 rounded flex-shrink-0"
            />
          </label>

          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl">
            <div className="flex flex-col pr-4">
              <span className="text-[15px] font-medium text-white">{t('settings.normalization')}</span>
              <span className="text-[13px] text-[#b3b3b3]">{t('settings.normalization_desc')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={settings.isLoudnessNormalizationEnabled} 
              onChange={(e) => settings.setIsLoudnessNormalizationEnabled(e.target.checked)}
              className="accent-primary w-6 h-6 rounded flex-shrink-0"
            />
          </label>
          
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[15px] font-medium text-white">{t('views.settings_autodj')}</span>
              <span className="text-[13px] text-[#b3b3b3]">{t('views.settings_autodj_desc')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={isAutoDjEnabled} 
              onChange={() => toggleAutoDj()}
              className="accent-primary w-6 h-6 rounded"
            />
          </label>

          <div className="bg-black/20 p-4 rounded-xl flex flex-col gap-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex flex-col pr-4">
                <span className="text-[15px] font-medium text-white">{t('settings.prebuffering')}</span>
                <span className="text-[13px] text-[#b3b3b3]">{t('settings.preload_desc')}</span>
              </div>
              <input 
                type="checkbox" 
                checked={settings.preloadNextTrack} 
                onChange={(e) => settings.setPreloadNextTrack(e.target.checked)}
                className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
              />
            </label>

            {settings.preloadNextTrack && (
              <div className="pt-3 border-t border-white/5 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xs text-[#b3b3b3] font-medium">{t('settings.preload_mode')}</span>
                  <div className="relative">
                    <select
                      value={settings.preloadMode}
                      onChange={(e) => settings.setPreloadMode(e.target.value as any)}
                      className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                    >
                      <option value="wifi_only" className="bg-zinc-900 text-white">{t('settings.preload_wifi_only')}</option>
                      <option value="always" className="bg-zinc-900 text-white">{t('settings.preload_always')}</option>
                      <option value="disabled" className="bg-zinc-900 text-white">{t('settings.preload_disabled')}</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  </div>
                  <span className="text-xs text-[#b3b3b3]">{t('settings.preload_mode_desc')}</span>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-[#b3b3b3] font-medium">{t('settings.preload_lookahead')}</span>
                  <div className="relative">
                    <select
                      value={settings.preloadLookahead}
                      onChange={(e) => settings.setPreloadLookahead(Number(e.target.value) as any)}
                      className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                    >
                      <option value={5} className="bg-zinc-900 text-white">{t('settings.preload_lookahead_5s')}</option>
                      <option value={15} className="bg-zinc-900 text-white">{t('settings.preload_lookahead_15s')}</option>
                      <option value={30} className="bg-zinc-900 text-white">{t('settings.preload_lookahead_30s')}</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                  </div>
                  <span className="text-xs text-[#b3b3b3]">{t('settings.preload_lookahead_desc')}</span>
                </div>

                <label className="flex items-center justify-between pt-1 cursor-pointer">
                  <div className="flex flex-col pr-4">
                    <span className="text-[15px] font-medium text-white">{t('settings.preload_covers')}</span>
                    <span className="text-[13px] text-[#b3b3b3]">{t('settings.preload_covers_desc')}</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={settings.preloadCovers} 
                    onChange={(e) => settings.setPreloadCovers(e.target.checked)}
                    className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )
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
              <span className="text-[15px] font-medium text-white">{t('settings.offline_mode')}</span>
              <span className="text-[13px] text-[#b3b3b3]">{t('settings.offline_mode_desc')}</span>
            </div>
            <input 
              type="checkbox" 
              checked={isOffline} 
              onChange={handleOfflineToggle}
              className="accent-primary w-6 h-6 rounded flex-shrink-0 cursor-pointer"
            />
          </label>
        </div>
      )
    },
    {
      id: 'storage',
      title: t('views.settings_storage'),
      subtitle: t('views.settings_storage_desc'),
      icon: <HardDrive className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          {/* 1. Storage Stats Bar (Mobile Optimized) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
              {t('settings.storage_usage')}
            </span>
            <StorageStatsBar isMobile={true} key={statsKey} onRefreshRequested={refreshStats} />
          </div>

          {/* 2. Storage Limit Control */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
              {t('settings.storage_limit_title')}
            </span>
            <StorageLimitControl isMobile={true} />
          </div>

          {/* 3. Image Memory Limit Control */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
              {t('settings.memory_limit')}
            </span>
            <ImageMemoryLimitControl isMobile={true} />
          </div>

          {/* 3. Downloaded Music Library Grid */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
              {t('settings.downloaded_music')}
            </span>
            <DownloadedMusicGrid 
              isMobile={true} 
              onRefreshRequested={refreshStats} 
              onManageClick={() => setShowDeleteModal(true)} 
            />
          </div>

          {/* 4. Danger Zone Block */}
          <StorageDangerZone isMobile={true} onActionComplete={refreshStats} />
        </div>
      )
    }
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
        </div>
      </div>

      <div className="w-full flex-1 flex flex-col px-4 py-6 gap-4">
        {sections.map(section => {
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
                <div className="flex-shrink-0">
                  {section.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white text-[17px] font-bold mb-1">{section.title}</h3>
                  <p className="text-[#b3b3b3] text-[13px] leading-snug pr-4">{section.subtitle}</p>
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
      
      {showDeleteModal && (
        <DeleteDownloadsModal onClose={() => { setShowDeleteModal(false); refreshStats(); }} />
      )}
    </div>
  );
}
