import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LEFT_SIDEBAR_DEFAULT_WIDTH = 96;
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 320;

interface UIState {
  isSearchOpen: boolean;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  isNowPlayingOpen: boolean;
  toggleNowPlaying: () => void;
  setNowPlayingOpen: (open: boolean) => void;
  
  leftSidebarWidth: number;
  setLeftSidebarWidth: (width: number) => void;
  rightSidebarWidth: number;
  setRightSidebarWidth: (width: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSearchOpen: false,
      toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
      setSearchOpen: (open) => set({ isSearchOpen: open }),
      isNowPlayingOpen: false,
      toggleNowPlaying: () => set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen })),
      setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
      
      leftSidebarWidth: LEFT_SIDEBAR_DEFAULT_WIDTH,
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
      rightSidebarWidth: RIGHT_SIDEBAR_DEFAULT_WIDTH,
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
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
