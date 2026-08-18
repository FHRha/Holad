import { useTranslation } from 'react-i18next';
import { useDownloadStore } from '../../store/downloadStore';
import { Trash2, FolderOpen, AlertTriangle, Loader2 } from 'lucide-react';
import { StorageManager, isTauri } from '../../utils/StorageManager';
import DownloadedMusicGrid from '../settings/DownloadedMusicGrid';

export default function DownloadsView() {
  const { t } = useTranslation();
  const { downloads, removeDownload, clearHistory, downloadDirectory } = useDownloadStore();

  const handleOpenFolder = async () => {
    if (isTauri()) {
      try {
        const { open: openNative } = await import('@tauri-apps/plugin-shell');
        const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
        const dir = downloadDirectory || await StorageManager.getDefaultDownloadDir();
        const hasDir = await exists(dir);
        if (!hasDir) {
          await mkdir(dir, { recursive: true });
        }
        await openNative(dir);
      } catch (e) {
        console.error('Failed to open downloads folder:', e);
      }
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

  const items = Object.values(downloads || {}).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const activeOrFailedItems = items.filter(item => item.status === 'downloading' || item.status === 'queued' || item.status === 'error');

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 hide-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black mb-2">{t('views.downloads', { defaultValue: 'Загрузки' })}</h1>
          <p className="text-secondary text-sm">
            {t('views.downloads_desc', { defaultValue: 'Управление скачанными треками для оффлайн прослушивания' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isTauri() && (
            <button 
              onClick={handleOpenFolder}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
            >
              <FolderOpen size={18} />
              <span>{t('views.open_folder', { defaultValue: 'Открыть папку' })}</span>
            </button>
          )}
          {items.length > 0 && (
            <button 
              onClick={clearHistory}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
            >
              <Trash2 size={18} />
              <span>{t('views.clear_history', { defaultValue: 'Очистить историю' })}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active & Queued Downloads Section (if any in progress) */}
      {activeOrFailedItems.length > 0 && (
        <div className="flex flex-col gap-3 mb-8">
          <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">
            {t('sidebar.downloading', { defaultValue: 'Активные загрузки' })} ({activeOrFailedItems.length})
          </h3>
          <div className="flex flex-col gap-2">
            {activeOrFailedItems.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                  {item.coverArt ? (
                    <img src={item.localCoverArtUri || item.coverArt} alt="cover" className="w-12 h-12 rounded-lg object-cover shadow-md shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center shrink-0 text-secondary">
                      <Loader2 size={20} className={item.status === 'downloading' ? 'animate-spin text-primary' : ''} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm truncate text-foreground">{item.name}</h4>
                      <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] font-bold text-secondary uppercase">
                        {item.type === 'album' ? t('settings.album', { defaultValue: 'Альбом' }) : t('settings.track', { defaultValue: 'Трек' })}
                      </span>
                    </div>

                    {item.type === 'album' && item.status === 'downloading' && item.currentTrackName ? (
                      <p className="text-xs text-primary truncate flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {item.currentTrackName}
                      </p>
                    ) : (
                      <p className="text-xs text-secondary truncate mt-0.5">
                        {item.status === 'queued' 
                          ? t('views.queued', { defaultValue: 'в очереди' }) 
                          : item.artist || item.album || ''}
                      </p>
                    )}
                    
                    {item.status === 'downloading' && (
                      <div className="mt-2 w-full bg-black/50 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="bg-primary h-full transition-all duration-300" 
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {item.status === 'error' && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {item.error || t('views.download_error', { defaultValue: 'Ошибка скачивания' })}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  {item.status === 'downloading' && (
                    <span className="text-xs font-bold text-primary tabular-nums">{item.progress}%</span>
                  )}
                  {item.status === 'queued' && (
                    <span className="text-xs font-medium text-secondary">0%</span>
                  )}
                  
                  <button 
                    onClick={() => handleDeleteItem(item)}
                    className="p-2 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title={t('common.delete', { defaultValue: 'Удалить' })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Downloaded Music Grid & Library */}
      <DownloadedMusicGrid />
    </div>
  );
}
