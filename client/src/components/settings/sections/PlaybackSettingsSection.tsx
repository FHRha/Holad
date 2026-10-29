import { useTranslation } from 'react-i18next';
import {
  Radio,
  Zap,
  ShieldAlert,
  Waves,
  FastForward,
  Activity,
  Headphones,
  MousePointerClick,
  Sparkles,
  Volume2,
  Gauge,
  ChevronDown,
  DownloadCloud,
} from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { usePlayerStore } from '../../../store/playerStore';
import VolumeSlider from '../../common/VolumeSlider';
import Dropdown from '../../common/Dropdown';
import SettingSection from '../SettingSection';

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

  return (
    <div className={`space-y-6 ${className}`}>
      {/* =========================================
          PLAYER SETTINGS SECTION
      ========================================= */}
      {showPlayer && (
        <>
          {/* Click Action */}
          <SettingSection
            title={t('settings.clickAction') || 'Поведение при клике на трек'}
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
            title={t('settings.autoDj') || 'АВТО DJ по умолчанию'}
            icon={<Sparkles size={16} />}
            isMobile={isMobile}
          >
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="group-hover:text-primary transition-colors text-sm font-medium">
                {t('settings.auto_dj_desc', 'Автоматически подбирать похожие треки в конец очереди')}
              </span>
              <input
                type="checkbox"
                checked={isAutoDjEnabled}
                onChange={() => toggleAutoDj()}
                className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
              />
            </label>

            {/* Auto DJ Repeat Strategy: rendered in Advanced Mode */}
            {isAdvanced && isAutoDjEnabled && (
              <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider">
                  {t(
                    'settings.autodj_repeat_collision',
                    'При включённом повторе альбома/плейлиста'
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name={isMobile ? 'm_autoDjRepeatBehavior' : 'autoDjRepeatBehavior'}
                      value="pause_on_repeat"
                      checked={settings.autoDjRepeatBehavior === 'pause_on_repeat'}
                      onChange={() => settings.setAutoDjRepeatBehavior('pause_on_repeat')}
                      className="accent-primary w-4 h-4 cursor-pointer"
                    />
                    <span className="group-hover:text-primary transition-colors text-sm">
                      {t(
                        'settings.autodj_pause_on_repeat',
                        'Приоритет повтора (приостанавливать Авто DJ, альбом играет по кругу)'
                      )}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name={isMobile ? 'm_autoDjRepeatBehavior' : 'autoDjRepeatBehavior'}
                      value="infinite_stream"
                      checked={settings.autoDjRepeatBehavior === 'infinite_stream'}
                      onChange={() => settings.setAutoDjRepeatBehavior('infinite_stream')}
                      className="accent-primary w-4 h-4 cursor-pointer"
                    />
                    <span className="group-hover:text-primary transition-colors text-sm">
                      {t(
                        'settings.autodj_infinite_stream',
                        'Бесконечный поток (игнорировать повтор и добавлять похожие треки)'
                      )}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </SettingSection>

          {/* Default Volume */}
          <SettingSection
            title={t('settings.defaultVolume') || 'Громкость по умолчанию'}
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

          {/* Volume Multiplier */}
          <SettingSection
            title={t('settings.volume_multiplier') || 'Множитель громкости'}
            icon={<Gauge size={16} />}
            description={t(
              'settings.volume_multiplier_desc',
              'Программное усиление выходного сигнала (100% - 300%)'
            )}
            isMobile={isMobile}
          >
            <div className="flex items-center gap-3 pt-1 pb-1">
              <input
                type="number"
                min="1"
                max="300"
                value={Math.round(volumeMultiplier * 100)}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setVolumeMultiplier(Math.min(Math.max(val, 1), 300) / 100);
                }}
                className="bg-black/20 border border-white/10 rounded-lg py-2 px-3 w-24 text-center outline-none focus:border-primary transition-colors text-foreground font-mono"
              />
              <span className="text-sm text-secondary font-medium">%</span>
            </div>
          </SettingSection>
        </>
      )}

      {/* =========================================
          AUDIO SETTINGS SECTION
      ========================================= */}
      {showAudio && (
        <>
          {/* Streaming Quality */}
          <SettingSection
            title={t('settings.streaming_quality') || 'Качество потока (стриминга)'}
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
                    className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                  >
                    <option value="raw" className="bg-zinc-900 text-white">
                      {t('settings.quality_raw', 'Исходное (Без сжатия / FLAC)')}
                    </option>
                    <option value="opus-256" className="bg-zinc-900 text-white">
                      {t(
                        'settings.quality_opus_256',
                        'Opus 256 кбит/с (Рекомендуется, прозрачное)'
                      )}
                    </option>
                    <option value="opus-192" className="bg-zinc-900 text-white">
                      {t('settings.quality_opus_192', 'Opus 192 кбит/с (Высокое)')}
                    </option>
                    <option value="opus-128" className="bg-zinc-900 text-white">
                      {t(
                        'settings.quality_opus_128',
                        'Opus 128 кбит/с (Экономия батареи и трафика)'
                      )}
                    </option>
                    <option value="mp3-320" className="bg-zinc-900 text-white">
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
                        'settings.quality_raw',
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
            title={t('settings.data_saver', 'Экономия трафика (Data Saver)')}
            icon={<Zap size={16} />}
            description={t(
              'settings.data_saver_desc',
              'Оптимизирует сетевой трафик, ограничивая фоновую предзагрузку только сетями Wi-Fi'
            )}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium group-hover:text-primary transition-colors">
                  {t('settings.data_saver_enable', 'Режим экономии трафика')}
                </span>
                <input
                  type="checkbox"
                  checked={settings.dataSaver}
                  onChange={(e) => settings.setDataSaver(e.target.checked)}
                  className="accent-primary w-4 h-4 rounded cursor-pointer"
                />
              </label>

              {settings.dataSaver && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                  <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'settings.data_saver_warning',
                      'Предупреждение: при слабой или нестабильной мобильной сети возможны задержки буферизации и паузы при переключении треков.'
                    )}
                  </span>
                </div>
              )}
            </div>
          </SettingSection>

          {/* Crossfade */}
          <SettingSection
            title={t('settings.crossfade') || 'Плавный переход (Кроссфейд)'}
            icon={<Waves size={16} />}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col pr-4">
                  <span className="group-hover:text-primary transition-colors text-sm font-medium">
                    {t('settings.crossfade_enable', 'Включить плавный переход')}
                  </span>
                  <span className="text-xs text-secondary">
                    {t('settings.crossfade_desc') ||
                      'Плавное перетекание одного трека в другой'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.isCrossfadeEnabled}
                  onChange={(e) => settings.setIsCrossfadeEnabled(e.target.checked)}
                  className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
                />
              </label>

              <div className={`pt-2 pb-1 space-y-3 transition-opacity ${settings.isCrossfadeEnabled ? 'opacity-100' : 'opacity-40'}`}>
                <div className="flex justify-between text-xs text-secondary font-medium">
                  <span>
                    {t('settings.crossfade_duration') || 'Длительность кроссфейда'}
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
                  className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[11px] font-mono text-secondary">
                  <span>0s ({t('common.off', 'Выкл')})</span>
                  <span>6s</span>
                  <span>12s</span>
                </div>

                {/* Crossfade curve: rendered in Advanced Mode */}
                {isAdvanced && settings.isCrossfadeEnabled && (
                  <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
                    <span className="text-xs text-secondary font-medium">
                      {t('settings.crossfade_curve') || 'Кривая кроссфейда'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => settings.setCrossfadeCurve('equalPower')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          settings.crossfadeCurve === 'equalPower'
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-white/10 text-secondary hover:border-white/20'
                        }`}
                      >
                        {t('settings.curve_equal_power') || 'Равная мощность'}
                      </button>
                      <button
                        type="button"
                        onClick={() => settings.setCrossfadeCurve('linear')}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                          settings.crossfadeCurve === 'linear'
                            ? 'border-primary text-primary bg-primary/10'
                            : 'border-white/10 text-secondary hover:border-white/20'
                        }`}
                      >
                        {t('settings.curve_linear') || 'Линейная'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </SettingSection>

          {/* Gapless */}
          <SettingSection
            title={t('settings.gapless') || 'Без пауз (Gapless)'}
            icon={<FastForward size={16} />}
            isMobile={isMobile}
          >
            <label className="flex items-center justify-between cursor-pointer group">
              <div className="flex flex-col pr-4">
                <span className="group-hover:text-primary transition-colors text-sm font-medium">
                  {t('settings.gapless_enable', 'Воспроизведение без пауз')}
                </span>
                <span className="text-xs text-secondary">
                  {t('settings.gapless_desc') ||
                    'Убирать тишину между треками (отключает кроссфейд)'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.isGaplessEnabled}
                onChange={(e) => settings.setIsGaplessEnabled(e.target.checked)}
                className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
              />
            </label>
          </SettingSection>

          {/* Auto Resume Headphones */}
          <SettingSection
            title={
              t('settings.auto_resume_headphones') ||
              'Автовоспроизведение в наушниках'
            }
            icon={<Headphones size={16} />}
            isMobile={isMobile}
          >
            <label className="flex items-center justify-between cursor-pointer group">
              <div className="flex flex-col pr-4">
                <span className="group-hover:text-primary transition-colors text-sm font-medium">
                  {t('settings.auto_resume_enable', 'Авто-возобновление в наушниках')}
                </span>
                <span className="text-xs text-secondary">
                  {t('settings.auto_resume_headphones_desc') ||
                    'Продолжать воспроизведение, если наушники возвращены в течение 45 секунд'}
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoResumeOnHeadphonesConnect}
                onChange={(e) => settings.setAutoResumeOnHeadphonesConnect(e.target.checked)}
                className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
              />
            </label>
          </SettingSection>

          {/* Normalization / Compressor */}
          <SettingSection
            title={t('settings.normalization') || 'Нормализация громкости'}
            icon={<Activity size={16} />}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between cursor-pointer group">
                <div className="flex flex-col pr-4">
                  <span className="group-hover:text-primary transition-colors text-sm font-medium">
                    {t('settings.normalization_enable', 'Выравнивать громкость треков')}
                  </span>
                  <span className="text-xs text-secondary">
                    {t('settings.normalization_desc') ||
                      'Автоматически выравнивать громкость треков (DSP компрессор)'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.isLoudnessNormalizationEnabled}
                  onChange={(e) => settings.setIsLoudnessNormalizationEnabled(e.target.checked)}
                  className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
                />
              </label>

              {/* 4 WebAudio DSP compressor sliders: rendered in Advanced Mode */}
              {isAdvanced && settings.isLoudnessNormalizationEnabled && (
                <div className="pt-3 pb-1 space-y-5 border-t border-white/5 mt-1">
                  <div>
                    <div className="flex justify-between text-xs text-secondary mb-2">
                      <span>
                        {t(
                          'settings.audio_compressor_threshold',
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
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
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
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
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
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
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
                      className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
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
              title={t('settings.prebuffering') || 'Предварительная буферизация'}
              icon={<DownloadCloud size={16} />}
              isMobile={isMobile}
            >
              <div className="flex flex-col gap-4">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex flex-col pr-4">
                    <span className="group-hover:text-primary transition-colors text-sm font-medium">
                      {t('settings.preload_desc', 'Предзагрузка следующего трека')}
                    </span>
                    <span className="text-xs text-secondary">
                      {t(
                        'settings.preload_subdesc',
                        'Заранее загружает следующий аудиопоток для непрерывного воспроизведения'
                      )}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.preloadNextTrack}
                    onChange={(e) => settings.setPreloadNextTrack(e.target.checked)}
                    className="accent-primary w-4 h-4 rounded cursor-pointer flex-shrink-0"
                  />
                </label>

                {settings.preloadNextTrack && (
                  <div className="space-y-4 pt-3 border-t border-white/5">
                    <div className="flex flex-col gap-2">
                      <span className="text-xs text-secondary font-medium">
                        {t('settings.preload_mode', 'Режим предзагрузки треков')}
                      </span>
                      {isMobile ? (
                        <div className="relative">
                          <select
                            value={settings.preloadMode}
                            onChange={(e) => settings.setPreloadMode(e.target.value as any)}
                            className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                          >
                            <option value="wifi_only" className="bg-zinc-900 text-white">
                              {t('settings.preload_wifi_only', 'Только по Wi-Fi')}
                            </option>
                            <option value="always" className="bg-zinc-900 text-white">
                              {t('settings.preload_always', 'Всегда (Wi-Fi и сотовая сеть)')}
                            </option>
                            <option value="disabled" className="bg-zinc-900 text-white">
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
                                'settings.preload_always',
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
                          'settings.preload_mode_desc',
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
                            className="w-full bg-foreground/10 border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white outline-none focus:border-primary appearance-none cursor-pointer pr-10"
                          >
                            <option value={5} className="bg-zinc-900 text-white">
                              {t('settings.preload_lookahead_5s', '5 секунд')}
                            </option>
                            <option value={15} className="bg-zinc-900 text-white">
                              {t('settings.preload_lookahead_15s', '15 секунд (По умолчанию)')}
                            </option>
                            <option value={30} className="bg-zinc-900 text-white">
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
                                'settings.preload_lookahead_15s',
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
                          'settings.preload_lookahead_desc',
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
