import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useSettingsStore } from '../store/settingsStore';
import { useIsActiveDevice } from './useIsActiveDevice';
import { getCoverArtUrl } from '../api/subsonic';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '../utils/StorageManager';

export interface DiscordActivity {
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  position?: number;
  is_playing: boolean;
  cover_url?: string;
}

export function useDiscordRpc() {
  const currentTrack = usePlayerStore((state) => state.queue[state.currentIndex]);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const enableDiscordRpc = useSettingsStore((state) => state.enableDiscordRpc);
  const isActiveDevice = useIsActiveDevice();
  const duration = useAudioStore((state) => state.duration);

  const lastKeyRef = useRef<string>('');

  // 1. Sync enableDiscordRpc toggle with backend
  useEffect(() => {
    if (!isTauri()) return;
    invoke('set_discord_rpc_enabled', { enabled: enableDiscordRpc }).catch(() => {});
  }, [enableDiscordRpc]);

  // 2. Broadcast track and playback changes to Discord
  useEffect(() => {
    if (!isTauri()) return;

    if (!enableDiscordRpc || !currentTrack || !isActiveDevice) {
      if (lastKeyRef.current !== 'cleared') {
        lastKeyRef.current = 'cleared';
        invoke('update_discord_activity', { activity: null }).catch(() => {});
      }
      return;
    }

    const audioDuration = duration || currentTrack.duration || 0;
    const progress = useAudioStore.getState().progress || 0;
    const currentPosition = (progress / 100) * audioDuration;

    let coverUrl: string | undefined = undefined;
    const coverId = currentTrack.coverArt || currentTrack.albumId || currentTrack.id;
    if (coverId) {
      const resolved = getCoverArtUrl(coverId, 512);
      if (resolved && (resolved.startsWith('http://') || resolved.startsWith('https://'))) {
        coverUrl = resolved;
      }
    }

    const key = `${currentTrack.id}_${isPlaying}_${Math.round(audioDuration)}`;
    if (lastKeyRef.current === key) {
      return;
    }
    lastKeyRef.current = key;

    const activity: DiscordActivity = {
      title: currentTrack.title || 'Unknown Title',
      artist: currentTrack.artist || 'Unknown Artist',
      album: currentTrack.album || undefined,
      duration: audioDuration > 0 ? audioDuration : undefined,
      position: currentPosition >= 0 ? currentPosition : 0,
      is_playing: isPlaying,
      cover_url: coverUrl,
    };

    invoke('update_discord_activity', { activity }).catch(() => {});
  }, [
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    isPlaying,
    enableDiscordRpc,
    isActiveDevice,
    duration,
  ]);
}
