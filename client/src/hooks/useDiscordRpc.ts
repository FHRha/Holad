import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAudioStore } from '../store/audioStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useIsActiveDevice } from './useIsActiveDevice';
import { getAuthParams } from '../api/subsonic-core';
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

export function isPublicWebUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  const lower = url.toLowerCase();
  return !(
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('::1') ||
    lower.includes('192.168.') ||
    lower.includes('10.') ||
    lower.includes('.local') ||
    lower.includes('.lan')
  );
}

const publicCoverCache = new Map<string, string>();

export async function resolveDiscordCover(track: {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
}): Promise<string | undefined> {
  const cacheKey = `${track.artist} - ${track.album || track.title}`.trim().toLowerCase();
  if (publicCoverCache.has(cacheKey)) {
    return publicCoverCache.get(cacheKey);
  }

  // 1. Direct public track coverArt
  if (isPublicWebUrl(track.coverArt)) {
    publicCoverCache.set(cacheKey, track.coverArt!);
    return track.coverArt;
  }

  // 2. Direct public Navidrome server
  const { url, user, token, salt, isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated && url && isPublicWebUrl(url) && user && token && salt) {
    const auth = getAuthParams();
    const coverId = track.coverArt || track.id;
    const directUrl = `${url.replace(/\/$/, '')}/rest/getCoverArt?id=${encodeURIComponent(coverId)}&size=512&${auth}`;
    publicCoverCache.set(cacheKey, directUrl);
    return directUrl;
  }

  // 3. Fallback: Search iTunes for high-res (600x600) cover on Apple global CDN
  const query = `${track.artist} ${track.album || track.title}`.trim();
  if (!query) return undefined;

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const data = await res.json();
      const rawArt = data.results?.[0]?.artworkUrl100;
      if (rawArt && typeof rawArt === 'string') {
        const highRes = rawArt.replace(/100x100bb\.(jpg|png)/i, '600x600bb.$1');
        publicCoverCache.set(cacheKey, highRes);
        return highRes;
      }
    }
  } catch {
    // Network timeout or offline
  }

  // 4. Fallback: Search Deezer CDN for cover
  try {
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const data = await res.json();
      const rawArt = data.data?.[0]?.album?.cover_big || data.data?.[0]?.album?.cover_medium;
      if (rawArt && typeof rawArt === 'string') {
        publicCoverCache.set(cacheKey, rawArt);
        return rawArt;
      }
    }
  } catch {
    // Ignore
  }

  return undefined;
}

export function useDiscordRpc() {
  const currentTrack = usePlayerStore((state) => state.queue[state.currentIndex]);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const enableDiscordRpc = useSettingsStore((state) => state.enableDiscordRpc);
  const discordClientId = useSettingsStore((state) => state.discordClientId);
  const isActiveDevice = useIsActiveDevice();
  const duration = useAudioStore((state) => state.duration);
  const isSeeking = useAudioStore((state) => state.isSeeking);

  const lastKeyRef = useRef<string>('');

  // 1. Sync enableDiscordRpc toggle with backend
  useEffect(() => {
    if (!isTauri()) return;
    invoke('set_discord_rpc_enabled', { enabled: enableDiscordRpc }).catch(() => {});
  }, [enableDiscordRpc]);

  // 2. Sync discordClientId with backend
  useEffect(() => {
    if (!isTauri()) return;
    invoke('set_discord_client_id', { clientId: discordClientId?.trim() || '' }).catch(() => {});
  }, [discordClientId]);

  // 3. Broadcast track and playback changes to Discord
  useEffect(() => {
    if (!isTauri()) return;

    if (!enableDiscordRpc || !currentTrack || !isActiveDevice || !isPlaying || isSeeking) {
      if (lastKeyRef.current !== 'cleared') {
        lastKeyRef.current = 'cleared';
        invoke('update_discord_activity', { activity: null }).catch(() => {});
      }
      return;
    }

    const audioDuration = duration || currentTrack.duration || 0;
    const progress = useAudioStore.getState().progress || 0;
    const currentPosition = (progress / 100) * audioDuration;

    const cacheKey = `${currentTrack.artist} - ${currentTrack.album || currentTrack.title}`.trim().toLowerCase();
    const initialCover = publicCoverCache.get(cacheKey) || (isPublicWebUrl(currentTrack.coverArt) ? currentTrack.coverArt : undefined);

    const key = `${currentTrack.id}_${isPlaying}_${Math.round(audioDuration)}_${Math.round(currentPosition)}_${initialCover || 'none'}`;
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
      cover_url: initialCover,
    };

    invoke('update_discord_activity', { activity }).catch(() => {});

    // If initial cover is missing, resolve asynchronously in the background
    if (!initialCover) {
      const activeTrackId = currentTrack.id;
      resolveDiscordCover(currentTrack).then((resolvedUrl) => {
        if (!resolvedUrl) return;
        const nowCurrent = usePlayerStore.getState().queue[usePlayerStore.getState().currentIndex];
        const nowPlaying = usePlayerStore.getState().isPlaying;
        if (nowCurrent?.id === activeTrackId && nowPlaying) {
          const nowDuration = useAudioStore.getState().duration || nowCurrent.duration || 0;
          const nowProgress = useAudioStore.getState().progress || 0;
          const nowPos = (nowProgress / 100) * nowDuration;

          const updatedActivity: DiscordActivity = {
            title: nowCurrent.title || 'Unknown Title',
            artist: nowCurrent.artist || 'Unknown Artist',
            album: nowCurrent.album || undefined,
            duration: nowDuration > 0 ? nowDuration : undefined,
            position: nowPos >= 0 ? nowPos : 0,
            is_playing: true,
            cover_url: resolvedUrl,
          };

          lastKeyRef.current = `${activeTrackId}_true_${Math.round(nowDuration)}_${Math.round(nowPos)}_${resolvedUrl}`;
          invoke('update_discord_activity', { activity: updatedActivity }).catch(() => {});
        }
      }).catch(() => {});
    }
  }, [
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.coverArt,
    isPlaying,
    isSeeking,
    enableDiscordRpc,
    isActiveDevice,
    duration,
  ]);
}
