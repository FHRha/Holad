import { useTranslation } from 'react-i18next';
import { RefreshCw, Music2, Image as ImageIcon, Database, HardDrive } from 'lucide-react';
import { useStorageStats, formatBytes } from '../../utils/storageStatsHelper';
import { isTauri, isCapacitor } from '../../utils/StorageManager';

interface StorageStatsBarProps {
  className?: string;
  isMobile?: boolean;
  onRefreshRequested?: () => void;
}

export default function StorageStatsBar({
  className = '',
  isMobile = false,
  onRefreshRequested,
}: StorageStatsBarProps) {
  const { t } = useTranslation();
  const { stats, percentages, refresh, isRefreshing } = useStorageStats();
  const isNative = isTauri() || isCapacitor();

  const handleRefresh = async () => {
    await refresh();
    onRefreshRequested?.();
  };

  const displayAudioBytes = isNative ? stats.audioBytes : 0;
  const totalUsedBytes = displayAudioBytes + stats.imageBytes + stats.metadataBytes;

  const usedOfTotalString = t('settings.used_of_total', {
    used: formatBytes(totalUsedBytes),
    total: formatBytes(stats.totalBytes),
  });

  // Calculate visual segment percentages with minimum sliver for non-zero values
  const getVisualWidth = (bytes: number, pct: number): number => {
    if (bytes <= 0) return 0;
    return Math.max(0.6, pct);
  };

  const visualAudio = getVisualWidth(displayAudioBytes, percentages.audioPct);
  const visualImage = getVisualWidth(stats.imageBytes, percentages.imagePct);
  const visualMeta = getVisualWidth(stats.metadataBytes, percentages.metaPct);
  const visualTotalUsed = visualAudio + visualImage + visualMeta;
  const visualFree = Math.max(0, 100 - visualTotalUsed);

  if (stats.isLoading) {
    return (
      <div className={`flex flex-col gap-4 bg-background/50 rounded-xl border border-white/5 ${isMobile ? 'p-3' : 'p-4'} ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
          <div className="h-4 w-16 bg-white/10 rounded animate-pulse" />
        </div>
        <div className="h-3 w-full bg-white/10 rounded-full animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 bg-background/50 rounded-xl border border-white/5 ${isMobile ? 'p-3' : 'p-4'} ${className}`}>
      {/* Header with Title, Usage Summary & Refresh Button */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <HardDrive size={18} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t('settings.storage_stats_title')}
            </span>
          </div>
          <span className="text-xs text-secondary mt-0.5 font-mono">
            {usedOfTotalString}
          </span>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-secondary hover:text-foreground transition-all disabled:opacity-50"
          title={t('settings.refresh_stats')}
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-primary' : ''} />
        </button>
      </div>

      <div className="w-full h-3.5 bg-[#282828] rounded-full overflow-hidden p-0.5 border border-white/5 shadow-inner">
        <div className="w-full h-full rounded-full overflow-hidden flex">
          {displayAudioBytes > 0 && (
            <div
              style={{ width: `${visualAudio}%` }}
              className="h-full bg-[#3b82f6] transition-all duration-500 ease-out"
              title={`Audio: ${formatBytes(displayAudioBytes)} (${percentages.audioPct.toFixed(1)}%)`}
            />
          )}
          {stats.imageBytes > 0 && (
            <div
              style={{ width: `${visualImage}%` }}
              className="h-full bg-[#a855f7] transition-all duration-500 ease-out"
              title={`Images: ${formatBytes(stats.imageBytes)} (${percentages.imagePct.toFixed(1)}%)`}
            />
          )}
          {stats.metadataBytes > 0 && (
            <div
              style={{ width: `${visualMeta}%` }}
              className="h-full bg-[#f59e0b] transition-all duration-500 ease-out"
              title={`Metadata: ${formatBytes(stats.metadataBytes)} (${percentages.metaPct.toFixed(1)}%)`}
            />
          )}
          <div
            style={{ width: `${visualFree}%` }}
            className="h-full bg-transparent transition-all duration-500 ease-out"
            title={`Free space: ${formatBytes(stats.freeBytes)} (${percentages.freePct.toFixed(1)}%)`}
          />
        </div>
      </div>

      {/* Legend / Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
        {/* 1. Audio Metric */}
        {isNative && (
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="w-3 h-3 rounded-full bg-[#3b82f6] flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-secondary flex items-center gap-1 truncate">
                <Music2 size={11} className="inline text-[#3b82f6]" />
                {t('settings.storage_audio')}
              </span>
              <span className="text-xs font-mono font-medium text-foreground truncate">
                {formatBytes(displayAudioBytes)}
              </span>
            </div>
          </div>
        )}

        {/* 2. Images Metric */}
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="w-3 h-3 rounded-full bg-[#a855f7] flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-secondary flex items-center gap-1 truncate">
              <ImageIcon size={11} className="inline text-[#a855f7]" />
              {t('settings.storage_images')}
            </span>
            <span className="text-xs font-mono font-medium text-foreground truncate">
              {formatBytes(stats.imageBytes)}
            </span>
          </div>
        </div>

        {/* 3. Metadata Metric */}
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="w-3 h-3 rounded-full bg-[#f59e0b] flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-secondary flex items-center gap-1 truncate">
              <Database size={11} className="inline text-[#f59e0b]" />
              {t('settings.storage_metadata')}
            </span>
            <span className="text-xs font-mono font-medium text-foreground truncate">
              {formatBytes(stats.metadataBytes)}
            </span>
          </div>
        </div>

        {/* 4. Free Space Metric */}
        <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="w-3 h-3 rounded-full bg-[#3f3f46] flex-shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-secondary flex items-center gap-1 truncate">
              {t('settings.storage_free')}
            </span>
            <span className="text-xs font-mono font-medium text-foreground truncate">
              {formatBytes(stats.freeBytes)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
