import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DownloadItem {
  id: string;
  name: string;
  type: 'track' | 'album';
  status: 'queued' | 'downloading' | 'completed' | 'error' | 'paused' | 'cancelled';
  progress: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  path: string;
  coverArt?: string;
  localCoverArtUri?: string;
  artist?: string;
  album?: string;
  albumId?: string;
  duration?: number;
  currentTrackName?: string;
  completedTrackCount?: number;
  totalTrackCount?: number;
  sizeBytes?: number;
  error?: string;
  timestamp: number;
  genre?: string;
  title?: string;
}

interface DownloadState {
  downloadDirectory: string | null;
  downloads: Record<string, DownloadItem>;
  setDownloadDirectory: (dir: string) => void;
  startDownload: (id: string, name: string, type: 'track' | 'album', coverArt?: string, extra?: Partial<DownloadItem>) => void;
  queueDownload: (id: string, name: string, type: 'track' | 'album', coverArt?: string, extra?: Partial<DownloadItem>) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  updateProgress: (id: string, progress: number, bytesDownloaded?: number, totalBytes?: number) => void;
  updateItem: (id: string, updates: Partial<DownloadItem>) => void;
  updateCurrentTrack: (id: string, trackName: string) => void;
  completeDownload: (id: string, path: string, extra?: Partial<DownloadItem>) => void;
  errorDownload: (id: string, error: string) => void;
  removeDownload: (id: string) => void;
  clearHistory: () => void;
  getDownloadedTracks: () => DownloadItem[];
  getDownloadedAlbums: () => DownloadItem[];
  resetStuckDownloads: () => void;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      downloadDirectory: null,
      downloads: {},
      setDownloadDirectory: (dir) => set({ downloadDirectory: dir }),
      startDownload: (id, name, type, coverArt, extra) => set((state) => ({
        downloads: {
          ...state.downloads,
          [id]: {
            id,
            name,
            type,
            coverArt,
            status: 'downloading',
            progress: 0,
            path: '',
            timestamp: Date.now(),
            ...extra
          }
        }
      })),
      queueDownload: (id, name, type, coverArt, extra) => set((state) => ({
        downloads: {
          ...state.downloads,
          [id]: {
            id,
            name,
            type,
            coverArt,
            status: 'queued',
            progress: 0,
            path: '',
            timestamp: Date.now(),
            ...extra
          }
        }
      })),
      pauseDownload: (id) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], status: 'paused' }
          }
        };
      }),
      resumeDownload: (id) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], status: 'downloading' }
          }
        };
      }),
      cancelDownload: (id) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], status: 'cancelled' }
          }
        };
      }),
      updateProgress: (id, progress, bytesDownloaded, totalBytes) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: {
              ...state.downloads[id],
              progress,
              ...(bytesDownloaded !== undefined ? { bytesDownloaded } : {}),
              ...(totalBytes !== undefined ? { totalBytes } : {})
            }
          }
        };
      }),
      updateItem: (id, updates) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], ...updates }
          }
        };
      }),
      updateCurrentTrack: (id, trackName) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], currentTrackName: trackName }
          }
        };
      }),
      completeDownload: (id, path, extra) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: {
              ...state.downloads[id],
              status: 'completed',
              progress: 100,
              path,
              ...extra
            }
          }
        };
      }),
      errorDownload: (id, error) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], status: 'error', error }
          }
        };
      }),
      removeDownload: (id) => set((state) => {
        const newDownloads = { ...state.downloads };
        delete newDownloads[id];
        return { downloads: newDownloads };
      }),
      clearHistory: () => set((state) => {
        // Only clear completed/error/cancelled/paused ones, keep downloading/queued ones
        const newDownloads = { ...state.downloads };
        for (const key in newDownloads) {
          if (newDownloads[key].status !== 'downloading' && newDownloads[key].status !== 'queued') {
            delete newDownloads[key];
          }
        }
        return { downloads: newDownloads };
      }),
      getDownloadedTracks: () => {
        return Object.values(get().downloads).filter(d => d.type === 'track' && d.status === 'completed');
      },
      getDownloadedAlbums: () => {
        return Object.values(get().downloads).filter(d => d.type === 'album' && d.status === 'completed');
      },
      resetStuckDownloads: () => set((state) => {
        const newDownloads = { ...state.downloads };
        for (const key in newDownloads) {
          if (newDownloads[key].status === 'downloading' || newDownloads[key].status === 'queued') {
            newDownloads[key].status = 'error';
            newDownloads[key].error = 'Download interrupted';
          }
        }
        return { downloads: newDownloads };
      })
    }),
    {
      name: 'download-storage',
      // We persist everything so user sees history across sessions
    }
  )
);

