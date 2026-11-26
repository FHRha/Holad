import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Radio,
  Zap,
  ShieldAlert,
  Waves,
  FastForward,
  Activity,
  MousePointerClick,
  Sparkles,
  Volume2,
  Gauge,
  ChevronDown,
  DownloadCloud,
  Cpu,
  Globe,
  Speaker,
  RefreshCw,
} from 'lucide-react';
import { isTauri } from '../../../utils/StorageManager';
import { getAudioEngine } from '../../../audio/AudioEngine';
import { useSettingsStore } from '../../../store/settingsStore';
import { usePlayerStore } from '../../../store/playerStore';
import VolumeSlider from '../../common/VolumeSlider';
import Dropdown from '../../common/Dropdown';
import SettingSection from '../SettingSection';
import CrossfadeCurveVisualizer from '../CrossfadeCurveVisualizer';
import { SettingToggle, SettingRadioGroup } from '../controls';

export interface PlaybackSettingsSectionProps {
  mode?: 'all' | 'player' | 'audio';
  isMobile?: boolean;
  className?: string;
  showAdvanced?: boolean;
}

export default function PlaybackSettingsSection({
  mode = 'all',
  isMobile = false,
  className = '',
  showAdvanced,
}: PlaybackSettingsSectionProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();

  const isAdvanced = typeof showAdvanced === 'boolean' ? showAdvanced : settings.showAdvancedSettings;

  // Desktop player store selectors
  const desktopVolume = usePlayerStore((state) => state.volume);
  const desktopSetVolume = usePlayerStore((state) => state.setVolume);

  // Mobile player store selectors
  const mobileVolume = usePlayerStore((state) =>
    typeof state.mobileVolume === 'number' ? state.mobileVolume : 1.0
  );
  const mobileSetVolume = usePlayerStore((state) => state.setMobileVolume);

  const volume = isMobile ? mobileVolume : desktopVolume;
  const setVolume = isMobile ? mobileSetVolume : desktopSetVolume;

  const isAutoDjEnabled = usePlayerStore((state) => state.isAutoDjEnabled);
  const toggleAutoDj = usePlayerStore((state) => state.toggleAutoDj);

  const volumeMultiplier = usePlayerStore((state) =>
    typeof state.volumeMultiplier === 'number' ? state.volumeMultiplier : 1.0
  );
  const setVolumeMultiplier = usePlayerStore((state) => state.setVolumeMultiplier);

  const showPlayer = mode === 'all' || mode === 'player';
  const showAudio = mode === 'all' || mode === 'audio';

  const [outputDevices, setOutputDevices] = useState<Array<{ id: string; name: string; isDefault?: boolean }>>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  const loadOutputDevices = useCallback(async () => {
    if (!isTauri()) return;
    setIsLoadingDevices(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const devices = await invoke<Array<{ id: string; name: string; isDefault?: boolean }>>('audio_list_output_devices');
      if (Array.isArray(devices)) {
        setOutputDevices(devices);
      }
    } catch (err) {
      console.warn('[PlaybackSettingsSection] Failed to list audio output devices:', err);
    } finally {
      setIsLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (showAudio && isTauri()) {
      void loadOutputDevices();
    }
  }, [showAudio, loadOutputDevices]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* =========================================
          PLAYER SETTINGS SECTION
      ========================================= */}
      {showPlayer && (
        <>
          {/* Click Action */}
          <SettingSection
            title={t('settings.clickAction', 'Поведение при клике на трек')}
            icon={<MousePointerClick size={16} />}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name={isMobile ? 'm_clickAction' : 'clickAction'}
                  value="play_now"
                  checked={settings.clickAction === 'play_now'}
                  onChange={() => settings.setClickAction('play_now')}
                  className="accent-primary w-4 h-4 cursor-pointer"
                />
                <span className="group-hover:text-primary transition-colors text-sm">
                  {t('settings.replace_queue', 'Очистить очередь и воспроизвести сразу')}
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name={isMobile ? 'm_clickAction' : 'clickAction'}
                  value="play_next"
                  checked={settings.clickAction === 'play_next'}
                  onChange={() => settings.setClickAction('play_next')}
                  className="accent-primary w-4 h-4 cursor-pointer"
                />
                <span className="group-hover:text-primary transition-colors text-sm">
                  {t('settings.add_to_end', 'Добавить трек в конец очереди')}
                </span>
              </label>
            </div>
          </SettingSection>

          {/* Auto DJ */}
          <SettingSection
            title={t('settings.autoDj', 'АВТО DJ по умолчанию')}
            icon={<Sparkles size={16} />}
            isMobile={isMobile}
          >
            <SettingToggle
              title={t('settings.auto_dj_desc', 'Автоматически подбирать похожие треки в конец очереди')}
              checked={isAutoDjEnabled}
              onChange={toggleAutoDj}
            />

            {/* Auto DJ Repeat Strategy: rendered in Advanced Mode */}
            {isAdvanced && isAutoDjEnabled && (
              <div className="mt-4 pt-3 border-t border-border space-y-2">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  {t(
                    'settings.auto_dj_repeat_header',
                    'При включённом повторе альбома/плейлиста'
                  )}
                </div>
                <SettingRadioGroup
                  name={isMobile ? 'm_autoDjRepeatBehavior' : 'autoDjRepeatBehavior'}
                  value={settings.autoDjRepeatBehavior}
                  onChange={(val) => settings.setAutoDjRepeatBehavior(val as any)}
                  options={[
                    {
                      value: 'pause_on_repeat',
                      label: t(
                        'settings.auto_dj_repeat_priority',
                        'Приоритет повтора (приостанавливать Авто DJ, альбом играет по кругу)'
                      )
                    },
                    {
                      value: 'infinite_stream',
                      label: t(
                        'settings.auto_dj_repeat_infinite',
                        'Бесконечный поток (игнорировать повтор и добавлять похожие треки)'
                      )
                    }
                  ]}
                />
              </div>
            )}
          </SettingSection>

          {/* Default Volume */}
          <SettingSection
            title={t('settings.defaultVolume', 'Громкость по умолчанию')}
            icon={<Volume2 size={16} />}
            isMobile={isMobile}
          >
            <div className="pt-1 pb-1">
              <VolumeSlider value={volume} onChange={setVolume} />
            </div>
            <div className="flex justify-between text-xs text-secondary mt-2.5 font-mono">
              <span>0%</span>
              <span>{Math.round(volume * 100)}%</span>
            </div>
          </SettingSection>

          {/* Volume Multiplier / Amplifier */}
          <SettingSection
            title={t('settings.volume_multiplier', 'Усилитель громкости')}
            icon={<Gauge size={16} />}
            description={t(
              'settings.volume_multiplier_desc',
              'Программное усиление выходного сигнала (100% - 300%)'
            )}
            isMobile={isMobile}
          >
            <div className="pt-1 pb-1 space-y-3">
              <div className="flex justify-between items-center text-xs text-secondary font-medium">
                <span>{t('settings.volume_amplifier_level', 'Уровень усиления')}</span>
                <span className="font-mono text-foreground font-semibold px-2 py-0.5 rounded bg-foreground/[0.05] border border-border text-xs">
                  {Math.round(volumeMultiplier * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={Math.min(100, Math.round(volumeMultiplier * 100))}
                max="300"
                step="5"
                value={Math.round(volumeMultiplier * 100)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setVolumeMultiplier(val / 100);
                }}
                className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[11px] font-mono text-secondary">
                <span>100% ({t('common.normal', 'Норма')})</span>
                <span>300%</span>
              </div>
            </div>
          </SettingSection>
        </>
      )}

      {/* =========================================
          AUDIO SETTINGS SECTION
      ========================================= */}
      {showAudio && (
        <>
          {/* Audio Engine (Tauri native only) */}
          {isTauri() && (
            <SettingSection
              title={t('settings.audio_engine', 'Аудио-движок')}
              icon={<Cpu size={16} />}
              description={t(
                'settings.audio_engine_desc',
                'Выбор механизма воспроизведения аудиопотока'
              )}
              isMobile={isMobile}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Rust Engine (Rodio) */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.audioBackend === 'rust'}
                  aria-label={t('settings.audio_engine_rust_title', 'Нативный аудио-движок (Rust)')}
                  onClick={() => settings.setAudioBackend('rust')}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex flex-col gap-2 min-w-0 ${
                    settings.audioBackend === 'rust'
                      ? 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-foreground/[0.03] hover:border-border/80 hover:bg-foreground/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap size={16} className={settings.audioBackend === 'rust' ? 'text-primary' : 'text-secondary'} />
                      <span className={`text-sm font-semibold truncate ${settings.audioBackend === 'rust' ? 'text-primary' : 'text-foreground'}`}>
                        {t('settings.audio_engine_rust_title', 'Нативный аудио-движок (Rust)')}
                      </span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        settings.audioBackend === 'rust' ? 'border-primary' : 'border-border'
                      }`}
                    >
                      {settings.audioBackend === 'rust' && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {t(
                      'settings.audio_engine_rust_desc',
                      'Аппаратное воспроизведение с низким потреблением энергии и фоновым режимом'
                    )}
                  </p>
                </button>

                {/* 2. Web Audio API */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={settings.audioBackend === 'web'}
                  aria-label={t('settings.audio_engine_web_title', 'Web Audio API')}
                  onClick={() => settings.setAudioBackend('web')}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex flex-col gap-2 min-w-0 ${
                    settings.audioBackend === 'web'
                      ? 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/30'
                      : 'border-border bg-foreground/[0.03] hover:border-border/80 hover:bg-foreground/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe size={16} className={settings.audioBackend === 'web' ? 'text-primary' : 'text-secondary'} />
                      <span className={`text-sm font-semibold truncate ${settings.audioBackend === 'web' ? 'text-primary' : 'text-foreground'}`}>
                        {t('settings.audio_engine_web_title', 'Web Audio API')}
                      </span>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        settings.audioBackend === 'web' ? 'border-primary' : 'border-border'
                      }`}
                    >
                      {settings.audioBackend === 'web' && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">
                    {t(
                      'settings.audio_engine_web_desc',
                      'Браузерный движок с эквалайзером, нормализацией громкости и визуализатором'
                    )}
                  </p>
                </button>
              </div>
            </SettingSection>
          )}

          {/* Audio Output Device (Tauri Desktop only) */}
          {isTauri() && (
            <SettingSection
              title={t('settings.audio_output_device', 'Устройство вывода звука')}
              icon={<Speaker size={16} />}
              description={t(
                'settings.audio_output_device_desc',
                'Выбор устройства воспроизведения для этого компьютера'
              )}
              isMobile={isMobile}
            >
              <div className="flex items-center gap-2">
                <Dropdown
                  className="flex-1 min-w-0"
                  value={settings.audioOutputDeviceId || 'default'}
                  onChange={(val: string) => {
                    settings.setAudioOutputDeviceId(val);
                    getAudioEngine().setSinkId?.(val).catch((err) => {
                      console.warn('[PlaybackSettingsSection] Failed to set audio output device:', err);
                    });
                  }}
                  options={[
                    {
                      value: 'default',
                      label: t('settings.audio_output_default', 'По умолчанию (система)'),
                    },
                    ...outputDevices.map((dev) => ({
                      value: dev.id,
                      label: dev.isDefault
                        ? `${dev.name} (${t('settings.default', 'по умолчанию')})`
                        : dev.name,
                    })),
                  ]}
                />
                <button
                  type="button"
                  onClick={() => void loadOutputDevices()}
                  disabled={isLoadingDevices}
                  title={t('common.refresh', 'Обновить')}
                  aria-label={t('common.refresh', 'Обновить')}
                  className="p-2.5 rounded-xl border border-border bg-foreground/[0.03] hover:bg-foreground/[0.06] text-secondary hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
                >
                  <RefreshCw size={16} className={isLoadingDevices ? 'animate-spin' : ''} />
                </button>
              </div>
            </SettingSection>
          )}

          {/* Streaming Quality */}
          <SettingSection
            title={t('settings.streaming_quality', 'Качество потока (стриминга)')}
            icon={<Radio size={16} />}
            description={t(
              'settings.streaming_quality_desc',
              'Формат и битрейт аудио при воспроизведении по сети'
            )}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-2">
              {isMobile ? (
                <div className="relative">
                  <select
                    value={settings.streamingQuality || 'raw'}
                    onChange={(e) => settings.setStreamingQuality(e.target.value as any)}
                    className="w-full bg-foreground/[0.03] border border-border rounded-xl py-2.5 px-3 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                  >
                    <option value="raw" className="bg-card text-foreground">
                      {t('settings.quality_original', 'Исходное (Без сжатия / FLAC)')}
                    </option>
                    <option value="opus-256" className="bg-card text-foreground">
                      {t(
                        'settings.quality_opus_256',
                        'Opus 256 кбит/с (Рекомендуется, прозрачное)'
                      )}
                    </option>
                    <option value="opus-192" className="bg-card text-foreground">
                      {t('settings.quality_opus_192', 'Opus 192 кбит/с (Высокое)')}
                    </option>
                    <option value="opus-128" className="bg-card text-foreground">
                      {t(
                        'settings.quality_opus_128',
                        'Opus 128 кбит/с (Экономия батареи и трафика)'
                      )}
                    </option>
                    <option value="mp3-320" className="bg-card text-foreground">
                      {t('settings.quality_mp3_320', 'MP3 320 кбит/с')}
                    </option>
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
                  />
                </div>
              ) : (
                <Dropdown
                  value={settings.streamingQuality || 'raw'}
                  onChange={(val) => settings.setStreamingQuality(val)}
                  options={[
                    {
                      label: t(
                        'settings.quality_original',
                        'Исходное (Без сжатия / FLAC)'
                      ),
                      value: 'raw',
                    },
                    {
                      label: t(
                        'settings.quality_opus_256',
                        'Opus 256 кбит/с (Рекомендуется, прозрачное)'
                      ),
                      value: 'opus-256',
                    },
                    {
                      label: t('settings.quality_opus_192', 'Opus 192 кбит/с (Высокое)'),
                      value: 'opus-192',
                    },
                    {
                      label: t(
                        'settings.quality_opus_128',
                        'Opus 128 кбит/с (Экономия батареи и трафика)'
                      ),
                      value: 'opus-128',
                    },
                    {
                      label: t('settings.quality_mp3_320', 'MP3 320 кбит/с'),
                      value: 'mp3-320',
                    },
                  ]}
                />
              )}
            </div>
          </SettingSection>

          {/* Data Saver */}
          <SettingSection
            title={t('settings.data_saver', 'Экономия трафика')}
            icon={<Zap size={16} />}
            description={t(
              'settings.wifi_only_desc',
              'Оптимизирует сетевой трафик, ограничивая фоновую предзагрузку только сетями Wi-Fi'
            )}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-3">
              <SettingToggle
                title={t('settings.data_saver_enable', 'Режим экономии трафика')}
                checked={settings.dataSaver}
                onChange={(checked) => settings.setDataSaver(checked)}
              />

              {settings.dataSaver && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                  <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'settings.mobile_network_warning',
                      'Предупреждение: при слабой или нестабильной мобильной сети возможны задержки буферизации и паузы при переключении треков.'
                    )}
                  </span>
                </div>
              )}
            </div>
          </SettingSection>

          {/* Crossfade */}
          <SettingSection
            title={t('settings.crossfade', 'Плавный переход (Кроссфейд)')}
            icon={<Waves size={16} />}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-4">
              <SettingToggle
                title={t('settings.crossfade_enable', 'Включить плавный переход')}
                description={t('settings.crossfade_desc', 'Плавное перетекание одного трека в другой')}
                checked={settings.isCrossfadeEnabled}
                onChange={(checked) => settings.setIsCrossfadeEnabled(checked)}
              />

              <div className={`pt-2 pb-1 space-y-3 transition-opacity ${settings.isCrossfadeEnabled ? 'opacity-100' : 'opacity-40'}`}>
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>
                    {t('settings.crossfade_duration', 'Длительность кроссфейда')}
                  </span>
                  <span className="font-mono text-foreground font-semibold">
                    {settings.isCrossfadeEnabled ? `${settings.crossfadeDuration} ${t('common.seconds_short', 'сек')}` : `0 ${t('common.seconds_short', 'сек')}`}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={settings.isCrossfadeEnabled ? settings.crossfadeDuration : 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (val === 0) {
                      settings.setIsCrossfadeEnabled(false);
                    } else {
                      settings.setIsCrossfadeEnabled(true);
                      settings.setCrossfadeDuration(val);
                    }
                  }}
                  className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] font-mono text-secondary">
                  <span>0s ({t('common.off', 'Выкл')})</span>
                  <span>12s</span>
                </div>

                {/* Crossfade curve: rendered in Advanced Mode */}
                {isAdvanced && settings.isCrossfadeEnabled && (
                  <CrossfadeCurveVisualizer />
                )}
              </div>
            </div>
          </SettingSection>

          {/* Gapless */}
          <SettingSection
            title={t('settings.gapless', 'Без пауз (Gapless)')}
            icon={<FastForward size={16} />}
            isMobile={isMobile}
          >
            <SettingToggle
              title={t('settings.gapless_enable', 'Воспроизведение без пауз')}
              description={t('settings.gapless_desc', 'Убирать тишину между треками (отключает кроссфейд)')}
              checked={settings.isGaplessEnabled}
              onChange={(checked) => settings.setIsGaplessEnabled(checked)}
            />
          </SettingSection>

          {/* Normalization / Compressor */}
          <SettingSection
            title={t('settings.normalization', 'Нормализация громкости')}
            icon={<Activity size={16} />}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-4">
              <SettingToggle
                title={t('settings.normalization_enable', 'Выравнивать громкость треков')}
                description={t('settings.normalization_desc', 'Автоматически выравнивать громкость треков (DSP компрессор)')}
                checked={settings.isLoudnessNormalizationEnabled}
                onChange={(checked) => settings.setIsLoudnessNormalizationEnabled(checked)}
              />

              {/* 4 WebAudio DSP compressor sliders: rendered in Advanced Mode */}
              {isAdvanced && settings.isLoudnessNormalizationEnabled && (
                <div className="pt-3 pb-1 space-y-5 border-t border-border mt-1">
                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-2">
                      <span>
                        {t(
                          'settings.normalization_threshold',
                          'Порог срабатывания (Threshold)'
                        )}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {settings.compressorThreshold} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="0"
                      value={settings.compressorThreshold}
                      onChange={(e) => settings.setCompressorThreshold(parseFloat(e.target.value))}
                      className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-secondary mt-1">
                      <span>-100 dB</span>
                      <span>0 dB</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-2">
                      <span>
                        {t('settings.audio_compressor_ratio', 'Степень сжатия (Ratio)')}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {settings.compressorRatio}:1
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="0.5"
                      value={settings.compressorRatio}
                      onChange={(e) => settings.setCompressorRatio(parseFloat(e.target.value))}
                      className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-secondary mt-1">
                      <span>1:1</span>
                      <span>20:1</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-2">
                      <span>
                        {t('settings.audio_compressor_attack', 'Атака (Attack)')}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {settings.compressorAttack} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.001"
                      value={settings.compressorAttack}
                      onChange={(e) => settings.setCompressorAttack(parseFloat(e.target.value))}
                      className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-secondary mt-1">
                      <span>0 s</span>
                      <span>1 s</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-2">
                      <span>
                        {t('settings.audio_compressor_release', 'Восстановление (Release)')}
                      </span>
                      <span className="font-mono text-foreground font-semibold">
                        {settings.compressorRelease} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.compressorRelease}
                      onChange={(e) => settings.setCompressorRelease(parseFloat(e.target.value))}
                      className="w-full h-2 bg-foreground/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-secondary mt-1">
                      <span>0 s</span>
                      <span>1 s</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SettingSection>

          {/* Prebuffering / Preload: rendered in Advanced Mode */}
          {isAdvanced && (
            <SettingSection
              title={t('settings.prebuffering', 'Предварительная буферизация')}
              icon={<DownloadCloud size={16} />}
              isMobile={isMobile}
            >
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between cursor-pointer group gap-3">
                  <div className="flex flex-col pr-2 min-w-0 flex-1">
                    <span className="group-hover:text-primary transition-colors text-sm font-medium leading-snug">
                      {t('settings.preload_desc', 'Предзагрузка следующего трека')}
                    </span>
                    <span className="text-xs text-secondary leading-normal mt-0.5 break-words">
                      {t(
                        'settings.prebuffering_desc',
                        'Заранее загружает следующий аудиопоток для непрерывного воспроизведения'
                      )}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.preloadNextTrack}
                    onChange={(e) => settings.setPreloadNextTrack(e.target.checked)}
                    className="accent-primary w-4 h-4 rounded cursor-pointer shrink-0"
                  />
                </label>

                {settings.preloadNextTrack && (
                  <div className="space-y-4 pt-3 border-t border-border">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-secondary font-medium">
                        {t('settings.preload_mode', 'Режим предзагрузки треков')}
                      </span>
                      {isMobile ? (
                        <div className="relative">
                          <select
                            value={settings.preloadMode}
                            onChange={(e) => settings.setPreloadMode(e.target.value as any)}
                            className="w-full bg-foreground/[0.03] border border-border rounded-xl py-2.5 px-3 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                          >
                            <option value="wifi_only" className="bg-card text-foreground">
                              {t('settings.preload_wifi_only', 'Только по Wi-Fi')}
                            </option>
                            <option value="always" className="bg-card text-foreground">
                              {t('settings.prebuffer_always', 'Всегда (Wi-Fi и сотовая сеть)')}
                            </option>
                            <option value="disabled" className="bg-card text-foreground">
                              {t('settings.preload_disabled', 'Отключено')}
                            </option>
                          </select>
                          <ChevronDown
                            size={16}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
                          />
                        </div>
                      ) : (
                        <Dropdown
                          value={settings.preloadMode}
                          onChange={(val) => settings.setPreloadMode(val)}
                          options={[
                            {
                              label: t('settings.preload_wifi_only', 'Только по Wi-Fi'),
                              value: 'wifi_only',
                            },
                            {
                              label: t(
                                'settings.prebuffer_always',
                                'Всегда (Wi-Fi и сотовая сеть)'
                              ),
                              value: 'always',
                            },
                            {
                              label: t('settings.preload_disabled', 'Отключено'),
                              value: 'disabled',
                            },
                          ]}
                        />
                      )}
                      <span className="text-xs text-secondary">
                        {t(
                          'settings.prebuffer_when',
                          'Когда автоматически загружать следующий трек в память'
                        )}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-secondary font-medium">
                        {t('settings.preload_lookahead', 'Время предзагрузки до конца трека')}
                      </span>
                      {isMobile ? (
                        <div className="relative">
                          <select
                            value={settings.preloadLookahead}
                            onChange={(e) =>
                              settings.setPreloadLookahead(Number(e.target.value) as any)
                            }
                            className="w-full bg-foreground/[0.03] border border-border rounded-xl py-2.5 px-3 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                          >
                            <option value={5} className="bg-card text-foreground">
                              {t('settings.preload_lookahead_5s', '5 секунд')}
                            </option>
                            <option value={15} className="bg-card text-foreground">
                              {t('settings.prebuffer_15s', '15 секунд (По умолчанию)')}
                            </option>
                            <option value={30} className="bg-card text-foreground">
                              {t('settings.preload_lookahead_30s', '30 секунд')}
                            </option>
                          </select>
                          <ChevronDown
                            size={16}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none"
                          />
                        </div>
                      ) : (
                        <Dropdown
                          value={settings.preloadLookahead}
                          onChange={(val) => settings.setPreloadLookahead(Number(val) as any)}
                          options={[
                            {
                              label: t('settings.preload_lookahead_5s', '5 секунд'),
                              value: 5,
                            },
                            {
                              label: t(
                                'settings.prebuffer_15s',
                                '15 секунд (По умолчанию)'
                              ),
                              value: 15,
                            },
                            {
                              label: t('settings.preload_lookahead_30s', '30 секунд'),
                              value: 30,
                            },
                          ]}
                        />
                      )}
                      <span className="text-xs text-secondary">
                        {t(
                          'settings.prebuffer_offset_desc',
                          'За сколько секунд до окончания трека начинать предзагрузку'
                        )}
                      </span>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer group pt-1">
                      <input
                        type="checkbox"
                        checked={settings.preloadCovers}
                        onChange={(e) => settings.setPreloadCovers(e.target.checked)}
                        className="accent-primary w-4 h-4 rounded cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="group-hover:text-primary transition-colors text-sm">
                          {t('settings.preload_covers', 'Предзагрузка обложек очереди')}
                        </span>
                        <span className="text-xs text-secondary">
                          {t(
                            'settings.preload_covers_desc',
                            'Загружать обложки для следующих треков в очереди'
                          )}
                        </span>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            </SettingSection>
          )}
        </>
      )}
    </div>
  );
}
