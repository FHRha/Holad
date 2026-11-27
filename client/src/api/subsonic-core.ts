import { useAuthStore } from '../store/authStore';
import { getHoladServerUrl } from '../utils/serverConfig';
import { isTauri, isTauriDesktop, isTauriMobile } from '../utils/platform';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export const getBaseUrl = () => {
  const { isAuthenticated, url } = useAuthStore.getState();
  if (!isAuthenticated) {
    const proxyUrl = getHoladServerUrl();
    return `${proxyUrl}/api/subsonic`;
  }
  
  if (!isTauri() && typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
    const proxyUrl = getHoladServerUrl();
    return `${proxyUrl}/api/subsonic`;
  }
  
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

let cachedAuthStr = '';
let cachedAuthUser = '';
let cachedAuthToken = '';

export const getAuthParams = () => {
  const { user, token, salt, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated || !token || !salt) return '';
  
  if (cachedAuthStr && cachedAuthUser === user && cachedAuthToken === token) {
    return cachedAuthStr;
  }
  
  cachedAuthUser = user;
  cachedAuthToken = token;
  let clientName = 'Holad-Web';
  if (isTauriMobile()) clientName = 'Holad-Mobile';
  else if (isTauriDesktop()) clientName = 'Holad-Desktop';
  
  cachedAuthStr = `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=1.16.1&c=${clientName}&f=json`;
  return cachedAuthStr;
};

export const buildUrl = (endpoint: string, params: Record<string, string> = {}) => {
  const baseUrl = getBaseUrl();
  const auth = getAuthParams();
  const query = new URLSearchParams(params).toString();
  
  if (!useAuthStore.getState().isAuthenticated) {
    return `${baseUrl}/${endpoint}?${query}`;
  }
  
  let authWithServer = auth;
  if (baseUrl.endsWith('/api/subsonic')) {
    const { url } = useAuthStore.getState();
    if (url) {
      authWithServer += `&serverUrl=${encodeURIComponent(url.replace(/\/$/, ''))}`;
    }
  }

  const queryString = query ? `${query}&${authWithServer}` : authWithServer;
  if (baseUrl.endsWith('/api/subsonic')) {
    return `${baseUrl}/${endpoint}?${queryString}`;
  }
  return `${baseUrl}/rest/${endpoint}?${queryString}`;
};

export const fetchWithRetry = async (url: string, options?: RequestInit): Promise<Response> => {
  const delays = [600, 1200];
  const TIMEOUT_MS = 8000;

  // Fail fast if explicitly offline before waiting for a timeout
  const initiallyOffline = await import('../utils/networkStatus')
    .then(m => m.networkManager.isOffline())
    .catch(() => false);
  if (initiallyOffline) {
    throw new Error('Network offline');
  }

  for (let i = 0; i <= delays.length; i++) {
    try {
      const res = await fetchWithTimeout(url, {
        ...options,
        timeoutMs: TIMEOUT_MS,
      });

      // We got a response, so we're online
      import('../utils/networkStatus').then(m => m.networkManager.setOnline(true)).catch(() => {});

      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        (error as any).status = res.status;
        throw error;
      }
      return res;
    } catch (e: any) {
      if (e?.name === 'AbortError' && options?.signal?.aborted) {
        throw e;
      }

      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        import('../utils/networkStatus').then(m => m.networkManager.setOnline(false)).catch(() => {});
        throw new Error('Network timeout');
      }

      // On actual network failure, trigger ping check
      import('../utils/networkStatus').then(m => m.networkManager.checkConnection()).catch(() => {});

      // Do not retry 4xx errors (except 429)
      const status = e.status || (e.message?.startsWith('HTTP ') ? parseInt(e.message.slice(5), 10) : undefined);
      if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
        throw e;
      }

      if (i === delays.length) throw e;

      // If forced offline, fail fast instead of retrying forever
      const isOffline = await import('../utils/networkStatus').then(m => m.networkManager.isOffline()).catch(() => false);
      if (isOffline && !e.message?.startsWith('HTTP ')) {
        throw e;
      }

      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  throw new Error('Fetch failed');
};

