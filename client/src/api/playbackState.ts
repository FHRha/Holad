import { getApiUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';
import { useDemoStore } from '../store/demoStore';

export interface CompactTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumId?: string;
  artistId?: string;
  duration?: number;
  coverArt?: string;
  bitRate?: number;
  suffix?: string;
  [key: string]: any;
}

export interface PlaybackStateResponse {
  song_id: string | null;
  current_song_id: string | null;
  position: number;
  volume: number;
  is_playing: boolean;
  queue: CompactTrack[];
  queue_version: string;
  current_index: number;
  is_shuffled: boolean;
  repeat_mode: string;
  updated_at: number;
}

export interface PlaybackStateInput {
  queue?: CompactTrack[];
  queueVersion?: string;
  queue_version?: string;
  currentIndex?: number;
  current_index?: number;
  songId?: string | null;
  song_id?: string | null;
  position?: number;
  isPlaying?: boolean;
  is_playing?: boolean;
  isShuffled?: boolean;
  is_shuffled?: boolean;
  repeatMode?: string;
  repeat_mode?: string;
  volume?: number;
  updatedAt?: number;
  updated_at?: number;
}

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
  const demoSessionId = useDemoStore.getState().sessionId;
  if (demoSessionId) {
    headers['x-demo-session'] = demoSessionId;
  }
  return headers;
};

export const fetchPlaybackState = async (): Promise<PlaybackStateResponse | null> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  const { isDemoMode, guestUserId } = useDemoStore.getState();
  if ((!isAuthenticated || !user) && (!isDemoMode || !guestUserId)) {
    return null;
  }

  try {
    const res = await fetch(getApiUrl('/api/playback-state'), {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data) return null;
    return {
      song_id: data.song_id ?? data.current_song_id ?? null,
      current_song_id: data.current_song_id ?? data.song_id ?? null,
      position: typeof data.position === 'number' ? data.position : 0,
      volume: typeof data.volume === 'number' ? data.volume : 1,
      is_playing: Boolean(data.is_playing),
      queue: Array.isArray(data.queue) ? data.queue : [],
      queue_version: data.queue_version || '',
      current_index: typeof data.current_index === 'number' ? data.current_index : 0,
      is_shuffled: Boolean(data.is_shuffled),
      repeat_mode: data.repeat_mode || 'off',
      updated_at: typeof data.updated_at === 'number' ? data.updated_at : 0
    };
  } catch (error) {
    console.error('Failed to fetch playback state:', error);
    return null;
  }
};

export const savePlaybackState = async (
  state: Partial<PlaybackStateInput>,
  useKeepalive = false
): Promise<boolean> => {
  const { user, isAuthenticated } = useAuthStore.getState();
  const { isDemoMode, guestUserId } = useDemoStore.getState();
  if ((!isAuthenticated || !user) && (!isDemoMode || !guestUserId)) {
    return false;
  }

  const url = getApiUrl('/api/playback-state');
  const headers = getHeaders();
  const body = JSON.stringify(state);

  if (useKeepalive) {
    try {
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers,
        body
      }).catch(() => {});
      return true;
    } catch {
      // Fallback
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body
    });
    return res.ok;
  } catch (error) {
    console.error('Failed to save playback state:', error);
    return false;
  }
};
