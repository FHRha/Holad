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

export interface ServerPreferences {
  theme?: string;
  accent_color?: string;
  custom_colors?: string;
  language?: string;
  profiles?: string;
  updated_at?: number;
}

export async function fetchPreferences(): Promise<ServerPreferences | null> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return null;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/preferences/${encodeURIComponent(user)}`, {
      headers: getHeaders()
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('[Preferences] Fetch error:', err);
    return null;
  }
}

let activePreferencesAbortController: AbortController | null = null;

export async function pushPreferences(prefs: Partial<ServerPreferences>): Promise<boolean> {
  const { user, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !user) return false;

  if (activePreferencesAbortController) {
    activePreferencesAbortController.abort();
    activePreferencesAbortController = null;
  }
  const currentController = new AbortController();
  activePreferencesAbortController = currentController;

  try {
    const res = await fetch(`${getHoladServerUrl()}/api/holad/preferences/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      signal: currentController.signal,
      body: JSON.stringify(prefs)
    });
    return res.ok;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return false;
    }
    console.error('[Preferences] Push error:', err);
    return false;
  } finally {
    if (activePreferencesAbortController === currentController) {
      activePreferencesAbortController = null;
    }
  }
}
