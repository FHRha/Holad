import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LEFT_SIDEBAR_DEFAULT_WIDTH = 96;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;

export interface UpdateProgress {
  stage: 'downloading' | 'installing' | 'permission_required' | 'error';
  percent: number;
  downloaded: number;
  total: number;
  error?: string;
  filePath?: string;
}

export interface UpdateInfo {
  version?: string;
  notes?: string;
  downloadUrl?: string;
  fileName?: string;
  size?: number;
  progress?: UpdateProgress | null;
  isPrerelease?: boolean;
}

interface UIState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isSearchOpen: boolean;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  
  activeFilter: string | null;
  setActiveFilter: (filter: string | null) => void;
  
  searchResults: { song: any[], album: any[], artist: any[] };
  setSearchResults: (results: { song: any[], album: any[], artist: any[] }) => void;
  isSearchLoading: boolean;
  setSearchLoading: (loading: boolean) => void;
  
  isNowPlayingOpen: boolean;
  toggleNowPlaying: () => void;
  setNowPlayingOpen: (open: boolean) => void;
  isSettingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  isOfflineModalOpen: boolean;
  setOfflineModalOpen: (open: boolean) => void;
  
  leftSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  rightSidebarWidth: number;
  setRightSidebarWidth: (width: number) => void;
  
  isPlaylistModalOpen: boolean;
  setPlaylistModalOpen: (open: boolean) => void;
  playlistTargetItem: any | null;
  setPlaylistTargetItem: (item: any | null) => void;
  
  isUpdateModalOpen: boolean;
  setUpdateModalOpen: (open: boolean) => void;
  updateInfo: UpdateInfo | null;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setUpdateProgress: (progress: UpdateProgress | null) => void;
  
  isJamModalOpen: boolean;
  setIsJamModalOpen: (open: boolean) => void;
  
  unignoreModal: {
    isOpen: boolean;
    track: any | null;
    onConfirm?: () => void;
  };
  openUnignoreModal: (track: any, onConfirm: () => void) => void;
  closeUnignoreModal: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      isSearchOpen: false,
      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      
      activeFilter: null,
      setActiveFilter: (filter) => set({ activeFilter: filter }),
      
      searchResults: { song: [], album: [], artist: [] },
      setSearchResults: (results) => set({ searchResults: results }),
      isSearchLoading: false,
      setSearchLoading: (loading) => set({ isSearchLoading: loading }),
      
      isNowPlayingOpen: false,
      toggleNowPlaying: () => set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen })),
      setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
      isSettingsOpen: false,
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      isOfflineModalOpen: false,
      setOfflineModalOpen: (open) => set({ isOfflineModalOpen: open }),
      
      leftSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
      rightSidebarWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
      
      isPlaylistModalOpen: false,
      setPlaylistModalOpen: (open) => set({ isPlaylistModalOpen: open }),
      playlistTargetItem: null,
      setPlaylistTargetItem: (item) => set({ playlistTargetItem: item }),
      
      isUpdateModalOpen: false,
      setUpdateModalOpen: (open) => set({ isUpdateModalOpen: open }),
      updateInfo: null,
      setUpdateInfo: (info) => set({ updateInfo: info }),
      setUpdateProgress: (progress) => set((state) => ({
        updateInfo: state.updateInfo ? { ...state.updateInfo, progress } : null
      })),
      
      isJamModalOpen: false,
      setIsJamModalOpen: (open) => set({ isJamModalOpen: open }),
      
      unignoreModal: {
        isOpen: false,
        track: null,
      },
      openUnignoreModal: (track, onConfirm) => set({
        unignoreModal: { isOpen: true, track, onConfirm }
      }),
      closeUnignoreModal: () => set({
        unignoreModal: { isOpen: false, track: null }
      }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ 
        leftSidebarWidth: state.leftSidebarWidth, 
        rightSidebarWidth: state.rightSidebarWidth 
      }),
    }
  )
);
