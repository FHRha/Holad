import { create } from 'zustand';

interface AudioStore {
  audioElement: HTMLAudioElement | null;
  setAudioElement: (el: HTMLAudioElement | null) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  audioElement: null,
  setAudioElement: (el) => set({ audioElement: el }),
}));
