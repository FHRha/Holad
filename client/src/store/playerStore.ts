import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createPlaybackSlice } from './slices/playbackSlice';
import type { PlaybackSlice } from './slices/playbackSlice';
import { createQueueSlice } from './slices/queueSlice';
import type { QueueSlice } from './slices/queueSlice';
import { createJamSlice } from './slices/jamSlice';
import type { JamSlice } from './slices/jamSlice';
import { createSocialSlice } from './slices/socialSlice';
import type { SocialSlice } from './slices/socialSlice';
import { createPlaylistSlice } from './slices/playlistSlice';
import type { PlaylistSlice } from './slices/playlistSlice';
import type { Track } from '../types';

export type PlayerState = PlaybackSlice & QueueSlice & JamSlice & SocialSlice & PlaylistSlice;

export type { Track }; // Re-export for backwards compatibility

export const usePlayerStore = create<PlayerState>()(
  persist(
    (...a) => ({
      ...createPlaybackSlice(...a),
      ...createQueueSlice(...a),
      ...createJamSlice(...a),
      ...createSocialSlice(...a),
      ...createPlaylistSlice(...a),
    }),
    {
      name: 'streamnavi-storage',
      partialize: (state) => ({
        localPlaylists: state.localPlaylists,
        volume: state.volume,
        queue: state.queue,
        currentIndex: state.currentIndex,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        isAutoDjEnabled: state.isAutoDjEnabled,
        userName: state.userName,
      }),
    }
  )
);
