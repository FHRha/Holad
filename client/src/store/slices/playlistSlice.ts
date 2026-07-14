import type { StateCreator } from 'zustand';
import type { PlayerState } from '../playerStore';
import type { Playlist, Track } from '../../types';

export interface PlaylistSlice {
  localPlaylists: Playlist[];

  createPlaylist: (name: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
}

export const createPlaylistSlice: StateCreator<
  PlayerState,
  [],
  [],
  PlaylistSlice
> = (set) => ({
  localPlaylists: [],

  createPlaylist: (name) => set((state) => ({
    localPlaylists: [...state.localPlaylists, { id: Date.now().toString(), name, tracks: [] }]
  })),
  
  addTrackToPlaylist: (playlistId, track) => set((state) => ({
    localPlaylists: state.localPlaylists.map(pl => 
      pl.id === playlistId ? { ...pl, tracks: [...pl.tracks, track] } : pl
    )
  })),
});
