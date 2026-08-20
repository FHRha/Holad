
import { useTranslation } from 'react-i18next';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { useSettingsStore } from '../../store/settingsStore';
import { useStorageStats } from '../../utils/storageStatsHelper';

// oxlint-disable-next-line
export const STORAGE_PRESETS = [
  { label: '5 GB', value: 5 },
  { label: '10 GB', value: 10 },
  { label: '50 GB', value: 50 },
  { label: 'Безлимитно', value: 0 },
];

export interface StorageLimitControlProps {
  className?: string;
  isMobile?: boolean;
}

export default function StorageLimitControl({ className = '', isMobile = false }: StorageLimitControlProps) {
  const { t } = useTranslation();
  const { totalStorageLimitGb = 10, setTotalStorageLimitGb } = useSettingsStore();
  const { stats, refresh } = useStorageStats();

  const handleSelectPreset = (value: number) => {
    setTotalStorageLimitGb(value);
    refresh();
  };

  const totalUsedBytes = stats.audioBytes + stats.imageBytes + stats.metadataBytes;
  const isOverLimit = totalStorageLimitGb > 0 && stats.totalBytes > 0 && totalUsedBytes >= stats.totalBytes;
  const isNearLimit = totalStorageLimitGb > 0 && stats.totalBytes > 0 && !isOverLimit && totalUsedBytes >= stats.totalBytes * 0.9;

  const currentDisplay = totalStorageLimitGb === 0
    ? t('settings.storage_unlimited')
    : `${totalStorageLimitGb} GB`;

  return (
    <div
      data-testid="storage-limit-control"
      className={`flex flex-col gap-4 bg-background/50 rounded-xl border border-white/5 ${isMobile ? 'p-3' : 'p-4'} ${className}`}
    >
      {/* Title & Current Limit Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {t('settings.storage_limit_title')}
          </span>
        </div>
        <span
          data-testid="storage-limit-badge"
          className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20"
        >
          {currentDisplay}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-secondary leading-relaxed">
        {t('settings.storage_limit_desc')}
      </p>

      {/* Preset Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {STORAGE_PRESETS.map((preset) => {
          const isSelected = totalStorageLimitGb === preset.value;
          const displayLabel = preset.value === 0
            ? t('settings.storage_unlimited')
            : preset.label;

          return (
            <button
              key={preset.value}
              type="button"
              data-testid={`storage-limit-preset-${preset.value}`}
              onClick={() => handleSelectPreset(preset.value)}
              className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all text-center truncate ${
                isSelected
                  ? 'border-primary text-primary bg-primary/10 shadow-sm shadow-primary/20 ring-1 ring-primary/30 font-bold'
                  : 'border-white/10 text-secondary hover:border-white/25 hover:text-foreground bg-white/[0.02]'
              }`}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>

      {/* Warning Banners */}
      {isOverLimit && (
        <div
          data-testid="storage-limit-warning-over"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            {t('settings.storage_limit_exceeded')}
          </span>
        </div>
      )}

      {isNearLimit && (
        <div
          data-testid="storage-limit-warning-near"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs"
        >
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            {t('settings.storage_limit_near')}
          </span>
        </div>
      )}
    </div>
  );
}
