import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';
import { useDemoStore } from '../store/demoStore';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const getHeaders = () => {
  const { user, token, salt, url } = useAuthStore.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user': encodeURIComponent(user || ''),
    'x-token': encodeURIComponent(token || ''),
    'x-salt': encodeURIComponent(salt || ''),
    'x-url': encodeURIComponent(url || '')
  };
  const demoSessionId =
    useDemoStore.getState().sessionId ||
    (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('holad_demo_session_id') : null);
  if (demoSessionId) {
    headers['x-demo-session'] = demoSessionId;
  }
  return headers;
};

function resolvePreferencesUser(): string | null {
  const { isDemoMode, guestUserId } = useDemoStore.getState();
  if (isDemoMode && guestUserId) {
    return guestUserId;
  }
  const { user, isAuthenticated } = useAuthStore.getState();
  if (isAuthenticated && user) {
    return user;
  }
  return null;
}

export interface ServerPreferences {
  theme?: string;
  accent_color?: string;
  custom_colors?: string;
  language?: string;
  profiles?: string;
  updated_at?: number;
}

export async function fetchPreferences(): Promise<ServerPreferences | null> {
  const user = resolvePreferencesUser();
  if (!user) return null;

  try {
    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/preferences/${encodeURIComponent(user)}`, {
      headers: getHeaders(),
      timeoutMs: 8000
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
  const user = resolvePreferencesUser();
  if (!user) return false;

  if (activePreferencesAbortController) {
    activePreferencesAbortController.abort();
    activePreferencesAbortController = null;
  }
  const currentController = new AbortController();
  activePreferencesAbortController = currentController;

  try {
    const res = await fetchWithTimeout(`${getHoladServerUrl()}/api/holad/preferences/${encodeURIComponent(user)}`, {
      method: 'POST',
      headers: getHeaders(),
      signal: currentController.signal,
      body: JSON.stringify(prefs),
      timeoutMs: 8000
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
