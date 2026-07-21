import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Palette, Settings2, MonitorPlay, Pencil, Check, HardDrive, FolderSearch, Trash2 } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { AppTheme, AccentColor, StartPage } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { clearAppCache } from '../../utils/storage';
import Slider from '../common/Slider';
import Dropdown from '../common/Dropdown';
import DeleteDownloadsModal from './DeleteDownloadsModal';

// Helper for HSL -> HEX conversion
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

// Helper for HEX -> HSL conversion
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

export default function SettingsModal() {
  const { t } = useTranslation();
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const settings = useSettingsStore();
  
  // Use selectors to prevent unnecessary re-renders every second when a track is playing!
  const volume = usePlayerStore(state => state.volume);
  const isAutoDjEnabled = usePlayerStore(state => state.isAutoDjEnabled);
  const setVolume = usePlayerStore(state => state.setVolume);
  const toggleAutoDj = usePlayerStore(state => state.toggleAutoDj);
  const volumeMultiplier = usePlayerStore(state => state.volumeMultiplier || 1.0);
  const setVolumeMultiplier = usePlayerStore(state => state.setVolumeMultiplier);
  
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'player' | 'storage'>('general');
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'done'>('idle');
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [customHexInput, setCustomHexInput] = useState('');
  
  // HSL State for Color Picker
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(100);
  const [light, setLight] = useState(50);

  const openColorPicker = (index: number, color: string) => {
    const baseColor = color || '#1db954';
    setCustomHexInput(baseColor);
    setEditingColorIndex(index);
    const [h, s, l] = hexToHsl(baseColor);
    setHue(h);
    setSat(s);
    setLight(l);
  };

  const updateFromHsl = (h: number, s: number, l: number) => {
    setHue(h);
    setSat(s);
    setLight(l);
    const hex = hslToHex(h, s, l);
    setCustomHexInput(hex);
    if (editingColorIndex !== null) {
      settings.setCustomColor(editingColorIndex, hex);
      settings.setAccentColor(hex);
    }
  };

  const handleReset = () => {
    if (resetState === 'idle') {
      setResetState('confirm');
      setTimeout(() => {
        setResetState((prev) => prev === 'confirm' ? 'idle' : prev);
      }, 3000);
    } else if (resetState === 'confirm') {
      settings.setTheme('dark');
      settings.setAccentColor('green');
      settings.setCustomColor(0, '');
      settings.setCustomColor(1, '');
      settings.setCustomColor(2, '');
      settings.setStartPage('/Holad');
      settings.setLanguage('ru');
      setResetState('done');
      setTimeout(() => setResetState('idle'), 2000);
    }
  };

  // If closed, return nothing
  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-3xl rounded-xl shadow-2xl border border-white/10 flex h-[85vh] md:h-[500px]">
        
        {/* Sidebar */}
        <div className="w-64 bg-background/50 border-r border-white/5 flex flex-col p-4">
          <h2 className="text-lg font-bold mb-4 px-2">{t('sidebar.settings') || 'Настройки'}</h2>
          
          <div className="flex flex-col gap-2 relative">
            <button 
              onClick={() => { setActiveTab('general'); setEditingColorIndex(null); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'general' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              <Settings2 size={20} className={activeTab === 'general' ? 'animate-pulse-slow' : ''} />
              <span>{t('settings.general')}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('appearance'); setEditingColorIndex(null); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'appearance' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              <Palette size={20} className={activeTab === 'appearance' ? 'animate-pulse-slow' : ''} />
              <span>{t('settings.appearance')}</span>
            </button>
            
            <button 
              onClick={() => { setActiveTab('player'); setEditingColorIndex(null); }}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'player' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              <MonitorPlay size={20} className={activeTab === 'player' ? 'animate-pulse-slow' : ''} />
              <span>{t('settings.player')}</span>
            </button>

            {isTauri() && (
              <button 
                onClick={() => { setActiveTab('storage'); setEditingColorIndex(null); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${activeTab === 'storage' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105 z-10' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
              >
                <HardDrive size={20} className={activeTab === 'storage' ? 'animate-pulse-slow' : ''} />
                <span>{t('settings.storage', { defaultValue: 'Хранилище' })}</span>
              </button>
            )}
          </div>
          
          <div className="mt-auto pt-4">
            <button 
              onClick={handleReset}
              disabled={resetState === 'done'}
              className={`w-full py-2 text-xs font-medium rounded-lg transition-colors ${
                resetState === 'done'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                  : resetState === 'confirm'
                    ? 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-400/10'
              }`}
            >
              {resetState === 'done' 
                ? (t('settings.reset_done') || '✅ Сброшено!') 
                : resetState === 'confirm' 
                  ? (t('settings.confirm_reset') || 'Вы уверены?') 
                  : (t('settings.reset') || 'Сбросить')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <button 
            onClick={() => setSettingsOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-20 bg-background/50 backdrop-blur-md"
          >
            <X size={20} />
          </button>
          
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-xl font-bold mb-6">
              {activeTab === 'general' && (t('settings.general') || 'Общие')}
              {activeTab === 'appearance' && (t('settings.appearance') || 'Внешний вид')}
              {activeTab === 'player' && (t('settings.player') || 'Плеер')}
              {activeTab === 'storage' && (t('settings.storage', { defaultValue: 'Хранилище' }))}
            </h3>

            {activeTab === 'general' && (
              <div className="space-y-6">
                <SettingSection title={t('settings.language') || 'Язык'}>
                  <Dropdown
                    value={settings.language}
                    onChange={(val) => settings.setLanguage(val)}
                    options={[
                      { label: 'Русский', value: 'ru' },
                      { label: 'English', value: 'en' }
                    ]}
                  />
                </SettingSection>

                <SettingSection title={t('settings.startPage', { defaultValue: 'Стартовая страница' })}>
                  <Dropdown
                    value={settings.startPage}
                    onChange={(val) => settings.setStartPage(val as StartPage)}
                    options={[
                      { label: t('settings.start_home', { defaultValue: 'Главная' }), value: '/Holad' },
                      { label: t('settings.start_albums', { defaultValue: 'Альбомы' }), value: '/Holad/albums' },
                      { label: t('settings.start_radio', { defaultValue: 'Радио' }), value: '/Holad/radio' },
                      { label: t('settings.start_favorites', { defaultValue: 'Избранное' }), value: '/Holad/favorites' }
                    ]}
                  />
                </SettingSection>

                {/* Tauri-only Settings */}
                {('__TAURI_INTERNALS__' in window) && (
                  <SettingSection title={t('settings.desktop', { defaultValue: 'Десктоп' })}>
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
                            }
                          }}
                          className="accent-primary w-4 h-4 rounded cursor-pointer"
                        />
                        <span className="group-hover:text-primary transition-colors text-sm">
                          {t('settings.run_on_startup', { defaultValue: 'Автозапуск при старте системы' })}
                        </span>
                      </label>
                      
                      <label className={`flex items-center gap-3 cursor-pointer group pl-6 ${!settings.runOnStartup ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={settings.startMinimized} 
                          onChange={(e) => settings.setStartMinimized(e.target.checked)}
                          disabled={!settings.runOnStartup}
                          className="accent-primary w-4 h-4 rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="group-hover:text-primary transition-colors text-sm">
                          {t('settings.start_minimized', { defaultValue: 'Запускать свернутым в трей' })}
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
                          {t('settings.close_to_tray', { defaultValue: 'Сворачивать в трей при закрытии (крестик)' })}
                        </span>
                      </label>
                    </div>
                  </SettingSection>
                )}
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="space-y-6">
                <SettingSection title={t('settings.theme') || 'Тема'}>
                  <div className="flex gap-2">
                    <ThemeOption label="Dark" value="dark" current={settings.theme} onSelect={settings.setTheme} />
                    <ThemeOption label="Light" value="light" current={settings.theme} onSelect={settings.setTheme} />
                    <ThemeOption label="System" value="system" current={settings.theme} onSelect={settings.setTheme} />
                  </div>
                </SettingSection>

                <SettingSection title={t('settings.accentColor') || 'Цвет'}>
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
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
                                openColorPicker(idx, color);
                              } else {
                                settings.setAccentColor(color);
                              }
                            }}
                            className={`relative w-8 h-8 rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                              isSelected 
                                ? 'border-primary ring-2 ring-primary' 
                                : isEmpty 
                                  ? 'border-dashed border-white/20 hover:bg-white/10'
                                  : 'border-white/10 hover:border-white/30 hover:scale-110'
                            }`}
                            style={color ? { backgroundColor: color } : {}}
                            title={isEmpty ? t('settings.add_color', { defaultValue: 'Добавить цвет' }) : isSelected ? t('settings.edit_color', { defaultValue: 'Редактировать цвет' }) : t('settings.custom_color_select', { defaultValue: 'Выбрать цвет' })}
                          >
                            {isEmpty && <span className="text-white/40 text-lg font-light">+</span>}
                            {isSelected && (
                              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity rounded-full">
                                <Pencil size={12} className="text-white" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </SettingSection>
              </div>
            )}

            {editingColorIndex !== null && (
              <div className="absolute inset-0 z-50 bg-card flex flex-col p-6">
                <button 
                  onClick={() => setEditingColorIndex(null)}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors z-10"
                >
                  <X size={20} />
                </button>
                <h3 className="text-xl font-bold mb-2">{t('settings.custom_color_select', { defaultValue: 'Выбор своего цвета' })}</h3>
                
                <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md mx-auto space-y-4">
                  {/* Big Preview */}
                  <div 
                    className="w-20 h-20 rounded-full shadow-2xl border-4 border-white/10 transition-colors duration-100"
                    style={{ backgroundColor: customHexInput }}
                  />

                  {/* True HSL Color Picker */}
                  <div className="w-full space-y-4 bg-background/50 p-5 rounded-2xl border border-white/5">
                    {/* Hue Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-secondary font-medium">
                        <span>{t('settings.hue', { defaultValue: 'Оттенок' })}</span>
                        <span>{hue}°</span>
                      </div>
                      <input 
                        type="range" min="0" max="360" 
                        value={hue} onChange={(e) => updateFromHsl(parseInt(e.target.value), sat, light)}
                        className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
                      />
                    </div>

                    {/* Saturation Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-secondary font-medium">
                        <span>{t('settings.saturation', { defaultValue: 'Насыщенность' })}</span>
                        <span>{sat}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={sat} onChange={(e) => updateFromHsl(hue, parseInt(e.target.value), light)}
                        className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                        style={{ background: `linear-gradient(to right, hsl(${hue}, 0%, ${light}%), hsl(${hue}, 100%, ${light}%))` }}
                      />
                    </div>

                    {/* Lightness Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-secondary font-medium">
                        <span>{t('settings.lightness', { defaultValue: 'Яркость' })}</span>
                        <span>{light}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={light} onChange={(e) => updateFromHsl(hue, sat, parseInt(e.target.value))}
                        className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                        style={{ background: `linear-gradient(to right, #000, hsl(${hue}, ${sat}%, 50%), #fff)` }}
                      />
                    </div>
                  </div>

                  {/* Manual HEX input */}
                  <div className="w-full relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">HEX</span>
                    <input 
                      type="text" 
                      value={customHexInput}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (!val.startsWith('#')) val = '#' + val;
                        setCustomHexInput(val);
                        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                          settings.setCustomColor(editingColorIndex, val);
                          settings.setAccentColor(val);
                          const [h, s, l] = hexToHsl(val);
                          setHue(h); setSat(s); setLight(l);
                        }
                      }}
                      className="w-full bg-background border border-white/10 rounded-xl py-3 pl-14 pr-4 font-mono text-center text-lg outline-none focus:border-primary transition-colors uppercase"
                      maxLength={7}
                    />
                  </div>

                  <button 
                    onClick={() => setEditingColorIndex(null)}
                    className="w-full py-2.5 bg-white text-black font-bold rounded-xl hover:bg-gray-200 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Check size={20} />
                    {t('settings.save_and_close', { defaultValue: 'Сохранить и закрыть' })}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'player' && (
              <div className="space-y-8">
                <SettingSection title={t('settings.clickAction') || 'Поведение при клике на трек'}>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="radio" 
                        name="clickAction" 
                        value="play_now" 
                        checked={settings.clickAction === 'play_now'} 
                        onChange={() => settings.setClickAction('play_now')}
                        className="accent-primary w-4 h-4 cursor-pointer"
                      />
                      <span className="group-hover:text-primary transition-colors text-sm">
                        {t('settings.replace_queue', { defaultValue: 'Заменить очередь (Play Now)' })}
                      </span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="radio" 
                        name="clickAction" 
                        value="play_next" 
                        checked={settings.clickAction === 'play_next'} 
                        onChange={() => settings.setClickAction('play_next')}
                        className="accent-primary w-4 h-4 cursor-pointer"
                      />
                      <span className="group-hover:text-primary transition-colors text-sm">
                        {t('settings.add_to_end', { defaultValue: 'Добавить в конец (Play Next)' })}
                      </span>
                    </label>
                  </div>
                </SettingSection>

                <SettingSection title={t('settings.autoDj') || 'АВТО DJ по умолчанию'}>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={isAutoDjEnabled} 
                      onChange={() => toggleAutoDj()}
                      className="accent-primary w-4 h-4 rounded cursor-pointer"
                    />
                    <span className="group-hover:text-primary transition-colors text-sm">
                      {t('settings.auto_dj_desc', { defaultValue: 'Автоматически добавлять похожие треки по окончании очереди' })}
                    </span>
                  </label>
                </SettingSection>

                <SettingSection title={t('settings.crossfade', { defaultValue: 'Плавный переход (Crossfade)' })}>
                  <div className="flex flex-col gap-4">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={settings.isCrossfadeEnabled} 
                        onChange={(e) => settings.setIsCrossfadeEnabled(e.target.checked)}
                        className="accent-primary w-4 h-4 rounded cursor-pointer"
                      />
                      <span className="group-hover:text-primary transition-colors text-sm">
                        {t('settings.crossfade_desc', { defaultValue: 'Плавный переход между треками' })}
                      </span>
                    </label>
                    {settings.isCrossfadeEnabled && (
                      <div className="pt-2 pb-1 opacity-100 transition-opacity">
                        <div className="flex justify-between text-xs text-secondary mb-2">
                          <span>{t('settings.crossfade_duration', { defaultValue: 'Длительность перехода' })}</span>
                          <span>{settings.crossfadeDuration} сек</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="12" 
                          value={settings.crossfadeDuration} 
                          onChange={(e) => settings.setCrossfadeDuration(parseInt(e.target.value))}
                          className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-xs text-secondary mt-2">
                          <span>1s</span>
                          <span>12s</span>
                        </div>
                      </div>
                    )}
                  </div>
                </SettingSection>

                <SettingSection title={t('settings.defaultVolume') || 'Громкость'}>
                  <div className="pt-2 pb-1">
                    <Slider 
                      value={volume} 
                      onChange={setVolume} 
                      thickness="thick" 
                    />
                  </div>
                  <div className="flex justify-between text-xs text-secondary mt-3">
                    <span>0%</span>
                    <span>{Math.round(volume * 100)}%</span>
                  </div>
                </SettingSection>

                <SettingSection title={t('settings.volume_multiplier', { defaultValue: 'Усилитель громкости (до 300%)' })}>
                  <div className="flex items-center gap-3 pt-2 pb-1">
                    <input 
                      type="number"
                      min="1"
                      max="300"
                      value={Math.round(volumeMultiplier * 100)}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) setVolumeMultiplier(Math.min(Math.max(val, 1), 300) / 100);
                      }}
                      className="bg-black/20 border border-white/10 rounded-lg py-2 px-3 w-24 text-center outline-none focus:border-primary transition-colors text-foreground font-mono"
                    />
                    <span className="text-sm text-secondary font-medium">%</span>
                  </div>
                </SettingSection>
              </div>
            )}

            {activeTab === 'storage' && (
              <div className="space-y-8">
                <StorageSettingsTab t={t} />
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider">{title}</h4>
      <div className="bg-background/50 p-4 rounded-xl border border-white/5">
        {children}
      </div>
    </div>
  );
}

function ThemeOption({ label, value, current, onSelect }: { label: string, value: AppTheme, current: AppTheme, onSelect: (v: AppTheme) => void }) {
  return (
    <button 
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${current === value ? 'border-primary text-primary bg-primary/5' : 'border-white/10 text-secondary hover:border-white/30 hover:text-foreground'}`}
    >
      {label}
    </button>
  );
}

function ColorOption({ color, hex, current, onSelect }: { color: AccentColor, hex: string, current: AccentColor, onSelect: (v: AccentColor) => void }) {
  return (
    <button 
      onClick={() => onSelect(color)}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${current === color ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110' : 'hover:scale-110'}`}
      style={{ backgroundColor: hex }}
    />
  );
}

function StorageSettingsTab({ t }: { t: any }) {
  const { downloadDirectory, setDownloadDirectory } = useDownloadStore();
  const [actualDir, setActualDir] = useState<string>('Загрузка...');
  const [isMoving, setIsMoving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  React.useEffect(() => {
    if (downloadDirectory) {
      setActualDir(downloadDirectory);
    } else {
      StorageManager.getDefaultDownloadDir().then(setActualDir).catch(() => setActualDir('Ошибка получения пути'));
    }
  }, [downloadDirectory]);

  const handleSelectDirectory = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: t('settings.select_download_folder', { defaultValue: 'Выберите папку для загрузок' })
      });
      if (selectedPath && typeof selectedPath === 'string') {
        const currentDir = downloadDirectory || await StorageManager.getDefaultDownloadDir();
        if (currentDir !== selectedPath) {
          setIsMoving(true);
          try {
             await StorageManager.moveDirectory(currentDir, selectedPath);
          } catch (err) {
             console.error("Failed to move directory:", err);
          }
          setDownloadDirectory(selectedPath);
          setIsMoving(false);
        }
      }
    } catch (err) {
      console.error(err);
      setIsMoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingSection title={t('settings.download_location', { defaultValue: 'Папка для загрузок' })}>
        <div className="flex flex-col gap-4">
          <div className="bg-black/30 p-3 rounded-lg border border-white/5 truncate max-w-full text-sm font-mono text-secondary" title={actualDir}>
            {actualDir}
          </div>
          <button 
            onClick={handleSelectDirectory}
            disabled={isMoving}
            className="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-2.5 rounded-xl font-medium transition-colors"
          >
            {isMoving ? <span className="animate-pulse">{t('settings.moving_files', { defaultValue: 'Перемещение файлов...' })}</span> : (
              <>
                <FolderSearch size={18} />
                <span>{t('settings.change_folder', { defaultValue: 'Изменить папку' })}</span>
              </>
            )}
          </button>
        </div>
      </SettingSection>

      <SettingSection title={t('settings.app_cache', { defaultValue: 'Кэш приложения' })}>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-secondary mb-2">
              {t('settings.clear_cache_desc', { defaultValue: 'Очистка локального кэша без удаления скачанных треков или альбомов.' })}
            </p>
            <button 
              onClick={() => {
                clearAppCache();
                window.location.reload();
              }}
              className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white py-2.5 px-3 rounded-xl font-medium transition-colors h-auto min-h-[44px] flex-wrap"
            >
              <Trash2 size={18} className="flex-shrink-0" />
              <span className="text-center text-sm">{isTauri() || isCapacitor() ? t('settings.clear_client_cache', { defaultValue: 'Очистить кэш клиента' }) : t('settings.clear_web_cache', { defaultValue: 'Очистить кэш веб-браузера' })}</span>
            </button>
          </div>

          <div className="pt-2 border-t border-white/5">
            <p className="text-xs text-secondary mb-2">
              {t('settings.delete_downloads_desc', { defaultValue: 'Удаление скачанных треков или альбомов с устройства.' })}
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-2.5 px-3 rounded-xl font-medium transition-colors h-auto min-h-[44px] flex-wrap"
            >
              <Trash2 size={18} className="flex-shrink-0" />
              <span className="text-center text-sm">{t('settings.delete_downloads_btn', { defaultValue: 'Удалить загрузки' })}</span>
            </button>
          </div>
        </div>
      </SettingSection>

      {showDeleteModal && (
        <DeleteDownloadsModal onClose={() => setShowDeleteModal(false)} />
      )}
    </div>
  );
}
