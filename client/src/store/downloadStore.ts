import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DownloadItem {
  id: string;
  name: string;
  type: 'track' | 'album';
  status: 'downloading' | 'completed' | 'error';
  progress: number;
  path: string;
  coverArt?: string;
  currentTrackName?: string;
  error?: string;
  timestamp: number;
}

interface DownloadState {
  downloadDirectory: string | null;
  downloads: Record<string, DownloadItem>;
  setDownloadDirectory: (dir: string) => void;
  startDownload: (id: string, name: string, type: 'track' | 'album', coverArt?: string) => void;
  updateProgress: (id: string, progress: number) => void;
  updateCurrentTrack: (id: string, trackName: string) => void;
  completeDownload: (id: string, path: string) => void;
  errorDownload: (id: string, error: string) => void;
  removeDownload: (id: string) => void;
  clearHistory: () => void;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set) => ({
      downloadDirectory: null,
      downloads: {},
      setDownloadDirectory: (dir) => set({ downloadDirectory: dir }),
      startDownload: (id, name, type, coverArt) => set((state) => ({
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
            timestamp: Date.now()
          }
        }
      })),
      updateProgress: (id, progress) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], progress }
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
      completeDownload: (id, path) => set((state) => {
        if (!state.downloads[id]) return state;
        return {
          downloads: {
            ...state.downloads,
            [id]: { ...state.downloads[id], status: 'completed', progress: 100, path }
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
        // Only clear completed/error ones, keep downloading ones
        const newDownloads = { ...state.downloads };
        for (const key in newDownloads) {
          if (newDownloads[key].status !== 'downloading') {
            delete newDownloads[key];
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

export const isItemDownloaded = (downloads: Record<string, DownloadItem>, trackId: string, albumId?: string) => {
  if (downloads[trackId] && downloads[trackId].status === 'completed') return true;
  if (albumId && downloads[albumId] && downloads[albumId].status === 'completed') return true;
  return false;
};
