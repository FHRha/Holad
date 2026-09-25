import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useHoladStore } from '../store/holadStore';
import { useWindowVisibility } from './useWindowVisibility';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from '../utils/StorageManager';

export function useTaskbarControls() {
  const { isPlaying, nextTrack, prevTrack } = usePlayerStore();
  const isHoladConnected = useHoladStore(s => s.roomId !== null);
  const activeDeviceId = useHoladStore(s => s.activeDeviceId);
  const localDeviceId = useHoladStore(s => s.deviceId);
  const isActiveDevice = !isHoladConnected || (activeDeviceId !== null && activeDeviceId === localDeviceId);
  const isWindowVisible = useWindowVisibility();

  // Listen to native Windows Thumbar events
  useEffect(() => {
    // Only runs in Tauri
    if (!isTauri()) return;

    const unlisten = listen<string>('taskbar-action', (event) => {
      const action = event.payload;
      if (action === 'previoustrack') {
        prevTrack();
      } else if (action === 'nexttrack') {
        nextTrack();
      } else if (action === 'playpause') {
        // Toggle play state directly via store getter to avoid closure staleness
        const currentState = usePlayerStore.getState().isPlaying;
        usePlayerStore.getState().setIsPlaying(!currentState);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [nextTrack, prevTrack]); // no isPlaying dependency needed due to getState()

  // Update native taskbar when isPlaying changes
  useEffect(() => {
    if (!isTauri()) return;

    const shouldShowPlaying = isPlaying && (isActiveDevice || isWindowVisible);

    invoke('update_taskbar_state', { isPlaying: shouldShowPlaying })
      .catch((err) => console.warn('Failed to update taskbar state:', err));

    if (isActiveDevice) {
      invoke('sync_audio_session')
        .catch(() => {});
    }
  }, [isPlaying, isActiveDevice, isWindowVisible]);
}
