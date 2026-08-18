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
    const validX = typeof x === 'number' && !isNaN(x) ? x : (typeof window !== 'undefined' ? window.innerWidth / 2 : 0);
    const validY = typeof y === 'number' && !isNaN(y) ? y : (typeof window !== 'undefined' ? window.innerHeight / 2 : 0);
    set({ isOpen: true, x: validX, y: validY, item, type });
  },
  closeMenu: () => set({ isOpen: false, item: null }),
}));
