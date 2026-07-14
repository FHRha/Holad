import md5 from 'md5';
import { useAuthStore } from '../store/authStore';

export const getBaseUrl = () => {
  const { isAuthenticated, url } = useAuthStore.getState();
  if (!isAuthenticated) {
    const proxyUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
    return `${proxyUrl}/api/subsonic`;
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

let cachedAuthStr = '';
let cachedAuthUser = '';
let cachedAuthPass = '';

export const getAuthParams = () => {
  const { user, pass, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return '';
  
  if (cachedAuthStr && cachedAuthUser === user && cachedAuthPass === pass) {
    return cachedAuthStr;
  }
  
  const salt = Math.random().toString(36).substring(2, 15);
  const token = md5(pass + salt);
  cachedAuthUser = user;
  cachedAuthPass = pass;
  cachedAuthStr = `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
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

export const fetchWithRetry = async (url: string, options?: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("Fetch failed");
};

