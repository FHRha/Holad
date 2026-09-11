import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  return {
    'Content-Type': 'application/json',
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
};

export interface ServerPlaybackState {
  song_id?: string | null;
  position?: number;
  volume?: number;
  updated_at?: number;
}

export async function fetchPlaybackState(): Promise<ServerPlaybackState | null> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return null;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/playback/${encodeURIComponent(user)}`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[Playback] Fetch error:', err);
    return null;
  }
}

export function savePlaybackState(state: ServerPlaybackState, useKeepalive = false): void {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return;

  const url = `${getHoladServerUrl()}/api/holad/playback/${encodeURIComponent(user)}`;
  const body = JSON.stringify(state);

  if (useKeepalive) {
    try {
      fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body,
        keepalive: true
      }).catch(() => {});
      return;
    } catch {
      // Fallback
    }
  }

  fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body
  }).catch(err => console.warn('[Playback] Save error:', err));
}
