import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, Trash2, HardDrive } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { getImageCacheStats, clearImageCache, type ImageCacheStats } from '../../utils/imageCache';

const PRESETS = [
  { label: '64 MB', value: 64 },
  { label: '128 MB', value: 128 },
  { label: '256 MB', value: 256 },
  { label: '512 MB', value: 512 },
  { label: '1 GB', value: 1024 },
  { label: '2 GB', value: 2048 },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const normalizedIndex = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, normalizedIndex)).toFixed(1))} ${sizes[normalizedIndex]}`;
}

export default function ImageMemoryLimitControl({ className = '', isMobile = false }: { className?: string; isMobile?: boolean }) {
  const { t } = useTranslation();
  const { imageCacheLimitMb = 256, setImageCacheLimitMb } = useSettingsStore();
  const [stats, setStats] = useState<ImageCacheStats>(() => getImageCacheStats());
  const [isClearing, setIsClearing] = useState(false);

  // Poll cache stats periodically while component is active
  useEffect(() => {
    const updateStats = () => setStats(getImageCacheStats());
    updateStats();
    const interval = setInterval(updateStats, 1500);
    return () => clearInterval(interval);
  }, [imageCacheLimitMb]);

  const handleClearCache = () => {
    setIsClearing(true);
    clearImageCache();
    setTimeout(() => {
      setStats(getImageCacheStats());
      setIsClearing(false);
    }, 400);
  };

  const currentMbDisplay = imageCacheLimitMb >= 1024 
    ? `${(imageCacheLimitMb / 1024).toFixed(imageCacheLimitMb % 1024 === 0 ? 0 : 1)} GB`
    : `${imageCacheLimitMb} MB`;

  return (
    <div className={`flex flex-col gap-4 bg-background/50 rounded-xl border border-white/5 ${isMobile ? 'p-3' : 'p-4'} ${className}`}>
      {/* Title & Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t('settings.image_cache_limit')}
          </span>
        </div>
        <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
          {currentMbDisplay}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-secondary leading-relaxed">
        {t('settings.image_cache_desc')}
      </p>

      {/* Preset Chips */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
        {PRESETS.map((preset) => {
          const isSelected = imageCacheLimitMb === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => setImageCacheLimitMb(preset.value)}
              className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition-all text-center truncate ${
                isSelected
                  ? 'border-primary text-primary bg-primary/10 shadow-sm shadow-primary/20 ring-1 ring-primary/30 font-bold'
                  : 'border-white/10 text-secondary hover:border-white/25 hover:text-foreground bg-white/[0.02]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Continuous Range Slider */}
      <div className="space-y-2 pt-2">
        <input
          type="range"
          min="32"
          max="2048"
          step="16"
          value={imageCacheLimitMb}
          onChange={(e) => setImageCacheLimitMb(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="relative w-full h-4 text-[11px] font-mono text-secondary select-none">
          <span className="absolute left-0">32 MB</span>
          <span className="absolute left-[23.8%] -translate-x-1/2">512 MB</span>
          <span className="absolute left-[49.2%] -translate-x-1/2">1 GB</span>
          <span className="absolute right-0">2 GB</span>
        </div>
      </div>

      {/* Live Usage Gauge & Purge Button */}
      <div className="pt-3 border-t border-white/5 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-secondary min-w-0">
            <HardDrive size={14} className="shrink-0" />
            <span className="shrink-0">{t('settings.image_cache_usage')}:</span>
            <span className="font-mono text-foreground font-medium truncate">
              {formatBytes(stats.currentBytes)} / {formatBytes(stats.limitBytes)} ({stats.usagePercent.toFixed(1)}%)
            </span>
          </div>
          <button
            type="button"
            onClick={handleClearCache}
            disabled={isClearing || stats.currentBytes === 0}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 disabled:hover:text-red-400 transition-colors shrink-0"
          >
            <Trash2 size={12} />
            <span>{isClearing ? t('settings.clearing') : t('settings.clear_image_cache_btn')}</span>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              stats.usagePercent > 90
                ? 'bg-red-500'
                : stats.usagePercent > 70
                ? 'bg-amber-500'
                : 'bg-primary'
            }`}
            style={{ width: `${Math.max(stats.currentBytes > 0 ? 1 : 0, Math.min(100, stats.usagePercent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
