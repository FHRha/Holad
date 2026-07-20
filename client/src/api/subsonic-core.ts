import { useAuthStore } from '../store/authStore';
import { getHoladServerUrl } from '../utils/serverConfig';
import { isTauri, isCapacitor } from '../utils/StorageManager';

export const getBaseUrl = () => {
  const { isAuthenticated, url } = useAuthStore.getState();
  if (!isAuthenticated) {
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
  if (isTauri()) clientName = 'Holad-Desktop';
  else if (isCapacitor()) clientName = 'Holad-Mobile';
  
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
  
  const queryString = query ? `${query}&${auth}` : auth;
  return `${baseUrl}/rest/${endpoint}?${queryString}`;
};

export const fetchWithRetry = async (url: string, options?: RequestInit): Promise<Response> => {
  const delays = [1000, 1000, 1000, 5000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i === delays.length) throw e;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
  throw new Error("Fetch failed");
};

