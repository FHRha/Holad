import { useState, useMemo } from 'react';
import { X, Trash2, CheckSquare, Square, Music, Disc3, Search } from 'lucide-react';
import { useDownloadStore } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

export default function DeleteDownloadsModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { downloads, removeDownload } = useDownloadStore();
  
  const completedItems = useMemo(() => {
    return Object.values(downloads)
      .filter(d => d.status === 'completed' || d.status === 'error')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [downloads]);

  const [activeFilter, setActiveFilter] = useState<'all' | 'albums' | 'tracks'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredItems = useMemo(() => {
    return completedItems.filter(item => {
      if (activeFilter === 'albums' && item.type !== 'album') return false;
      if (activeFilter === 'tracks' && item.type !== 'track') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          (item.artist && item.artist.toLowerCase().includes(q)) ||
          (item.album && item.album.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [completedItems, activeFilter, searchQuery]);

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
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);

    for (const id of selectedIds) {
      const item = downloads[id];
      if (!item) continue;
      
      if (item.path && item.path !== 'album_completed' && item.path !== 'album_empty') {
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

      if (item.type === 'album') {
        for (const childId in downloads) {
          if (downloads[childId].albumId === item.id) {
            if (downloads[childId].path && downloads[childId].path !== item.path) {
              try { await StorageManager.removeTrack(downloads[childId].path); } catch {}
            }
            removeDownload(childId);
          }
        }
      }

      removeDownload(id);
    }

    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-2xl h-[85vh] rounded-2xl shadow-2xl border border-white/10 flex flex-col m-4 overflow-hidden">
        
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-background/50 shrink-0">
          <div>
            <h2 className="text-xl font-bold">{t('settings.delete_downloads_title')}</h2>
            <p className="text-secondary text-xs mt-1">
              {t('settings.delete_downloads_subtitle')}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 bg-background border-b border-white/5 shrink-0 flex flex-col sm:flex-row gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-background/50 p-1 rounded-xl border border-white/5 text-xs font-medium">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'all' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_all')}
            </button>
            <button
              onClick={() => setActiveFilter('albums')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'albums' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_albums')}
            </button>
            <button
              onClick={() => setActiveFilter('tracks')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'tracks' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_tracks')}
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('settings.search_downloads')}
              className="w-full bg-background/50 border border-white/10 rounded-xl py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-secondary focus:border-primary outline-none transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-background">
          {completedItems.length === 0 ? (
            <div className="h-full flex items-center justify-center text-secondary">
              <p>{t('settings.no_downloaded_files')}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-secondary">
              <Search size={32} className="mb-2 text-[#808080]" />
              <p>{t('settings.no_matching_downloads')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div 
                onClick={selectAll}
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-white/5 rounded-xl transition-colors mb-2"
              >
                {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? (
                  <CheckSquare className="text-primary" size={20} />
                ) : (
                  <Square className="text-secondary" size={20} />
                )}
                <span className="font-medium text-sm">{t('settings.select_all')}</span>
              </div>

              {filteredItems.map(item => (
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

                  {item.localCoverArtUri || item.coverArt ? (
                    <div className="w-12 h-12 rounded-lg shrink-0 relative overflow-hidden bg-black/40">
                      <img 
                        src={item.localCoverArtUri || item.coverArt} 
                        alt="cover" 
                        className="w-full h-full object-cover shadow-md"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                      {item.type === 'album' ? <Disc3 size={20} className="text-secondary" /> : <Music size={20} className="text-secondary" />}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{item.name}</h3>
                    <p className="text-xs text-secondary truncate flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 bg-white/10 rounded uppercase text-[10px] font-bold shrink-0">
                        {item.type === 'album' ? t('settings.album') : t('settings.track')}
                      </span>
                      <span className="truncate">{item.artist || item.album || item.path}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 bg-background/50 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
          >
            {t('settings.cancel')}
          </button>
          <button 
            onClick={handleDelete}
            disabled={selectedIds.size === 0 || isDeleting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              selectedIds.size > 0 && !isDeleting
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                : 'bg-red-500/20 text-red-500/50 cursor-not-allowed'
            }`}
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            <span>
              {t('settings.delete_selected')} {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
