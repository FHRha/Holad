import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FolderSearch,
  Image as ImageIcon,
  Music2,
  Trash2,
  Check,
  Loader2,
  HardDrive,
  Sliders,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSettingsStore } from '../../../store/settingsStore';
import { useDownloadStore } from '../../../store/downloadStore';
import { StorageManager, isTauri, isCapacitor } from '../../../utils/StorageManager';
import { clearImageCache } from '../../../utils/imageCache';
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
  showAdvanced?: boolean;
}

export default function StorageSettingsSection({
  isMobile = false,
  className = '',
  showAdvanced,
}: StorageSettingsSectionProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore();
  const isAdvanced = typeof showAdvanced === 'boolean' ? showAdvanced : settings.showAdvancedSettings;

  const { downloadDirectory, setDownloadDirectory } = useDownloadStore();
  const maxDownloadConcurrency = useSettingsStore((state) => state.maxDownloadConcurrency);
  const setMaxDownloadConcurrency = useSettingsStore((state) => state.setMaxDownloadConcurrency);

  const [actualDir, setActualDir] = useState<string>(t('sidebar.downloading', 'Загрузка...'));
  const [isMoving, setIsMoving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [statsKey, setStatsKey] = useState(0);

  // Quick 1-click cleanup button states (Substreamer style)
  const [clearingCovers, setClearingCovers] = useState(false);
  const [clearingAudio, setClearingAudio] = useState(false);

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
        title: t('settings.select_download_folder', 'Выберите папку для загрузок'),
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

  // Quick 1-click Cover Cache Cleanup
  const handleQuickClearCovers = async () => {
    setClearingCovers(true);
    try {
      clearImageCache();

      if (isTauri()) {
        try {
          const { join } = await import('@tauri-apps/api/path');
          const { exists, remove } = await import('@tauri-apps/plugin-fs');
          const dDir = useDownloadStore.getState().downloadDirectory || (await StorageManager.getDefaultDownloadDir());
          const coversPath = await join(dDir, 'covers');
          if (await exists(coversPath)) {
            await remove(coversPath, { recursive: true });
          }
        } catch (e) {
          console.warn('Tauri covers folder cleanup error:', e);
        }
      } else if (isCapacitor()) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          await Filesystem.rmdir({ path: 'Holad/covers', directory: Directory.Data, recursive: true });
        } catch (e) {
          console.warn('Capacitor covers folder cleanup error:', e);
        }
      }

      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            if (name.includes('cover') || name.includes('image')) {
              await caches.delete(name);
            }
          }
        } catch {}
      }

      refreshStats();
      toast.success(t('settings.cover_cache_cleared', 'Кэш обложек успешно очищен'));
    } catch (e) {
      console.error(e);
      toast.error(t('settings.storage_error', 'Ошибка при очистке кэша обложек'));
    } finally {
      setTimeout(() => setClearingCovers(false), 600);
    }
  };

  // Quick 1-click Audio Buffer Cleanup
  const handleQuickClearAudioBuffer = async () => {
    setClearingAudio(true);
    try {
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheNames = await caches.keys();
          for (const name of cacheNames) {
            if (name.includes('audio') || name.includes('stream') || name.includes('media')) {
              await caches.delete(name);
            }
          }
        } catch {}
      }

      refreshStats();
      toast.success(t('settings.audio_buffer_cleared', 'Временный аудиобуфер успешно очищен'));
    } catch (e) {
      console.error(e);
      toast.error(t('settings.storage_error', 'Ошибка при очистке аудиобуфера'));
    } finally {
      setTimeout(() => setClearingAudio(false), 600);
    }
  };

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* 1. Storage Overview Bar */}
      <StorageStatsBar isMobile={isMobile} key={statsKey} onRefreshRequested={refreshStats} />

      {/* 2. Fast 1-Click Cleanups (Substreamer style) */}
      <SettingSection
        title={t('settings.quick_cleanup', 'Быстрая очистка хранилища')}
        icon={<Trash2 size={16} />}
        description={t(
          'settings.quick_cleanup_desc',
          'Освободите дисковое пространство и оперативную память в один клик без потери скачанных треков'
        )}
        isMobile={isMobile}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleQuickClearCovers}
            disabled={clearingCovers}
            className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform flex-shrink-0">
                <ImageIcon size={18} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {t('settings.clear_cover_cache', 'Очистить кэш обложек')}
                </span>
                <span className="text-xs text-secondary truncate">
                  {t('settings.clear_cover_cache_desc', 'Удалить сохранённые изображения')}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-secondary pl-2">
              {clearingCovers ? <Loader2 size={16} className="animate-spin text-primary" /> : <Check size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
            </div>
          </button>

          <button
            type="button"
            onClick={handleQuickClearAudioBuffer}
            disabled={clearingAudio}
            className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all group text-left disabled:opacity-50"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform flex-shrink-0">
                <Music2 size={18} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground truncate">
                  {t('settings.clear_audio_buffer', 'Очистить аудиобуфер')}
                </span>
                <span className="text-xs text-secondary truncate">
                  {t('settings.clear_audio_buffer_desc', 'Сбросить временные фрагменты потоков')}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-secondary pl-2">
              {clearingAudio ? <Loader2 size={16} className="animate-spin text-primary" /> : <Check size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
            </div>
          </button>
        </div>
      </SettingSection>

      {/* 3. Download Location (Desktop / Tauri) */}
      {isTauri() && (
        <SettingSection
          title={t('settings.download_location', 'Папка загрузок')}
          icon={<HardDrive size={16} />}
          isMobile={isMobile}
        >
          <div className="flex flex-col gap-3">
            <div
              className="bg-black/25 p-3 rounded-xl border border-white/5 truncate max-w-full text-xs font-mono text-secondary"
              title={actualDir}
            >
              {actualDir}
            </div>
            <button
              type="button"
              onClick={handleSelectDirectory}
              disabled={isMoving}
              className="flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-2.5 px-4 rounded-xl font-medium text-xs transition-colors self-start"
            >
              {isMoving ? (
                <span className="animate-pulse">{t('settings.moving_files', 'Перемещение файлов...')}</span>
              ) : (
                <>
                  <FolderSearch size={16} />
                  <span>{t('settings.change_folder', 'Изменить папку')}</span>
                </>
              )}
            </button>
          </div>
        </SettingSection>
      )}

      {/* 4. Advanced Mode Settings */}
      {isAdvanced && (
        <>
          {/* Storage Limit Slider (GB) */}
          <StorageLimitControl isMobile={isMobile} />

          {/* Image Memory Limit Slider (MB) */}
          <ImageMemoryLimitControl isMobile={isMobile} />

          {/* Download Concurrency Slider */}
          <SettingSection
            title={t('settings.download_concurrency', 'Параллельность загрузок')}
            icon={<Sliders size={16} />}
            description={t(
              'settings.download_concurrency_desc',
              'Количество одновременно скачиваемых аудиодорожек'
            )}
            isMobile={isMobile}
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={maxDownloadConcurrency}
                  onChange={(e) => setMaxDownloadConcurrency(parseInt(e.target.value, 10))}
                  className="flex-1 h-2 bg-black/30 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-sm font-mono font-bold text-foreground w-8 text-right">
                  {maxDownloadConcurrency}
                </span>
              </div>
            </div>
          </SettingSection>

          {/* Downloaded Music Grid (Native desktop/mobile) */}
          {(isTauri() || isCapacitor()) && (
            <DownloadedMusicGrid
              isMobile={isMobile}
              onRefreshRequested={refreshStats}
              onManageClick={() => setShowDeleteModal(true)}
            />
          )}

          {/* Danger Zone */}
          <StorageDangerZone isMobile={isMobile} onActionComplete={refreshStats} />
        </>
      )}

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
