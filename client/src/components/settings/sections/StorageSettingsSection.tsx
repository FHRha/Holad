import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderSearch } from 'lucide-react';
import { useSettingsStore } from '../../../store/settingsStore';
import { useDownloadStore } from '../../../store/downloadStore';
import { StorageManager, isTauri, isCapacitor } from '../../../utils/StorageManager';
import StorageStatsBar from '../StorageStatsBar';
import StorageLimitControl from '../StorageLimitControl';
import ImageMemoryLimitControl from '../ImageMemoryLimitControl';
import StorageDangerZone from '../StorageDangerZone';
import DownloadedMusicGrid from '../DownloadedMusicGrid';
import DeleteDownloadsModal from '../../modals/DeleteDownloadsModal';
import SettingSection from '../SettingSection';

export interface StorageSettingsSectionProps {
  isMobile?: boolean;
  className?: string;
}

export default function StorageSettingsSection({
  isMobile = false,
  className = '',
}: StorageSettingsSectionProps) {
  const { t } = useTranslation();
  const { downloadDirectory, setDownloadDirectory } = useDownloadStore();
  const maxDownloadConcurrency = useSettingsStore((state) => state.maxDownloadConcurrency);
  const setMaxDownloadConcurrency = useSettingsStore((state) => state.setMaxDownloadConcurrency);
  const [actualDir, setActualDir] = useState<string>(t('sidebar.downloading', 'Загрузка...'));
  const [isMoving, setIsMoving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  const refreshStats = () => {
    setStatsKey((prev) => prev + 1);
  };

  useEffect(() => {
    if (downloadDirectory) {
      setActualDir(downloadDirectory);
    } else {
      StorageManager.getDefaultDownloadDir()
        .then(setActualDir)
        .catch(() => setActualDir(t('settings.error_get_path', 'Ошибка получения пути')));
    }
  }, [downloadDirectory, t]);

  const handleSelectDirectory = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: t('settings.select_download_folder'),
      });
      if (selectedPath && typeof selectedPath === 'string') {
        const currentDir = downloadDirectory || (await StorageManager.getDefaultDownloadDir());
        if (currentDir !== selectedPath) {
          setIsMoving(true);
          try {
            await StorageManager.moveDirectory(currentDir, selectedPath);
          } catch (err) {
            console.error('Failed to move directory:', err);
          }
          setDownloadDirectory(selectedPath);
          setIsMoving(false);
          refreshStats();
        }
      }
    } catch (err) {
      console.error(err);
      setIsMoving(false);
    }
  };

  if (isMobile) {
    return (
      <div className={`flex flex-col gap-6 ${className}`}>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
            {t('settings.storage_usage')}
          </span>
          <StorageStatsBar isMobile={true} key={statsKey} onRefreshRequested={refreshStats} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
            {t('settings.storage_limit_title')}
          </span>
          <StorageLimitControl isMobile={true} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
            {t('settings.memory_limit')}
          </span>
          <ImageMemoryLimitControl isMobile={true} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-[#b3b3b3] uppercase tracking-wider">
            {t('settings.download_location')}
          </span>
          <div
            className="bg-[#1e1e1e] p-3 rounded-xl border border-white/5 truncate max-w-full text-xs font-mono text-zinc-300"
            title={actualDir}
          >
            {actualDir || t('sidebar.downloading', 'Загрузка...')}
          </div>
        </div>

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

        <StorageDangerZone isMobile={true} onActionComplete={refreshStats} />

        {showDeleteModal && (
          <DeleteDownloadsModal
            onClose={() => {
              setShowDeleteModal(false);
              refreshStats();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <StorageStatsBar key={statsKey} onRefreshRequested={refreshStats} />

      <StorageLimitControl />

      <ImageMemoryLimitControl />

      {/* Download concurrency */}
      <SettingSection title={t('settings.download_concurrency')}>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-secondary mb-2">
            {t('settings.download_concurrency_desc')}
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="10"
              value={maxDownloadConcurrency}
              onChange={(e) => setMaxDownloadConcurrency(parseInt(e.target.value, 10))}
              className="flex-1 h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-sm font-mono text-secondary w-8 text-right">
              {maxDownloadConcurrency}
            </span>
          </div>
        </div>
      </SettingSection>

      {/* Download Location (Desktop / Tauri) */}
      {isTauri() && (
        <SettingSection title={t('settings.download_location')}>
          <div className="flex flex-col gap-4">
            <div
              className="bg-black/30 p-3 rounded-lg border border-white/5 truncate max-w-full text-sm font-mono text-secondary"
              title={actualDir}
            >
              {actualDir}
            </div>
            <button
              onClick={handleSelectDirectory}
              disabled={isMoving}
              className="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-2.5 rounded-xl font-medium transition-colors"
            >
              {isMoving ? (
                <span className="animate-pulse">{t('settings.moving_files')}</span>
              ) : (
                <>
                  <FolderSearch size={18} />
                  <span>{t('settings.change_folder')}</span>
                </>
              )}
            </button>
          </div>
        </SettingSection>
      )}

      {(isTauri() || isCapacitor()) && (
        <DownloadedMusicGrid
          onRefreshRequested={refreshStats}
          onManageClick={() => setShowDeleteModal(true)}
        />
      )}

      <StorageDangerZone onActionComplete={refreshStats} />

      {showDeleteModal && (
        <DeleteDownloadsModal
          onClose={() => {
            setShowDeleteModal(false);
            refreshStats();
          }}
        />
      )}
    </div>
  );
}
