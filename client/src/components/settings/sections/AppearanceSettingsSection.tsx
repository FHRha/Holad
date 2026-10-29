import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, X, Moon } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import type { AppTheme, AccentColor } from '../../../store/settingsStore';
import { pushPreferences } from '../../../api/preferences';
import { hexToHsl, hslToHex } from '../../../utils/colorUtils';
import Dropdown from '../../common/Dropdown';
import FlagIcon from '../../common/FlagIcon';
import SettingSection from '../SettingSection';

export interface AppearanceSettingsSectionProps {
  isMobile?: boolean;
  showLanguage?: boolean;
  className?: string;
  onColorPickerStateChange?: (isOpen: boolean) => void;
}

export function ThemeOption({
  label,
  value,
  current,
  onSelect,
}: {
  label: string;
  value: AppTheme;
  current: AppTheme;
  onSelect: (v: AppTheme) => void;
}) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium shadow-sm transition-colors ${
        current === value
          ? 'border-primary text-primary bg-primary/5'
          : 'border-foreground/10 text-secondary hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

export function AppIconOption({
  label,
  value,
  current,
  onSelect,
}: {
  label: string;
  value: 'wave_dark' | 'wave_light' | 'cassette';
  current: string;
  onSelect: (v: any) => void;
}) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-lg border text-sm font-medium shadow-sm transition-colors ${
        current === value
          ? 'border-primary text-primary bg-primary/5'
          : 'border-foreground/10 text-secondary hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

export function ColorOption({
  color,
  hex,
  current,
  onSelect,
}: {
  color: AccentColor;
  hex: string;
  current: AccentColor;
  onSelect: (v: AccentColor) => void;
}) {
  return (
    <button
      onClick={() => onSelect(color)}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
        current === color
          ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110'
          : 'hover:scale-110'
      }`}
      style={{ backgroundColor: hex }}
    />
  );
}

export default function AppearanceSettingsSection({
  isMobile = false,
  showLanguage = false,
  className = '',
  onColorPickerStateChange,
}: AppearanceSettingsSectionProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [customHexInput, setCustomHexInput] = useState('');
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
    onColorPickerStateChange?.(true);
  };

  const closeColorPicker = () => {
    setEditingColorIndex(null);
    onColorPickerStateChange?.(false);
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
      if (settings.syncTheme) {
        pushPreferences({
          theme: settings.theme,
          accent_color: hex,
          custom_colors: JSON.stringify(settings.customColors),
        });
      }
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Interface Language (if enabled) */}
      {showLanguage && (
        <SettingSection title={t('settings.language')} isMobile={isMobile}>
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
          <label className="flex items-center gap-3 cursor-pointer group mt-2">
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
        </SettingSection>
      )}

      {/* 2. Theme */}
      <SettingSection title={t('settings.theme') || 'Тема'} isMobile={isMobile}>
        {isMobile ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#b3b3b3] uppercase tracking-wider">
                {t('views.settings_theme')}
              </span>
              <span className="text-xs text-secondary font-medium">
                {t('settings.mobile_dark_only', 'Только тёмная тема')}
              </span>
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
          </div>
        ) : (
          <div className="flex gap-2">
            <ThemeOption
              label={t('settings.theme_dark', 'Dark')}
              value="dark"
              current={settings.theme}
              onSelect={(val) => {
                settings.setTheme(val);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: val,
                    accent_color: settings.accentColor,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ThemeOption
              label={t('settings.theme_light', 'Light')}
              value="light"
              current={settings.theme}
              onSelect={(val) => {
                settings.setTheme(val);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: val,
                    accent_color: settings.accentColor,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ThemeOption
              label={t('settings.theme_system', 'System')}
              value="system"
              current={settings.theme}
              onSelect={(val) => {
                settings.setTheme(val);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: val,
                    accent_color: settings.accentColor,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
          </div>
        )}
        <label className="flex items-center gap-3 cursor-pointer group mt-3">
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
                  custom_colors: JSON.stringify(settings.customColors),
                });
              }
            }}
            className="accent-primary w-4 h-4 rounded cursor-pointer"
          />
          <span className="group-hover:text-primary transition-colors text-xs text-secondary">
            {t('settings.sync_theme')}
          </span>
        </label>
      </SettingSection>

      {/* 3. App Icon */}
      <SettingSection title={t('settings.appIcon') || 'App Icon'} isMobile={isMobile}>
        <div className="flex gap-2">
          <AppIconOption
            label="Wave Dark"
            value="wave_dark"
            current={settings.appIcon}
            onSelect={settings.setAppIcon}
          />
          <AppIconOption
            label="Wave Light"
            value="wave_light"
            current={settings.appIcon}
            onSelect={settings.setAppIcon}
          />
          <AppIconOption
            label="Cassette"
            value="cassette"
            current={settings.appIcon}
            onSelect={settings.setAppIcon}
          />
        </div>
      </SettingSection>

      {/* 4. Accent Color & Custom Colors */}
      <SettingSection title={t('settings.accentColor') || 'Цвет'} isMobile={isMobile}>
        <div className="flex flex-col gap-3">
          <div className={`flex gap-2 ${isMobile ? 'flex-wrap' : ''}`}>
            <ColorOption
              color="green"
              hex="#1db954"
              current={settings.accentColor}
              onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: settings.theme,
                    accent_color: color,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ColorOption
              color="blue"
              hex="#3b82f6"
              current={settings.accentColor}
              onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: settings.theme,
                    accent_color: color,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ColorOption
              color="purple"
              hex="#a855f7"
              current={settings.accentColor}
              onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: settings.theme,
                    accent_color: color,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ColorOption
              color="pink"
              hex="#ec4899"
              current={settings.accentColor}
              onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: settings.theme,
                    accent_color: color,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
            <ColorOption
              color="orange"
              hex="#f97316"
              current={settings.accentColor}
              onSelect={(color) => {
                settings.setAccentColor(color);
                if (settings.syncTheme) {
                  pushPreferences({
                    theme: settings.theme,
                    accent_color: color,
                    custom_colors: JSON.stringify(settings.customColors),
                  });
                }
              }}
            />
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
                      if (isMobile && editingColorIndex === idx) {
                        closeColorPicker();
                      } else {
                        openColorPicker(idx, color);
                      }
                    } else {
                      settings.setAccentColor(color);
                      closeColorPicker();
                      if (settings.syncTheme) {
                        pushPreferences({
                          theme: settings.theme,
                          accent_color: color,
                          custom_colors: JSON.stringify(settings.customColors),
                        });
                      }
                    }
                  }}
                  className={`relative ${
                    isMobile ? 'w-10 h-10' : 'w-8 h-8'
                  } rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary'
                      : isEmpty
                        ? 'border-dashed border-foreground/20 hover:bg-foreground/10'
                        : isMobile
                          ? 'border-white/10 hover:border-white/30'
                          : 'border-white/10 hover:border-white/30 hover:scale-110'
                  }`}
                  style={color ? { backgroundColor: color } : {}}
                  title={
                    isEmpty
                      ? t('settings.add_color')
                      : isSelected
                        ? t('settings.edit_color')
                        : t('settings.custom_color_select')
                  }
                >
                  {isEmpty && <span className="text-foreground/40 text-lg font-light">+</span>}
                  {isSelected && (
                    <div
                      className={`absolute inset-0 bg-black/40 ${
                        isMobile ? 'flex' : 'opacity-0 hover:opacity-100 flex transition-opacity'
                      } items-center justify-center rounded-full`}
                    >
                      <Pencil size={isMobile ? 14 : 12} className="text-[#b3b3b3]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile inline color picker */}
          {isMobile && editingColorIndex !== null && (
            <div className="bg-black/30 p-4 rounded-2xl border border-white/10 mt-2 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-sm">{t('views.settings_color_setup')}</span>
                <button onClick={closeColorPicker}>
                  <Check size={18} className="text-primary" />
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => updateFromHsl(parseInt(e.target.value), sat, light)}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-red-500 via-green-500 to-blue-500"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={sat}
                onChange={(e) => updateFromHsl(hue, parseInt(e.target.value), light)}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-gray-500 to-blue-500"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={light}
                onChange={(e) => updateFromHsl(hue, sat, parseInt(e.target.value))}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-black via-gray-500 to-white"
              />
            </div>
          )}
        </div>
      </SettingSection>

      {/* 5. Desktop HSL Overlay Modal */}
      {!isMobile && editingColorIndex !== null && (
        <div className="absolute inset-0 z-50 bg-card flex flex-col p-6 animate-in fade-in duration-150">
          <button
            onClick={closeColorPicker}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-foreground/10 transition-colors z-10"
          >
            <X size={20} />
          </button>
          <h3 className="text-xl font-bold mb-2">{t('settings.custom_color_select')}</h3>

          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md mx-auto space-y-4">
            <div
              className="w-20 h-20 rounded-full shadow-2xl border-4 border-white/10 transition-colors duration-100"
              style={{ backgroundColor: customHexInput }}
            />

            <div className="w-full space-y-4 bg-background/50 p-5 rounded-2xl border border-white/5">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.hue')}</span>
                  <span>{hue}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={hue}
                  onChange={(e) => updateFromHsl(parseInt(e.target.value), sat, light)}
                  className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background:
                      'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.saturation')}</span>
                  <span>{sat}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sat}
                  onChange={(e) => updateFromHsl(hue, parseInt(e.target.value), light)}
                  className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background: `linear-gradient(to right, hsl(${hue}, 0%, ${light}%), hsl(${hue}, 100%, ${light}%))`,
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.lightness')}</span>
                  <span>{light}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={light}
                  onChange={(e) => updateFromHsl(hue, sat, parseInt(e.target.value))}
                  className="w-full h-4 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background: `linear-gradient(to right, #000, hsl(${hue}, ${sat}%, 50%), #fff)`,
                  }}
                />
              </div>
            </div>

            <div className="w-full relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">
                HEX
              </span>
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
                    setHue(h);
                    setSat(s);
                    setLight(l);
                  }
                }}
                className="w-full bg-background border border-white/10 rounded-xl py-3 pl-14 pr-4 font-mono text-center text-lg outline-none focus:border-primary transition-colors uppercase"
                maxLength={7}
              />
            </div>

            <button
              onClick={closeColorPicker}
              className="w-full py-2.5 bg-white text-black font-bold rounded-xl hover:bg-gray-200 flex items-center justify-center gap-2 transition-colors"
            >
              <Check size={20} />
              {t('settings.save_and_close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
