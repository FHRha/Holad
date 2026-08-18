import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Image as ImageIcon, Database, Trash2, Check, Loader2 } from 'lucide-react';
import { clearAppCache } from '../../utils/storage';
import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { useDownloadStore } from '../../store/downloadStore';
import { cancelActiveDownload } from '../../utils/downloadHelper';
import { clearImageCache } from '../../utils/imageCache';

interface StorageDangerZoneProps {
  isMobile?: boolean;
  className?: string;
  onActionComplete?: () => void;
}

type ActionState = 'idle' | 'confirm' | 'in_progress' | 'done';

export default function StorageDangerZone({
  isMobile = false,
  className = '',
  onActionComplete,
}: StorageDangerZoneProps) {
  const { t } = useTranslation();
  const [imageState, setImageState] = useState<ActionState>('idle');
  const [metadataState, setMetadataState] = useState<ActionState>('idle');
  const [musicState, setMusicState] = useState<ActionState>('idle');

  // 1. Clear Image Cache Action
  const handleClearImageCache = async () => {
    if (imageState === 'idle') {
      setImageState('confirm');
      setTimeout(() => setImageState((prev) => (prev === 'confirm' ? 'idle' : prev)), 4000);
      return;
    }

    if (imageState === 'confirm') {
      setImageState('in_progress');
      try {
        // In-memory LRU revocation and cleanup
        clearImageCache();

        // Disk covers folder purge
        if (isTauri()) {
          try {
            const { join } = await import('@tauri-apps/api/path');
            const { exists, remove } = await import('@tauri-apps/plugin-fs');
            const dDir = useDownloadStore.getState().downloadDirectory || await StorageManager.getDefaultDownloadDir();
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
            try {
              await Filesystem.rmdir({ path: 'Holad/covers', directory: Directory.Data, recursive: true });
            } catch {}
          } catch (e) {
            console.warn('Capacitor covers folder cleanup error:', e);
          }
        }

        // Web cacheStorage purge
        if (typeof window !== 'undefined' && 'caches' in window) {
          try {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
            }
          } catch {}
        }

        setImageState('done');
        onActionComplete?.();
        setTimeout(() => setImageState('idle'), 2500);
      } catch (err) {
        console.error('Failed to clear image cache:', err);
        setImageState('idle');
      }
    }
  };

  // 2. Clear Metadata Cache Action
  const handleClearMetadataCache = async () => {
    if (metadataState === 'idle') {
      setMetadataState('confirm');
      setTimeout(() => setMetadataState((prev) => (prev === 'confirm' ? 'idle' : prev)), 4000);
      return;
    }

    if (metadataState === 'confirm') {
      setMetadataState('in_progress');
      try {
        clearAppCache();
        setMetadataState('done');
        onActionComplete?.();
        setTimeout(() => setMetadataState('idle'), 2500);
      } catch (err) {
        console.error('Failed to clear metadata cache:', err);
        setMetadataState('idle');
      }
    }
  };

  // 3. Delete All Downloaded Music Action
  const handleDeleteAllMusic = async () => {
    if (musicState === 'idle') {
      setMusicState('confirm');
      setTimeout(() => setMusicState((prev) => (prev === 'confirm' ? 'idle' : prev)), 4000);
      return;
    }

    if (musicState === 'confirm') {
      setMusicState('in_progress');
      try {
        const { downloads, removeDownload } = useDownloadStore.getState();

        // 1. Abort active streams
        for (const id in downloads) {
          if (downloads[id].status === 'downloading' || downloads[id].status === 'queued') {
            cancelActiveDownload(id);
          }
        }

        // 2. Delete all disk files
        for (const id in downloads) {
          const item = downloads[id];
          if (item.path) {
            try {
              if (item.type === 'album') {
                await StorageManager.removeDirectory(item.path);
              } else {
                await StorageManager.removeTrack(item.path);
              }
            } catch (e) {
              console.warn(`Failed to delete item at ${item.path}:`, e);
            }
          }
          removeDownload(id);
        }

        // 3. Clean up root folders
        if (isTauri()) {
          try {
            const { join } = await import('@tauri-apps/api/path');
            const { exists, remove } = await import('@tauri-apps/plugin-fs');
            const dDir = useDownloadStore.getState().downloadDirectory || await StorageManager.getDefaultDownloadDir();
            const tracksDir = await join(dDir, 'tracks');
            const albumsDir = await join(dDir, 'albums');
            if (await exists(tracksDir)) await remove(tracksDir, { recursive: true });
            if (await exists(albumsDir)) await remove(albumsDir, { recursive: true });
          } catch (e) {
            console.warn('Tauri root folder cleanup error:', e);
          }
        } else if (isCapacitor()) {
          try {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            try { await Filesystem.rmdir({ path: 'Holad/tracks', directory: Directory.Data, recursive: true }); } catch {}
            try { await Filesystem.rmdir({ path: 'Holad/albums', directory: Directory.Data, recursive: true }); } catch {}
          } catch (e) {
            console.warn('Capacitor root folder cleanup error:', e);
          }
        }

        setMusicState('done');
        onActionComplete?.();
        setTimeout(() => setMusicState('idle'), 2500);
      } catch (err) {
        console.error('Failed to delete all downloaded music:', err);
        setMusicState('idle');
      }
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-center gap-2 text-red-400 font-semibold text-sm uppercase tracking-wider">
        <AlertTriangle size={18} />
        <span>{t('settings.danger_zone', { defaultValue: 'Опасная зона' })}</span>
      </div>

      <div className={`bg-red-500/5 border border-red-500/20 rounded-2xl flex flex-col gap-4 ${isMobile ? 'p-3.5' : 'p-4 md:p-5'}`}>
        <p className="text-xs text-secondary leading-relaxed">
          {t('settings.danger_zone_desc', { defaultValue: 'Необратимые действия по очистке кэша и удалению локальных файлов.' })}
        </p>

        <div className="grid grid-cols-1 gap-3">
          {/* Action 1: Clear Image Cache */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-background/60 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5 text-secondary flex-shrink-0">
                <ImageIcon size={18} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {t('settings.clear_image_cache', { defaultValue: 'Очистить кэш изображений' })}
                </span>
                <span className="text-xs text-secondary leading-normal">
                  {t('settings.clear_image_cache_desc', { defaultValue: 'Очистить кэш обложек из памяти и диска' })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearImageCache}
              disabled={imageState === 'in_progress'}
              className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                imageState === 'done'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : imageState === 'confirm'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
              }`}
            >
              {imageState === 'in_progress' && <Loader2 size={14} className="animate-spin" />}
              {imageState === 'done' && <Check size={14} />}
              <span>
                {imageState === 'done'
                  ? t('settings.action_cleared', { defaultValue: 'Очищено!' })
                  : imageState === 'confirm'
                    ? t('settings.confirm_action', { defaultValue: 'Подтвердить?' })
                    : t('settings.clear_images_btn', { defaultValue: 'Очистить кэш' })}
              </span>
            </button>
          </div>

          {/* Action 2: Clear Metadata Cache */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-background/60 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/5 text-secondary flex-shrink-0">
                <Database size={18} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {t('settings.clear_metadata_cache', { defaultValue: 'Очистить кэш метаданных' })}
                </span>
                <span className="text-xs text-secondary leading-normal">
                  {t('settings.clear_metadata_cache_desc', { defaultValue: 'Сбросить локальную историю и кэш данных' })}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClearMetadataCache}
              disabled={metadataState === 'in_progress'}
              className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                metadataState === 'done'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                  : metadataState === 'confirm'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
              }`}
            >
              {metadataState === 'in_progress' && <Loader2 size={14} className="animate-spin" />}
              {metadataState === 'done' && <Check size={14} />}
              <span>
                {metadataState === 'done'
                  ? t('settings.action_cleared', { defaultValue: 'Очищено!' })
                  : metadataState === 'confirm'
                    ? t('settings.confirm_action', { defaultValue: 'Подтвердить?' })
                    : t('settings.clear_metadata_btn', { defaultValue: 'Очистить данные' })}
              </span>
            </button>
          </div>

          {/* Action 3: Delete All Downloaded Music */}
          {(isTauri() || isCapacitor()) && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-background/60 border border-red-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10 text-red-400 flex-shrink-0">
                  <Trash2 size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-red-300">
                    {t('settings.delete_all_music', { defaultValue: 'Удалить всю скачанную музыку' })}
                  </span>
                  <span className="text-xs text-red-400/70 leading-normal">
                    {t('settings.delete_all_music_desc', { defaultValue: 'Безвозвратное удаление всех треков и альбомов' })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDeleteAllMusic}
                disabled={musicState === 'in_progress'}
                className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  musicState === 'done'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : musicState === 'confirm'
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 animate-pulse font-bold'
                      : 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30'
                }`}
              >
                {musicState === 'in_progress' && <Loader2 size={14} className="animate-spin" />}
                {musicState === 'done' && <Check size={14} />}
                <span>
                  {musicState === 'done'
                    ? t('settings.action_deleted', { defaultValue: 'Удалено!' })
                    : musicState === 'confirm'
                      ? t('settings.confirm_delete_all', { defaultValue: 'Удалить всё навсегда?' })
                      : t('settings.delete_all_music_btn', { defaultValue: 'Удалить загрузки' })}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
