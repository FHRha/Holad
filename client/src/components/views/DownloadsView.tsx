import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDownloadStore, verifyDownloads } from '../../store/downloadStore';
import { Trash2, FolderOpen, AlertTriangle, Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { StorageManager, isTauri } from '../../utils/StorageManager';
import DownloadedMusicGrid from '../settings/DownloadedMusicGrid';

export default function DownloadsView() {
  const { t } = useTranslation();
  const { downloads, removeDownload, clearHistory, downloadDirectory } = useDownloadStore();
  const [isScanning, setIsScanning] = useState(false);

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

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      await verifyDownloads();
    } catch (e) {
      console.error('Failed to verify downloads:', e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeleteItem = async (item: any) => {
    if (item.status === 'downloading' || item.status === 'queued' || item.status === 'paused') {
      import('../../utils/downloadHelper').then(m => m.cancelActiveDownload(item.id));
    }
    
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

  const handleClearAll = async () => {
    const completedItems = Object.values(downloads || {}).filter(d => d.status === 'completed' || d.status === 'error');
    for (const item of completedItems) {
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
    }
    clearHistory();
  };

  const items = Object.values(downloads || {}).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const activeOrFailedItems = items.filter(item => item.status === 'downloading' || item.status === 'queued' || item.status === 'error' || item.status === 'paused');

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 hide-scrollbar">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black mb-2">{t('views.downloads')}</h1>
          <p className="text-secondary text-sm">
            {t('views.downloads_desc')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleRescan}
            disabled={isScanning}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={18} className={isScanning ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{t('views.rescan')}</span>
          </button>
          {isTauri() && (
            <button 
              onClick={handleOpenFolder}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
            >
              <FolderOpen size={18} />
              <span className="hidden sm:inline">{t('views.open_folder')}</span>
            </button>
          )}
          {items.length > 0 && (
            <button 
              onClick={handleClearAll}
              className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-xl transition-colors text-sm font-medium"
            >
              <Trash2 size={18} />
              <span className="hidden sm:inline">{t('views.delete_all')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active & Queued Downloads Section (if any in progress) */}
      {activeOrFailedItems.length > 0 && (
        <div className="flex flex-col gap-3 mb-8">
          <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">
            {t('sidebar.downloading')} ({activeOrFailedItems.length})
          </h3>
          <div className="flex flex-col gap-2">
            {activeOrFailedItems.map(item => (
              <div key={item.id} className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                  {item.coverArt || item.localCoverArtUri ? (
                    <div className="w-12 h-12 rounded-lg shrink-0 relative overflow-hidden bg-black/40">
                      <img 
                        src={item.localCoverArtUri || item.coverArt} 
                        alt="cover" 
                        className="w-full h-full object-cover shadow-md"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ) : item.status === 'paused' ? (
                    <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center shrink-0 text-yellow-500">
                      <Pause size={20} />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center shrink-0 text-secondary">
                      <Loader2 size={20} className={item.status === 'downloading' ? 'animate-spin text-primary' : ''} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm truncate text-foreground">{item.name}</h4>
                      <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] font-bold text-secondary uppercase">
                        {item.type === 'album' ? t('settings.album') : t('settings.track')}
                      </span>
                    </div>

                    {item.type === 'album' && (item.status === 'downloading' || item.status === 'paused') && item.currentTrackName ? (
                      <p className={`text-xs truncate flex items-center gap-1.5 mt-0.5 ${item.status === 'paused' ? 'text-yellow-500' : 'text-primary'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'paused' ? 'bg-yellow-500' : 'bg-primary animate-pulse'}`} />
                        {item.currentTrackName}
                      </p>
                    ) : (
                      <p className="text-xs text-secondary truncate mt-0.5">
                        {item.status === 'queued' 
                          ? t('views.queued') 
                          : item.status === 'paused'
                            ? t('views.paused')
                            : item.artist || item.album || ''}
                      </p>
                    )}
                    
                    {(item.status === 'downloading' || item.status === 'paused') && (
                      <div className="mt-2 w-full bg-black/50 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${item.status === 'paused' ? 'bg-yellow-500' : 'bg-primary'}`} 
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}

                    {item.status === 'error' && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {item.error || t('views.download_error')}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                  {(item.status === 'downloading' || item.status === 'paused') && (
                    <span className={`text-xs font-bold tabular-nums ${item.status === 'paused' ? 'text-yellow-500' : 'text-primary'}`}>{item.progress}%</span>
                  )}
                  {item.status === 'queued' && (
                    <span className="text-xs font-medium text-secondary">0%</span>
                  )}
                  
                  {(item.status === 'downloading' || item.status === 'paused' || item.status === 'queued') && (
                    <button 
                      onClick={async () => {
                        if (item.status === 'paused') {
                          useDownloadStore.getState().resumeDownload(item.id);
                          const helper = await import('../../utils/downloadHelper');
                          if (!helper.isDownloadActive(item.id)) {
                            helper.handleDownload(item.id, item.name, item.type);
                          }
                        } else {
                          useDownloadStore.getState().pauseDownload(item.id);
                        }
                      }}
                      className="p-2 text-secondary hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      title={item.status === 'paused' ? t('common.resume') : t('common.pause')}
                    >
                      {item.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                    </button>
                  )}

                  <button 
                    onClick={() => handleDeleteItem(item)}
                    className="p-2 text-secondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title={t('common.delete')}
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
