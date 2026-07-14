import { create } from 'zustand';

interface UIState {
  isSearchOpen: boolean;
  toggleSearch: () => void;
  setSearchOpen: (open: boolean) => void;
  isNowPlayingOpen: boolean;
  toggleNowPlaying: () => void;
  setNowPlayingOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSearchOpen: false,
  toggleSearch: () => set((state) => ({ isSearchOpen: !state.isSearchOpen })),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
  isNowPlayingOpen: false,
  toggleNowPlaying: () => set((state) => ({ isNowPlayingOpen: !state.isNowPlayingOpen })),
  setNowPlayingOpen: (open) => set({ isNowPlayingOpen: open }),
}));
