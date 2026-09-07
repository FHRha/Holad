import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { starItem, unstarItem } from '../api/subsonic';

export function useTrayIntegration() {
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;

    const setupTrayListeners = async () => {
      try {
        const { listen, emit } = await import('@tauri-apps/api/event');

        const broadcastState = () => {
          const state = usePlayerStore.getState();
          const currentTrack = state.queue[state.currentIndex];
          emit('tray-state-sync', {
            track: currentTrack || null,
            playing: state.isPlaying,
            liked: currentTrack ? state.likedTrackIds.includes(currentTrack.id) : false
          }).catch(console.error);
        };

        const unlistenReq = await listen('request-tray-sync', () => {
          broadcastState();
        });

        // Listen for tray controls from TrayMenu window
        const unlistenCtrl = await listen<string>('tray-control', async (event) => {
          const action = event.payload;
          const state = usePlayerStore.getState();

          // show_app is handled via direct invoke from TrayMenu to rust backend

          switch (action) {
            case 'play_pause':
              state.setIsPlaying(!state.isPlaying);
              break;
            case 'next':
              state.nextTrack();
              break;
            case 'prev':
              state.prevTrack();
              break;
            case 'favorite': {
              const currentTrack = state.queue[state.currentIndex];
              if (currentTrack) {
                const isLiked = state.likedTrackIds.includes(currentTrack.id);
                state.toggleTrackLike(currentTrack.id);
                if (isLiked) {
                  unstarItem(currentTrack.id).catch(console.error);
                } else {
                  starItem(currentTrack.id).catch(console.error);
                }
              }
              break;
            }
            case 'ignore': {
              const currentTrack = state.queue[state.currentIndex];
              if (currentTrack) {
                // Here we would call the ban API or ignore logic
                state.nextTrack();
              }
              break;
            }
          }
        });

        // Sync state to tray
        const unsubStore = usePlayerStore.subscribe((state, prevState) => {
          const currentTrack = state.queue[state.currentIndex];
          const prevTrack = prevState.queue[prevState.currentIndex];

          if (currentTrack !== prevTrack || state.isPlaying !== prevState.isPlaying) {
             broadcastState();
             return;
          }

          if (currentTrack) {
            const isLiked = state.likedTrackIds.includes(currentTrack.id);
            const prevLiked = prevState.likedTrackIds.includes(currentTrack.id);
            if (isLiked !== prevLiked) {
              broadcastState();
            }
          }
        });

        // Initial sync
        broadcastState();

        return () => {
          unlistenReq();
          unlistenCtrl();
          unsubStore();
        };
      } catch (err) {
        console.error('Failed to setup tray integration:', err);
      }
    };

    let cleanup: (() => void) | undefined;
    setupTrayListeners().then(fn => { cleanup = fn; });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);
}
