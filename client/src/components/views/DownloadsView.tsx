import { useTranslation } from 'react-i18next';
import { useDownloadStore } from '../../store/downloadStore';
import { Trash2, FolderOpen, AlertTriangle } from 'lucide-react';
import { StorageManager } from '../../utils/StorageManager';
import { open as openNative } from '@tauri-apps/plugin-shell';
import { exists, mkdir } from '@tauri-apps/plugin-fs';

export default function DownloadsView() {
  const { t } = useTranslation();
  const { downloads, removeDownload, clearHistory, downloadDirectory } = useDownloadStore();

  const handleOpenFolder = async () => {
    try {
      const dir = downloadDirectory || await StorageManager.getDefaultDownloadDir();
      const hasDir = await exists(dir);
      if (!hasDir) {
        await mkdir(dir, { recursive: true });
      }
      await openNative(dir);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteItem = async (item: any) => {
    if (item.path && item.path !== 'album_completed' && item.path !== 'album_empty') {
      try {
        if (item.type === 'album') {
          await StorageManager.removeDirectory(item.path);
        } else {
          await StorageManager.removeTrack(item.path);
        }
      } catch (e) {
        console.error('Failed to remove file from disk', e);
      }
    }
    removeDownload(item.id);
  };

  const handleClear = () => {
    clearHistory();
  };

  const items = Object.values(downloads).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 hide-scrollbar">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2">{t('views.downloads', { defaultValue: 'Загрузки' })}</h1>
          <p className="text-secondary text-sm">
            {t('views.downloads_desc', { defaultValue: 'Управление скачанными треками для оффлайн прослушивания' })}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleOpenFolder}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
          >
            <FolderOpen size={18} />
            <span>{t('views.open_folder', { defaultValue: 'Открыть папку' })}</span>
          </button>
          <button 
            onClick={handleClear}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
          >
            <Trash2 size={18} />
            <span>{t('views.clear_history', { defaultValue: 'Очистить историю' })}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <div className="text-center py-20 text-secondary">
            <p>{t('views.no_downloads', { defaultValue: 'У вас пока нет загрузок' })}</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                {item.coverArt && (
                  <img src={item.coverArt} alt="cover" className="w-14 h-14 rounded-lg object-cover shadow-md" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base truncate">{item.name}</h3>
                  {item.type === 'album' && item.status === 'downloading' && item.currentTrackName ? (
                    <p className="text-sm text-primary truncate flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      {item.currentTrackName}
                    </p>
                  ) : (
                    <p className="text-sm text-secondary truncate">
                      {item.path === 'album_completed' || (item.type === 'album' && item.status === 'completed')
                        ? t('views.album_downloaded', { defaultValue: 'Альбом загружен' }) 
                        : item.path === 'album_empty'
                          ? t('views.album_empty', { defaultValue: 'Пустой альбом' })
                          : (item.path || (item.type === 'album' ? 'Альбом' : 'Трек'))}
                    </p>
                  )}
                  
                  {item.status === 'downloading' && (
                    <div className="mt-3 w-full bg-black/50 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-primary h-full transition-all duration-300" 
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      {item.error || 'Ошибка скачивания'}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {item.status === 'downloading' && (
                  <span className="text-sm font-medium text-primary">{item.progress}%</span>
                )}
                {item.status === 'completed' && (
                  <span className="text-xs font-bold px-2 py-1 bg-green-500/20 text-green-400 rounded-md">
                    {t('views.completed', { defaultValue: 'Завершено' })}
                  </span>
                )}
                
                <button 
                  onClick={() => handleDeleteItem(item)}
                  className="p-2 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title={t('common.delete', { defaultValue: 'Удалить' })}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
