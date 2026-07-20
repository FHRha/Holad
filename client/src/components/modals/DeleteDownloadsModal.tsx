import { useState } from 'react';
import { X, Trash2, CheckSquare, Square, Music, Disc3 } from 'lucide-react';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

export default function DeleteDownloadsModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { downloads, removeDownload } = useDownloadStore();
  
  const completedItems = Object.values(downloads)
    .filter(d => d.status === 'completed' || d.status === 'error')
    .sort((a, b) => b.timestamp - a.timestamp);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === completedItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(completedItems.map(i => i.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    for (const id of selectedIds) {
      const item = downloads[id];
      if (item) {
        if (item.path) {
          try {
            if (item.type === 'album') {
              await StorageManager.removeDirectory(item.path);
            } else {
              await StorageManager.removeTrack(item.path);
            }
          } catch (e) {
            console.error(`Failed to delete file ${item.path}:`, e);
          }
        }
        removeDownload(id);
      }
    }

    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-white/10 flex flex-col m-4 overflow-hidden">
        
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-background/50">
          <div>
            <h2 className="text-2xl font-bold">{t('settings.delete_downloads_title', { defaultValue: 'Удаление загрузок' })}</h2>
            <p className="text-secondary text-sm mt-1">
              {t('settings.delete_downloads_subtitle', { defaultValue: 'Выберите скачанные треки или альбомы для удаления с устройства.' })}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-background">
          {completedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-secondary">
              <p>{t('settings.no_downloaded_files', { defaultValue: 'Нет скачанных файлов.' })}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div 
                onClick={selectAll}
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 rounded-xl transition-colors mb-2"
              >
                {selectedIds.size === completedItems.length && completedItems.length > 0 ? (
                  <CheckSquare className="text-primary" size={20} />
                ) : (
                  <Square className="text-secondary" size={20} />
                )}
                <span className="font-medium text-sm">{t('settings.select_all', { defaultValue: 'Выбрать все' })}</span>
              </div>

              {completedItems.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => toggleSelect(item.id)}
                  className={`flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedIds.has(item.id) 
                      ? 'border-primary bg-primary/10' 
                      : 'border-white/5 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex-shrink-0 text-primary">
                    {selectedIds.has(item.id) ? (
                      <CheckSquare size={20} />
                    ) : (
                      <Square size={20} className="text-secondary" />
                    )}
                  </div>

                  {item.coverArt ? (
                    <img src={item.coverArt} alt="cover" className="w-12 h-12 rounded-lg object-cover shadow-md" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                      {item.type === 'album' ? <Disc3 size={20} className="text-secondary" /> : <Music size={20} className="text-secondary" />}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{item.name}</h3>
                    <p className="text-xs text-secondary truncate flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 bg-white/10 rounded uppercase text-[10px] font-bold">
                        {item.type === 'album' ? t('settings.album', { defaultValue: 'Альбом' }) : t('settings.track', { defaultValue: 'Трек' })}
                      </span>
                      {item.path}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-white/10 bg-background/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
          >
            {t('settings.cancel', { defaultValue: 'Отмена' })}
          </button>
          <button 
            onClick={handleDelete}
            disabled={selectedIds.size === 0 || isDeleting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
              selectedIds.size > 0 && !isDeleting
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                : 'bg-red-500/20 text-red-500/50 cursor-not-allowed'
            }`}
          >
            {isDeleting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 size={18} />
            )}
            <span>
              {t('settings.delete_selected', { defaultValue: 'Удалить выбранные' })} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
