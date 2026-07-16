import { create } from 'zustand';

export type ContextMenuType = 'track' | 'album';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  item: any; // The track or album object
  type: ContextMenuType;
  openMenu: (x: number, y: number, item: any, type: ContextMenuType) => void;
  closeMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  item: null,
  type: 'track',
  openMenu: (x, y, item, type) => {
    set({ isOpen: true, x, y, item, type });
  },
  closeMenu: () => set({ isOpen: false, item: null }),
}));
