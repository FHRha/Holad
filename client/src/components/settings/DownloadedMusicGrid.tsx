import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Music, 
  Disc3, 
  Play, 
  Trash2, 
  DownloadCloud, 
  Search, 
  LayoutGrid, 
  List, 
  Loader2, 
  Check, 
  Layers
} from 'lucide-react';
import { useDownloadStore, getOfflineTracks } from '../../store/downloadStore';
import type { DownloadItem } from '../../store/downloadStore';
import { StorageManager } from '../../utils/StorageManager';
import { downloadEntireLibrary } from '../../utils/downloadHelper';
import { getAlbum, getCoverArtUrl } from '../../api/subsonic';
import { getCachedImageUrl } from '../../utils/imageCache';
import { formatBytes } from '../../utils/storageStatsHelper';
import { usePlayerStore } from '../../store/playerStore';
import type { Track } from '../../store/playerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { isOffline } from '../../utils/networkStatus';
import { useContextMenuStore } from '../../store/contextMenuStore';

export interface DownloadedMusicGridProps {
  isMobile?: boolean;
  className?: string;
  onRefreshRequested?: () => void;
  onManageClick?: () => void;
}

export default function DownloadedMusicGrid({
  isMobile = false,
  className = '',
  onRefreshRequested,
  onManageClick,
}: DownloadedMusicGridProps) {
  const { t } = useTranslation();
  const downloads = useDownloadStore(state => state.downloads);
  const removeDownload = useDownloadStore(state => state.removeDownload);
  const setQueueAndPlay = usePlayerStore(state => state.setQueueAndPlay);
  const playNext = usePlayerStore(state => state.playNext);
  const clickAction = useSettingsStore(state => state.clickAction);
  const maxDownloadConcurrency = useSettingsStore(state => state.maxDownloadConcurrency);

  const [activeFilter, setActiveFilter] = useState<'all' | 'albums' | 'tracks'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloadingLibrary, setIsDownloadingLibrary] = useState(false);
  const [libraryProgress, setLibraryProgress] = useState<{ current: number; total: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [libraryDownloadedMsg, setLibraryDownloadedMsg] = useState<string | null>(null);

  // 1. Filter completed items
  const completedItems = useMemo(() => {
    return Object.values(downloads || {})
      .filter(d => d.status === 'completed')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [downloads]);

  // 2. Metrics
  const albumCount = useMemo(() => completedItems.filter(d => d.type === 'album').length, [completedItems]);
  const trackCount = useMemo(() => completedItems.filter(d => d.type === 'track').length, [completedItems]);
  const totalSizeBytes = useMemo(() => {
    return completedItems.reduce((acc, item) => acc + (item.sizeBytes || item.totalBytes || 0), 0);
  }, [completedItems]);

  // 3. Tab and Search filtering
  const filteredItems = useMemo(() => {
    return completedItems.filter(item => {
      if (activeFilter === 'albums' && item.type !== 'album') return false;
      if (activeFilter === 'tracks' && item.type !== 'track') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesArtist = item.artist ? item.artist.toLowerCase().includes(q) : false;
        const matchesAlbum = item.album ? item.album.toLowerCase().includes(q) : false;
        return matchesName || matchesArtist || matchesAlbum;
      }
      return true;
    });
  }, [completedItems, activeFilter, searchQuery]);

  // 4. Batch Download Entire Library
  const handleDownloadEntireLibrary = async () => {
    if (isDownloadingLibrary) return;
    if (isOffline()) {
      setLibraryDownloadedMsg(t('settings.cannot_download_offline'));
      setTimeout(() => setLibraryDownloadedMsg(null), 3500);
      return;
    }

    setIsDownloadingLibrary(true);
    setLibraryDownloadedMsg(null);
    setLibraryProgress(null);

    try {
      const result = await downloadEntireLibrary((progress) => {
        if (progress.status === 'downloading' || progress.status === 'enqueuing') {
          setLibraryProgress({ current: progress.completed, total: progress.queued });
        }
      }, maxDownloadConcurrency);

      if (result.queuedCount === 0) {
        setLibraryDownloadedMsg(t('settings.all_library_already_downloaded'));
      } else {
        setLibraryDownloadedMsg(
          t('settings.library_download_completed')
        );
      }

      onRefreshRequested?.();
      setTimeout(() => {
        setLibraryDownloadedMsg(null);
        setLibraryProgress(null);
      }, 4000);
    } catch (err) {
      console.error('Failed to batch download library:', err);
    } finally {
      setIsDownloadingLibrary(false);
    }
  };

  // 5. Playback Trigger
  const handlePlayItem = async (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();

    if (item.type === 'track') {
      const track: Track = {
        id: item.id,
        title: item.name,
        artist: item.artist || 'Unknown Artist',
        album: item.album || 'Downloaded',
        albumId: item.albumId,
        coverArt: item.localCoverArtUri || item.coverArt || '',
        duration: item.duration || 0,
      };

      if (clickAction === 'play_next') {
        playNext([track]);
      } else {
        setQueueAndPlay([track], 0);
      }
    } else {
      // Album playback
      const allOffline = getOfflineTracks();
      const albumTracks = allOffline.filter(t => t.albumId === item.id || t.album === item.name);

      if (albumTracks.length > 0) {
        setQueueAndPlay(albumTracks, 0);
      } else {
        try {
          const serverAlbum = await getAlbum(item.id);
          const serverTracks = Array.isArray(serverAlbum) ? serverAlbum : (serverAlbum?.song || []);
          if (serverTracks.length > 0) {
            const mapped: Track[] = serverTracks.map((t: any) => ({
              id: t.id,
              title: t.title || t.name,
              artist: t.artist || item.artist || 'Unknown Artist',
              album: item.name,
              albumId: item.id,
              coverArt: item.localCoverArtUri || item.coverArt || '',
              duration: t.duration || 0,
            }));
            setQueueAndPlay(mapped, 0);
            return;
          }
        } catch {
          // Ignore server fetch error when offline
        }

        // Fallback single track representation of album
        const fallbackTrack: Track = {
          id: item.id,
          title: item.name,
          artist: item.artist || 'Unknown Artist',
          album: item.name,
          albumId: item.id,
          coverArt: item.localCoverArtUri || item.coverArt || '',
          duration: item.duration || 0,
        };
        setQueueAndPlay([fallbackTrack], 0);
      }
    }
  };

  // 6. Delete Single Item
  const handleDeleteItem = async (item: DownloadItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(item.id);

    try {
      if (item.path && item.path !== 'album_completed' && item.path !== 'album_empty') {
        if (item.type === 'album') {
          await StorageManager.removeDirectory(item.path);
        } else {
          await StorageManager.removeTrack(item.path);
        }
      }

      // If album, also remove indexed child tracks from downloadStore and storage
      if (item.type === 'album') {
        const curDownloads = useDownloadStore.getState().downloads;
        for (const childId in curDownloads) {
          if (curDownloads[childId].albumId === item.id) {
            if (curDownloads[childId].path && curDownloads[childId].path !== item.path) {
              try { await StorageManager.removeTrack(curDownloads[childId].path); } catch {}
            }
            removeDownload(childId);
          }
        }
      }

      removeDownload(item.id);
      onRefreshRequested?.();
    } catch (err) {
      console.error(`Failed to delete downloaded item ${item.id}:`, err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* Header with Stats & Batch Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-background/50 p-4 rounded-xl border border-white/5">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {t('settings.downloaded_music_library')}
            </span>
          </div>
          <span className="text-xs text-secondary mt-0.5 font-mono">
            {albumCount} {t('settings.albums_count')} • {trackCount} {t('settings.tracks_count')} ({formatBytes(totalSizeBytes)})
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Download Entire Library Button */}
          <button
            type="button"
            onClick={handleDownloadEntireLibrary}
            disabled={isDownloadingLibrary || isOffline()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-all disabled:opacity-50"
            title={
              isOffline() 
                ? t('settings.cannot_download_offline') 
                : t('settings.download_entire_library_desc')
            }
          >
            {isDownloadingLibrary ? (
              <>
                <Loader2 size={14} className="animate-spin text-primary" />
                <span>
                  {libraryProgress && libraryProgress.total > 0
                    ? `${t('settings.downloading')} (${libraryProgress.current}/${libraryProgress.total})` 
                    : t('settings.syncing')}
                </span>
              </>
            ) : (
              <>
                <DownloadCloud size={15} />
                <span>{t('settings.download_entire_library')}</span>
              </>
            )}
          </button>

          {/* Manage Downloads Modal Button */}
          {onManageClick && (
            <button
              type="button"
              onClick={onManageClick}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 text-secondary hover:text-foreground border border-white/10 transition-colors"
              title={t('settings.manage_downloads')}
            >
              <Trash2 size={16} />
              <span>{t('settings.manage_downloads')}</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center bg-black/30 p-1 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/15 text-primary' : 'text-secondary hover:text-foreground'}`}
              title={t('settings.grid_view')}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/15 text-primary' : 'text-secondary hover:text-foreground'}`}
              title={t('settings.list_view')}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Library feedback banner */}
      {libraryDownloadedMsg && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl text-xs animate-in fade-in">
          <Check size={16} className="text-green-400 shrink-0" />
          <span>{libraryDownloadedMsg}</span>
        </div>
      )}

      {/* Filter Tabs and Search Bar */}
      {completedItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 bg-background/50 p-1 rounded-xl border border-white/5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'all' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_all')} ({completedItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('albums')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'albums' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_albums')} ({albumCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveFilter('tracks')}
              className={`px-3 py-1.5 rounded-lg transition-all ${activeFilter === 'tracks' ? 'bg-primary text-primary-foreground font-bold shadow-sm' : 'text-secondary hover:text-foreground hover:bg-white/5'}`}
            >
              {t('settings.filter_tracks')} ({trackCount})
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative flex-1 sm:max-w-xs">
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
      )}

      {/* Main Content: Grid or List */}
      {completedItems.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-background/30 border border-dashed border-white/10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
            <Music size={26} className="text-primary" />
          </div>
          <h4 className="text-base font-bold text-foreground mb-1">
            {t('settings.no_downloaded_music')}
          </h4>
          <p className="text-xs text-secondary max-w-sm mb-4 leading-relaxed">
            {t('settings.no_downloaded_music_desc')}
          </p>
          <button
            type="button"
            onClick={handleDownloadEntireLibrary}
            disabled={isDownloadingLibrary || isOffline()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:brightness-110 shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
          >
            <DownloadCloud size={15} />
            <span>{t('settings.download_entire_library')}</span>
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        /* Search No Results */
        <div className="flex flex-col items-center justify-center py-10 text-secondary text-xs">
          <Search size={24} className="mb-2 text-[#808080]" />
          <span>{t('settings.no_matching_downloads')}</span>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid Layout */
        <div className={`grid ${isMobile ? 'grid-cols-2 gap-2.5' : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'}`}>
          {filteredItems.map(item => (
            <DownloadedCardItem
              key={item.id}
              item={item}
              onPlay={(e) => handlePlayItem(item, e)}
              onDelete={(e) => handleDeleteItem(item, e)}
              isDeleting={deletingId === item.id}
            />
          ))}
        </div>
      ) : (
        /* List Layout */
        <div className="flex flex-col gap-2">
          {filteredItems.map(item => (
            <DownloadedRowItem
              key={item.id}
              item={item}
              onPlay={(e) => handlePlayItem(item, e)}
              onDelete={(e) => handleDeleteItem(item, e)}
              isDeleting={deletingId === item.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Subcomponent: Card Item for Grid View
function DownloadedCardItem({
  item,
  onPlay,
  onDelete,
  isDeleting,
}: {
  item: DownloadItem;
  onPlay: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();
  const { openMenu } = useContextMenuStore();
  const [coverUrl, setCoverUrl] = useState<string | undefined>(item.localCoverArtUri || item.coverArt);

  useEffect(() => {
    let active = true;
    if (item.localCoverArtUri) {
      setCoverUrl(item.localCoverArtUri);
    } else if (item.coverArt) {
      const remote = item.coverArt.startsWith('http') ? item.coverArt : getCoverArtUrl(item.coverArt, 300);
      getCachedImageUrl(remote).then(url => {
        if (active) setCoverUrl(url);
      }).catch(() => {
        if (active) setCoverUrl(remote);
      });
    }
    return () => { active = false; };
  }, [item.localCoverArtUri, item.coverArt]);

  return (
    <div 
      className="group relative bg-[#181818] hover:bg-[#222222] border border-white/5 hover:border-white/15 rounded-xl p-2.5 flex flex-col transition-all duration-200 cursor-pointer"
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(
          e.clientX,
          e.clientY,
          item.type === 'album'
            ? { id: item.id, name: item.name, title: item.name, artist: item.artist, coverArt: coverUrl || item.localCoverArtUri || item.coverArt }
            : { id: item.id, title: item.name, name: item.name, artist: item.artist, album: item.album, albumId: item.albumId, duration: item.duration, coverArt: coverUrl || item.localCoverArtUri || item.coverArt },
          item.type
        );
      }}
    >
      {/* Cover Image Container */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-black/40 mb-2">
        {coverUrl ? (
            <img 
              src={coverUrl} 
              alt={item.name} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
              loading="lazy" 
              onError={() => setCoverUrl(undefined)}
            />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-secondary">
            {item.type === 'album' ? <Disc3 size={28} /> : <Music size={28} />}
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-white uppercase tracking-wider">
          {item.type === 'album' ? t('settings.album') : t('settings.track')}
        </div>

        {/* Hover / Direct Play Button Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onPlay}
            className="w-10 h-10 rounded-full bg-primary text-black flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
            title={t('player.play')}
          >
            <Play size={18} fill="currentColor" className="ml-0.5" />
          </button>
        </div>

        {/* Delete button (top right) */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute top-1.5 right-1.5 z-10 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/80 text-white/70 hover:text-white backdrop-blur-md transition-colors disabled:opacity-50"
          title={t('common.delete')}
        >
          {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
        </button>
      </div>

      {/* Info */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold text-foreground truncate" title={item.name}>
          {item.name}
        </span>
        <span className="text-[11px] text-secondary truncate mt-0.5">
          {item.artist || item.album || (item.type === 'album' ? t('settings.album') : t('settings.track'))}
        </span>
        <div className="flex items-center justify-between text-[10px] text-secondary/70 font-mono mt-1 pt-1 border-t border-white/5">
          <span>{formatBytes(item.sizeBytes || item.totalBytes || 0)}</span>
          {item.duration ? <span>{Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}</span> : null}
        </div>
      </div>
    </div>
  );
}

// Subcomponent: Row Item for List View
function DownloadedRowItem({
  item,
  onPlay,
  onDelete,
  isDeleting,
}: {
  item: DownloadItem;
  onPlay: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();
  const { openMenu } = useContextMenuStore();
  const [coverUrl, setCoverUrl] = useState<string | undefined>(item.localCoverArtUri || item.coverArt);

  useEffect(() => {
    let active = true;
    if (item.localCoverArtUri) {
      setCoverUrl(item.localCoverArtUri);
    } else if (item.coverArt) {
      const remote = item.coverArt.startsWith('http') ? item.coverArt : getCoverArtUrl(item.coverArt, 100);
      getCachedImageUrl(remote).then(url => {
        if (active) setCoverUrl(url);
      }).catch(() => {
        if (active) setCoverUrl(remote);
      });
    }
    return () => { active = false; };
  }, [item.localCoverArtUri, item.coverArt]);

  return (
    <div 
      className="group flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#181818] hover:bg-[#222222] border border-white/5 hover:border-white/10 transition-colors cursor-pointer"
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(
          e.clientX,
          e.clientY,
          item.type === 'album'
            ? { id: item.id, name: item.name, title: item.name, artist: item.artist, coverArt: coverUrl || item.localCoverArtUri || item.coverArt }
            : { id: item.id, title: item.name, name: item.name, artist: item.artist, album: item.album, albumId: item.albumId, duration: item.duration, coverArt: coverUrl || item.localCoverArtUri || item.coverArt },
          item.type
        );
      }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Thumbnail with quick play button */}
        <div className="relative w-11 h-11 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
          {coverUrl ? (
            <img 
              src={coverUrl} 
              alt={item.name} 
              className="w-full h-full object-cover" 
              loading="lazy" 
              onError={() => setCoverUrl(undefined)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-secondary">
              {item.type === 'album' ? <Disc3 size={18} /> : <Music size={18} />}
            </div>
          )}
          <button
            type="button"
            onClick={onPlay}
            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-primary transition-opacity"
            title={t('player.play')}
          >
            <Play size={16} fill="currentColor" />
          </button>
        </div>

        {/* Text Info */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-foreground truncate" title={item.name}>
              {item.name}
            </span>
            <span className="px-1.5 py-0.2 rounded bg-white/10 text-[9px] font-bold text-secondary uppercase">
              {item.type === 'album' ? t('settings.album') : t('settings.track')}
            </span>
          </div>
          <span className="text-[11px] text-secondary truncate mt-0.5">
            {item.artist || item.album || ''}
          </span>
        </div>
      </div>

      {/* Meta & Delete Action */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="hidden sm:flex flex-col text-right font-mono text-[10px] text-secondary">
          <span>{formatBytes(item.sizeBytes || item.totalBytes || 0)}</span>
          {item.duration ? <span>{Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}</span> : null}
        </div>

        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="p-2 rounded-lg text-secondary hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          title={t('common.delete')}
        >
          {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>
    </div>
  );
}
