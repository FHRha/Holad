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
import { isJamPath } from '../utils/basePath';

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
      name: 'holad-storage',
      partialize: (state) => {
        // Isolate Jam environment for listeners and standalone links
        // If we are in /jam/ and not a host, DO NOT save queue/currentIndex to localStorage
        const isJamRoute = isJamPath();
        const shouldIsolateQueue = isJamRoute && state.role !== 'host';

        // Do not persist temporary demo guest nicknames to localStorage
        const isGuestNick = Boolean(state.userName && /^(?:гость|guest)\s*#?\d*$/i.test(state.userName.trim()));
        const savedUserName = isGuestNick ? undefined : state.userName;

        if (shouldIsolateQueue) {
          return {
            localPlaylists: state.localPlaylists,
            volume: state.volume,
            mobileVolume: state.mobileVolume,
            volumeMultiplier: state.volumeMultiplier,
            userName: savedUserName,
            excludedTrackIds: state.excludedTrackIds,
            excludedAlbumIds: state.excludedAlbumIds,
            excludedFingerprints: state.excludedFingerprints,
          };
        }

        return {
          localPlaylists: state.localPlaylists,
          volume: state.volume,
          mobileVolume: state.mobileVolume,
          volumeMultiplier: state.volumeMultiplier,
          queue: state.queue,
          currentIndex: state.currentIndex,
          isShuffle: state.isShuffle,
          repeatMode: state.repeatMode,
          isAutoDjEnabled: state.isAutoDjEnabled,
          userName: savedUserName,
          excludedTrackIds: state.excludedTrackIds,
          excludedAlbumIds: state.excludedAlbumIds,
          excludedFingerprints: state.excludedFingerprints,
        };
      },
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          if (persistedState.volume === 1) {
            persistedState.volume = 0.5;
          }
        }
        if (persistedState?.userName && /^(?:гость|guest)\s*#?\d*$/i.test(persistedState.userName.trim())) {
          persistedState.userName = undefined;
        }
        return persistedState;
      },
    }
  )
);

// Purge cached guest nicknames on initial store load
if (typeof window !== 'undefined') {
  const currentNick = usePlayerStore.getState().userName;
  if (currentNick && /^(?:гость|guest)\s*#?\d*$/i.test(currentNick.trim())) {
    usePlayerStore.setState({ userName: '' });
  }
}