export const verifyDownloads = async () => {
  const store = useDownloadStore.getState();
  const downloads = store.downloads;
  let hasChanges = false;
  const newDownloads = { ...downloads };
  
  const { isTauri, isCapacitor } = await import('../utils/StorageManager');
  
  for (const id in newDownloads) {
    const item = newDownloads[id];
    if (item.status === 'completed' && item.path) {
      let fileExists = false;
      if (isTauri()) {
        try {
          const { exists } = await import('@tauri-apps/plugin-fs');
          fileExists = await exists(item.path);
        } catch (e) {
          console.warn('Tauri fs.exists failed, assuming file exists to prevent deletion:', e);
          fileExists = true;
        }
      } else if (isCapacitor()) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const stat = await Filesystem.stat({ path: item.path, directory: Directory.Data });
          fileExists = !!stat;
        } catch (e) {
          console.warn('Capacitor fs.stat failed, assuming file exists to prevent deletion:', e);
          fileExists = true;
        }
      } else {
        fileExists = true; // Browser, can't verify easily
      }
      
      if (!fileExists) {
        delete newDownloads[id];
        hasChanges = true;
      }
    }
  }
  
  if (hasChanges) {
    useDownloadStore.setState({ downloads: newDownloads });
  }
};

export const isItemDownloaded = (downloads: Record<string, DownloadItem>, trackId: string, albumId?: string) => {
  if (downloads[trackId] && downloads[trackId].status === 'completed') return true;
  if (albumId && downloads[albumId] && downloads[albumId].status === 'completed') return true;
  return false;
};

export const getDownloadedTracks = (): DownloadItem[] => {
  const downloads = useDownloadStore.getState().downloads;
  return Object.values(downloads).filter(d => d.type === 'track' && d.status === 'completed');
};

export const getDownloadedAlbums = (): DownloadItem[] => {
  const downloads = useDownloadStore.getState().downloads;
  return Object.values(downloads).filter(d => d.type === 'album' && d.status === 'completed');
};

export const getOfflineTracks = (): any[] => {
  const downloads = useDownloadStore.getState().downloads;
  let historyTracks: any[] = [];
  try {
    const raw = localStorage.getItem('streamnavi-history');
    if (raw) {
      historyTracks = JSON.parse(raw).state?.history || [];
    }
  } catch (e) {
    console.warn('Failed to parse history for offline tracks', e);
  }

  const offlineTracks: any[] = [];
  const addedIds = new Set<string>();

  // 1. History tracks that are downloaded
  historyTracks.forEach(t => {
    if (!addedIds.has(t.id) && isItemDownloaded(downloads, t.id, t.albumId)) {
      const item = downloads[t.id];
      offlineTracks.push({
        ...t,
        title: t.title || t.name || item?.name || 'Unknown Title',
        name: t.name || t.title || item?.name || 'Unknown Title',
        genre: t.genre || (item as any)?.genre || '',
        artist: t.artist || item?.artist || 'Unknown Artist',
        album: t.album || item?.album || 'Unknown Album',
        albumId: t.albumId || item?.albumId || '',
        coverArt: item?.localCoverArtUri || item?.coverArt || t.coverArt || '',
        localCoverArtUri: item?.localCoverArtUri,
        path: item?.path || t.path,
        duration: t.duration || item?.duration || 0,
        sizeBytes: t.sizeBytes || item?.sizeBytes || item?.totalBytes || 0,
      });
      addedIds.add(t.id);
    }
  });

  // 2. All completed tracks in downloads store (direct or indexed child tracks)
  Object.values(downloads).forEach(d => {
    if (d.type === 'track' && d.status === 'completed' && !addedIds.has(d.id)) {
      offlineTracks.push({
        id: d.id,
        title: d.name || (d as any).title || 'Unknown Title',
        name: d.name || (d as any).title || 'Unknown Title',
        genre: (d as any).genre || '',
        artist: d.artist || 'Unknown Artist',
        album: d.album || 'Unknown Album',
        albumId: d.albumId || '',
        artistId: '',
        coverArt: d.localCoverArtUri || d.coverArt || '',
        localCoverArtUri: d.localCoverArtUri,
        duration: d.duration || 0,
        path: d.path,
        sizeBytes: d.sizeBytes || d.totalBytes || 0,
      });
      addedIds.add(d.id);
    }
  });

  return offlineTracks;
};

export interface DownloadQueueStats {
  isDownloading: boolean;
  activeDownloadsCount: number;
  queuedCount: number;
  totalActiveCount: number;
  completedCount: number;
  overallProgress: number;
}

export const getDownloadQueueStats = (downloads: Record<string, DownloadItem>): DownloadQueueStats => {
  const items = Object.values(downloads || {});
  const activeItems = items.filter(d => d.status === 'downloading');
  const pausedItems = items.filter(d => d.status === 'paused');
  const queuedItems = items.filter(d => d.status === 'queued');
  const completedCount = items.filter(d => d.status === 'completed').length;
  const isDownloading = activeItems.length > 0 || pausedItems.length > 0;
  const activeDownloadsCount = activeItems.length + pausedItems.length;
  const queuedCount = queuedItems.length;
  const totalActiveCount = activeDownloadsCount + queuedCount;
  
  let overallProgress = 0;
  if (activeDownloadsCount > 0) {
    const totalProgress = [...activeItems, ...pausedItems].reduce((acc, item) => acc + (item.progress || 0), 0);
    overallProgress = Math.round(totalProgress / activeDownloadsCount);
  }

  return {
    isDownloading,
    activeDownloadsCount,
    queuedCount,
    totalActiveCount,
    completedCount,
    overallProgress,
  };
};

export const useDownloadQueue = (): DownloadQueueStats => {
  const downloads = useDownloadStore(state => state.downloads);
  return getDownloadQueueStats(downloads);
};
