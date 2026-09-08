import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Plus, Search, Check, ListMusic } from 'lucide-react';
import { getPlaylists, createPlaylist, updatePlaylistTracks } from '../../api/subsonic/playlists';
import { usePlaylistStore } from '../../store/playlistStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import PlaylistCover from './PlaylistCover';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  trackIds: string[];
}

export default function AddToPlaylistModal({ isOpen, onClose, trackIds }: Props) {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const customPlaylists = usePlaylistStore(state => state.playlists);
  const { isOffline } = useNetworkStatus();

  useEffect(() => {
    if (isOpen) {
      const mapCustom = () => customPlaylists.map(cp => ({
        id: cp.id,
        name: cp.name,
        songCount: cp.trackIds.length,
        coverArt: cp.trackIds.length > 0 ? cp.trackIds[0] : null,
        trackIds: cp.trackIds,
        isCustom: true
      }));

      if (!isOffline) {
        getPlaylists().then(serverPlaylists => {
          setPlaylists([...mapCustom(), ...(serverPlaylists || [])]);
        }).catch(err => {
          console.error(err);
          setPlaylists(mapCustom());
        });
      } else {
        setPlaylists(mapCustom());
      }
    } else {
      setSearch('');
      setNewPlaylistName('');
    }
  }, [isOpen, isOffline, customPlaylists]);

  if (!isOpen) return null;

  const filtered = playlists.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setIsCreating(true);
    try {
      if (isOffline) {
        const newId = usePlaylistStore.getState().createPlaylist(newPlaylistName.trim());
        await handleAdd(newId, true);
        setNewPlaylistName('');
      } else {
        await createPlaylist(newPlaylistName.trim());
        const updated = await getPlaylists();
        const created = updated.find(p => p.name === newPlaylistName.trim());
        if (created) {
           await handleAdd(created.id, false);
        } else {
           setNewPlaylistName('');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAdd = async (playlistId: string, isCustomOverride?: boolean) => {
    setAddingTo(playlistId);
    try {
      const playlist = playlists.find(p => p.id === playlistId);
      const isCustom = isCustomOverride ?? playlist?.isCustom;
      
      if (isCustom) {
        trackIds.forEach(id => {
          usePlaylistStore.getState().addTrack(playlistId, id);
        });
      } else {
        await updatePlaylistTracks(playlistId, trackIds);
      }
      window.dispatchEvent(new CustomEvent('playlists-updated'));
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setAddingTo(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">{t('common.add_to_playlist')}</h2>
          <button onClick={onClose} className="p-2 text-secondary hover:text-foreground transition-colors rounded-full hover:bg-foreground/10">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input 
              type="text" 
              placeholder={t('common.search_playlists')} 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {filtered.length > 0 ? (
            <div className="space-y-1">
              {filtered.map(p => {
                return (
                  <button
                    key={p.id}
                    onClick={() => handleAdd(p.id)}
                    disabled={addingTo !== null}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/5 transition-colors text-left disabled:opacity-50 group"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 shadow-sm bg-black/20">
                      <PlaylistCover
                        coverArt={p.coverArt}
                        trackIds={p.trackIds}
                        alt=""
                        size={100}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>
                    <div className="text-xs text-secondary truncate">{p.songCount || 0} {t('common.songs')}</div>
                    </div>
                    {addingTo === p.id && <Check size={18} className="text-primary mr-2" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-secondary gap-2 p-8 text-center">
              <ListMusic size={32} className="opacity-50" />
              <p className="text-sm">{t('common.no_playlists_found')}</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-background/20">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input 
              type="text" 
              placeholder={t('common.new_playlist')} 
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              className="flex-1 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-secondary focus:outline-none focus:border-primary/50 transition-colors"
            />
            <button 
              type="submit"
              disabled={!newPlaylistName.trim() || isCreating}
              className="px-4 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl disabled:opacity-50 flex items-center gap-2 hover:bg-primary/90 transition-colors"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">{t('common.create')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
