import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Check, X, Moon, Sun, Monitor, Palette, AppWindow, Paintbrush, Plus } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import type { AppTheme, AccentColor } from '../../../store/settingsStore';
import { pushPreferences } from '../../../api/preferences';
import { hexToHsl, hslToHex } from '../../../utils/colorUtils';
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
  icon,
  onSelect,
}: {
  label: string;
  value: AppTheme;
  current: AppTheme;
  icon?: React.ReactNode;
  onSelect: (v: AppTheme) => void;
}) {
  const isSelected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2.5 ${
        isSelected
          ? 'border-primary/50 text-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
          : 'border-border/60 bg-foreground/[0.03] text-secondary hover:border-border hover:text-foreground'
      }`}
    >
      {icon}
      <span>{label}</span>
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
  const isSelected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`flex-1 py-3 px-3 rounded-xl border text-xs sm:text-sm font-medium transition-all text-center truncate ${
        isSelected
          ? 'border-primary/50 text-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
          : 'border-border/60 bg-foreground/[0.03] text-secondary hover:border-border hover:text-foreground'
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
  const isSelected = current === color;
  return (
    <button
      type="button"
      onClick={() => onSelect(color)}
      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm ${
        isSelected
          ? 'ring-2 ring-offset-2 ring-offset-card ring-primary scale-110'
          : 'hover:scale-110 opacity-90 hover:opacity-100'
      }`}
      style={{ backgroundColor: hex }}
      title={color}
    />
  );
}

export default function AppearanceSettingsSection({
  isMobile = false,
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
      {/* 1. Theme */}
      <SettingSection
        title={t('settings.theme') || 'Тема оформления'}
        icon={<Palette size={16} />}
        isMobile={isMobile}
      >
        {isMobile ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-secondary">
                {t('views.settings_theme')}
              </span>
              <span className="text-xs text-secondary/80 font-medium">
                {t('settings.mobile_dark_only', 'Тёмная тема (AMOLED)')}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled
                className="flex-1 py-3 px-4 rounded-xl border text-sm font-medium border-primary/50 text-primary bg-primary/10 cursor-default flex items-center justify-center gap-2"
              >
                <Moon size={16} />
                <span>{t('settings.theme_dark', 'Dark')}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2.5">
              <ThemeOption
                label={t('settings.theme_dark', 'Dark')}
                value="dark"
                icon={<Moon size={16} />}
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
                icon={<Sun size={16} />}
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
                icon={<Monitor size={16} />}
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

            <label className="flex items-center gap-3 cursor-pointer group pt-1">
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
          </div>
        )}
      </SettingSection>

      {/* 3. App Icon */}
      <SettingSection
        title={t('settings.appIcon') || 'Иконка приложения'}
        icon={<AppWindow size={16} />}
        isMobile={isMobile}
      >
        <div className="flex gap-2.5">
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
      <SettingSection
        title={t('settings.accentColor') || 'Акцентный цвет'}
        icon={<Paintbrush size={16} />}
        description={t('settings.accent_color_desc', 'Выберите предустановленный оттенок или настройте свой')}
        isMobile={isMobile}
      >
        <div className="flex flex-col gap-4">
          <div className={`flex gap-3 items-center ${isMobile ? 'flex-wrap' : ''}`}>
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

            <div className="h-6 w-[1px] bg-border mx-1 hidden sm:block" />

            {/* 3 Custom Slots */}
            <div className="flex items-center gap-2.5">
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
                      isMobile ? 'w-10 h-10' : 'w-9 h-9'
                    } rounded-full border-2 transition-all cursor-pointer flex items-center justify-center ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary scale-110 shadow-md'
                        : isEmpty
                          ? 'border-dashed border-border/80 hover:border-border hover:bg-foreground/[0.05]'
                          : 'border-border/60 hover:border-border hover:scale-105'
                    }`}
                    style={color ? { backgroundColor: color } : {}}
                    title={
                      isEmpty
                        ? t('settings.add_color', 'Добавить свой цвет')
                        : isSelected
                          ? t('settings.edit_color', 'Редактировать цвет')
                          : t('settings.custom_color_select', 'Выбрать этот цвет')
                    }
                  >
                    {isEmpty && <Plus size={14} strokeWidth={2.2} className="text-secondary" />}
                    {isSelected && (
                      <div
                        className={`absolute inset-0 bg-black/40 ${
                          isMobile ? 'flex' : 'opacity-0 hover:opacity-100 flex transition-opacity'
                        } items-center justify-center rounded-full`}
                      >
                        <Pencil size={isMobile ? 14 : 12} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile inline color picker */}
          {isMobile && editingColorIndex !== null && (
            <div className="bg-card p-4 rounded-2xl border border-border space-y-4 animate-in fade-in">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm text-foreground">{t('views.settings_color_setup', 'Настройка цвета')}</span>
                <button type="button" onClick={closeColorPicker} className="p-1 rounded-lg hover:bg-foreground/10">
                  <Check size={18} className="text-primary" />
                </button>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => updateFromHsl(parseInt(e.target.value, 10), sat, light)}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-red-500 via-green-500 to-blue-500"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={sat}
                onChange={(e) => updateFromHsl(hue, parseInt(e.target.value, 10), light)}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-gray-500 to-blue-500"
              />
              <input
                type="range"
                min="0"
                max="100"
                value={light}
                onChange={(e) => updateFromHsl(hue, sat, parseInt(e.target.value, 10))}
                className="w-full h-3 rounded-full appearance-none bg-gradient-to-r from-black via-gray-500 to-white"
              />
            </div>
          )}
        </div>
      </SettingSection>

      {/* 5. Desktop HSL Overlay Modal */}
      {!isMobile && editingColorIndex !== null && (
        <div className="absolute inset-0 z-50 bg-card/95 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-150">
          <button
            type="button"
            onClick={closeColorPicker}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-foreground/10 transition-colors z-10"
          >
            <X size={20} />
          </button>
          <h3 className="text-xl font-bold mb-2">{t('settings.custom_color_select', 'Настройка палитры')}</h3>

          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-md mx-auto space-y-5">
            <div
              className="w-20 h-20 rounded-full shadow-2xl border-4 border-border transition-colors duration-100"
              style={{ backgroundColor: customHexInput }}
            />

            <div className="w-full space-y-4 bg-background/60 p-5 rounded-2xl border border-border">
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.hue', 'Оттенок (Hue)')}</span>
                  <span className="font-mono">{hue}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={hue}
                  onChange={(e) => updateFromHsl(parseInt(e.target.value, 10), sat, light)}
                  className="w-full h-3.5 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background:
                      'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.saturation', 'Насыщенность')}</span>
                  <span className="font-mono">{sat}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sat}
                  onChange={(e) => updateFromHsl(hue, parseInt(e.target.value, 10), light)}
                  className="w-full h-3.5 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background: `linear-gradient(to right, hsl(${hue}, 0%, ${light}%), hsl(${hue}, 100%, ${light}%))`,
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>{t('settings.lightness', 'Яркость')}</span>
                  <span className="font-mono">{light}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={light}
                  onChange={(e) => updateFromHsl(hue, sat, parseInt(e.target.value, 10))}
                  className="w-full h-3.5 rounded-full appearance-none cursor-pointer outline-none"
                  style={{
                    background: `linear-gradient(to right, #000, hsl(${hue}, ${sat}%, 50%), #fff)`,
                  }}
                />
              </div>
            </div>

            <div className="w-full relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono text-sm">
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
                className="w-full bg-background border border-border rounded-xl py-2.5 pl-14 pr-4 font-mono text-center text-base outline-none focus:border-primary transition-colors uppercase text-foreground"
                maxLength={7}
              />
            </div>

            <button
              type="button"
              onClick={closeColorPicker}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 flex items-center justify-center gap-2 transition-opacity shadow-lg shadow-primary/20"
            >
              <Check size={18} />
              <span>{t('settings.save_and_close', 'Сохранить и закрыть')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
