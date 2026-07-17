import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LEFT_SIDEBAR_DEFAULT_WIDTH = 96;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;

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
  
  leftSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  rightSidebarWidth: number;
  setRightSidebarWidth: (width: number) => void;
  
  pendingHistorySync: any[] | null;
  setPendingHistorySync: (sync: any[] | null) => void;
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
      
      leftSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
      rightSidebarWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
      
      pendingHistorySync: null,
      setPendingHistorySync: (sync) => set({ pendingHistorySync: sync }),
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
