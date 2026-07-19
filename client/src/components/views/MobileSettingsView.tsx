import { useState } from 'react';
import { Search, CloudOff, Database, Palette, Music, Globe, HardDrive, ChevronRight, ChevronDown, Check, Pencil, Trash2 } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import type { AppTheme, AccentColor } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { clearAppCache } from '../../utils/storage';
import Slider from '../common/Slider';
import { useTranslation } from 'react-i18next';
import LanguageSelector from '../common/LanguageSelector';
import DeleteDownloadsModal from '../modals/DeleteDownloadsModal';
import { isTauri, isCapacitor } from '../../utils/StorageManager';

function FilterChip({ icon, label, isActive, onClick }: { icon: React.ReactNode, label: string, isActive?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-2 rounded-full px-4 py-2 text-[14px] font-bold transition-colors ${
        isActive ? 'bg-primary text-primary-foreground' : 'bg-[#282828] text-[#b3b3b3] hover:text-white'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ThemeOption({ label, value, current, onSelect }: { label: string, value: AppTheme, current: AppTheme, onSelect: (v: AppTheme) => void }) {
  return (
    <button 
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${current === value ? 'border-primary text-primary bg-primary/5' : 'border-white/10 text-secondary hover:border-white/30 hover:text-white'}`}
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
  const { setAuthenticated, setCredentials } = useAuthStore();
  const { setSearchOpen } = useUIStore();
  const settings = useSettingsStore();
  const volume = usePlayerStore(state => state.volume);
  const isAutoDjEnabled = usePlayerStore(state => state.isAutoDjEnabled);
  const setVolume = usePlayerStore(state => state.setVolume);
  const toggleAutoDj = usePlayerStore(state => state.toggleAutoDj);
  
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [light, setLight] = useState(50);
  
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

  const handleLogout = () => {
    setAuthenticated(false);
    setCredentials('', '', '', '');
    clearAppCache();
    window.location.reload();
  };

  const sections = [
    {
      id: 'server',
      title: t('views.settings_server_account', { defaultValue: 'Сервер и аккаунт' }),
      subtitle: t('views.settings_server_desc', { defaultValue: 'Данные сервера, сканирование библиотеки, учетные данные, выход из аккаунта' }),
      icon: <Database className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-4 mt-4">
          <button onClick={handleLogout} className="w-full bg-red-500/10 text-red-500 font-bold py-3 rounded-xl border border-red-500/20">
            {t('views.logout', { defaultValue: 'Выйти из аккаунта' })}
          </button>
        </div>
      )
    },
    {
      id: 'appearance',
      title: t('views.settings_appearance', { defaultValue: 'Внешний вид' }),
      subtitle: t('views.settings_appearance_desc', { defaultValue: 'Тема, цвет приложения, сортировка, представления коллекций (сеткой/списком)' }),
      icon: <Palette className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_theme', { defaultValue: 'Тема' })}</span>
            <div className="flex gap-2">
              <ThemeOption label="Dark" value="dark" current={settings.theme} onSelect={settings.setTheme} />
              <ThemeOption label="Light" value="light" current={settings.theme} onSelect={settings.setTheme} />
              <ThemeOption label="System" value="system" current={settings.theme} onSelect={settings.setTheme} />
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_accent', { defaultValue: 'Цвет акцента' })}</span>
            <div className="flex gap-2 flex-wrap">
              <ColorOption color="green" hex="#1db954" current={settings.accentColor} onSelect={settings.setAccentColor} />
              <ColorOption color="blue" hex="#3b82f6" current={settings.accentColor} onSelect={settings.setAccentColor} />
              <ColorOption color="purple" hex="#a855f7" current={settings.accentColor} onSelect={settings.setAccentColor} />
              <ColorOption color="pink" hex="#ec4899" current={settings.accentColor} onSelect={settings.setAccentColor} />
              <ColorOption color="orange" hex="#f97316" current={settings.accentColor} onSelect={settings.setAccentColor} />
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
                      }
                    }}
                    className={`relative w-10 h-10 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                      isSelected 
                        ? 'border-primary ring-2 ring-primary' 
                        : isEmpty 
                          ? 'border-dashed border-white/20 hover:bg-white/10'
                          : 'border-white/10 hover:border-white/30'
                    }`}
                    style={color ? { backgroundColor: color } : {}}
                  >
                    {isEmpty && <span className="text-white/40 text-lg font-light">+</span>}
                    {isSelected && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-full">
                        <Pencil size={14} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {editingColorIndex !== null && (
              <div className="bg-black/30 p-4 rounded-2xl border border-white/10 mt-2 space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-sm">{t('views.settings_color_setup', { defaultValue: 'Настройка цвета' })}</span>
                  <button onClick={() => setEditingColorIndex(null)}><Check size={18} className="text-primary" /></button>
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
      title: t('views.settings_audio', { defaultValue: 'Звук и воспроизведение' }),
      subtitle: t('views.settings_audio_desc', { defaultValue: 'Качество стриминга, качество загрузки, управление плеером' }),
      icon: <Music className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_click_action', { defaultValue: 'Действие по клику' })}</span>
            <div className="flex flex-col gap-3 bg-black/20 p-4 rounded-xl">
              <label className="flex items-center gap-3">
                <input 
                  type="radio" name="clickAction" value="play_now" 
                  checked={settings.clickAction === 'play_now'} 
                  onChange={() => settings.setClickAction('play_now')}
                  className="accent-primary w-5 h-5"
                />
                <span className="text-[15px] font-medium text-white">{t('views.settings_play_now', { defaultValue: 'Заменить очередь' })}</span>
              </label>
              <label className="flex items-center gap-3">
                <input 
                  type="radio" name="clickAction" value="play_next" 
                  checked={settings.clickAction === 'play_next'} 
                  onChange={() => settings.setClickAction('play_next')}
                  className="accent-primary w-5 h-5"
                />
                <span className="text-[15px] font-medium text-white">{t('views.settings_play_next', { defaultValue: 'Добавить в конец' })}</span>
              </label>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">{t('views.settings_default_volume', { defaultValue: 'Громкость по умолчанию' })}</span>
            <div className="bg-black/20 p-4 rounded-xl">
              <Slider value={volume} onChange={setVolume} thickness="thick" />
            </div>
          </div>
          
          <label className="flex items-center justify-between bg-black/20 p-4 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[15px] font-medium text-white">{t('views.settings_autodj', { defaultValue: 'Авто DJ' })}</span>
              <span className="text-[13px] text-[#b3b3b3]">{t('views.settings_autodj_desc', { defaultValue: 'Добавлять похожие треки' })}</span>
            </div>
            <input 
              type="checkbox" 
              checked={isAutoDjEnabled} 
              onChange={() => toggleAutoDj()}
              className="accent-primary w-6 h-6 rounded"
            />
          </label>
        </div>
      )
    },
    {
      id: 'network',
      title: t('views.settings_network', { defaultValue: 'Сетевое подключение' }),
      subtitle: t('views.settings_network_desc', { defaultValue: 'Офлайн-режим, доверенные SSL-сертификаты' }),
      icon: <Globe className="text-primary" size={24} />,
      content: (
        <div className="text-[#b3b3b3] text-sm mt-4 italic">{t('views.settings_wip', { defaultValue: 'В разработке...' })}</div>
      )
    },
    {
      id: 'storage',
      title: t('views.settings_storage', { defaultValue: 'Хранилище' }),
      subtitle: t('views.settings_storage_desc', { defaultValue: 'Управление кешами, загрузки, лимиты хранения' }),
      icon: <HardDrive className="text-primary" size={24} />,
      content: (
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#b3b3b3]">
              {t('settings.clear_cache_desc', { defaultValue: 'Очистка локального кэша без удаления скачанных треков или альбомов.' })}
            </p>
            <button 
              onClick={() => {
                clearAppCache();
                window.location.reload();
              }}
              className="flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl font-bold transition-colors w-full"
            >
              <Trash2 size={18} />
              <span>{isTauri() || isCapacitor() ? t('settings.clear_client_cache', { defaultValue: 'Очистить кэш клиента' }) : t('settings.clear_web_cache', { defaultValue: 'Очистить кэш веб-браузера' })}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-white/5 flex flex-col gap-2">
            <p className="text-xs text-[#b3b3b3]">
              {t('settings.delete_downloads_desc', { defaultValue: 'Удаление скачанных треков или альбомов с устройства.' })}
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-3 rounded-xl font-bold transition-colors w-full"
            >
              <Trash2 size={18} />
              <span>{t('settings.delete_downloads_btn', { defaultValue: 'Удалить загрузки' })}</span>
            </button>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="flex md:hidden flex-1 bg-transparent overflow-y-auto flex-col pb-32 w-full">
      <div className="px-4 pt-4 pb-2 sticky top-0 bg-black/40 backdrop-blur-xl z-[60] w-full">
        <div className="flex items-center gap-3 mb-4 w-full relative z-[70]">
          <div 
            className="flex items-center flex-1 bg-[#282828] rounded-xl px-3 py-2.5 border border-white/5 cursor-text"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={20} className="text-[#b3b3b3] mr-2 pointer-events-none" />
            <div className="bg-transparent text-[#b3b3b3] outline-none flex-1 text-[15px] font-medium select-none pointer-events-none">
              {t('views.search_placeholder', { defaultValue: 'Поиск...' })}
            </div>
          </div>
          <div className="flex-shrink-0">
            <LanguageSelector align="right" />
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-2">
          <FilterChip 
            icon={<CloudOff size={16} />} 
            label={t('views.filter_offline', { defaultValue: 'Офлайн' })} 
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
        <DeleteDownloadsModal onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  );
}
