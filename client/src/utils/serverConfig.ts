import { getBasePath } from './basePath';
import { isTauri, isCapacitor } from './StorageManager';
import { useAuthStore } from '../store/authStore';

export const getHoladServerUrl = (): string => {
  const customUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('holadServerUrl') : null;
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }

  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL.replace(/\/$/, '');
  }
  
  return getBasePath();
};

export const getApiUrl = (endpoint: string = ''): string => {
  const base = getHoladServerUrl();
  const cleanEndpoint = endpoint ? (endpoint.startsWith('/') ? endpoint : `/${endpoint}`) : '';
  return `${base}${cleanEndpoint}`;
};

export const getSocketUrl = (): string => {
  const customUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('holadServerUrl') : null;
  if (customUrl) {
    try {
      const parsed = new URL(customUrl);
      return parsed.origin;
    } catch {
      return customUrl.replace(/\/$/, '');
    }
  }

  if (isTauri() || isCapacitor()) {
    try {
      const authUrl = useAuthStore.getState().url;
      if (authUrl) {
        const fullUrl = authUrl.includes('://') ? authUrl : `http://${authUrl}`;
        return new URL(fullUrl).origin;
      }
    } catch {
      // fallback
    }
  }

  return import.meta.env.VITE_SERVER_URL || (typeof window !== 'undefined' ? window.location.origin : '');
};

export const getSocketPath = (): string => {
  const customUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('holadServerUrl') : null;
  if (customUrl) {
    try {
      const parsed = new URL(customUrl);
      const pathname = parsed.pathname.replace(/\/$/, '');
      if (pathname) {
        return `${pathname}/socket.io`;
      }
    } catch {}
  }

  if (isTauri() || isCapacitor()) {
    try {
      const authUrl = useAuthStore.getState().url;
      if (authUrl) {
        const fullUrl = authUrl.includes('://') ? authUrl : `http://${authUrl}`;
        const parsed = new URL(fullUrl);
        const pathname = parsed.pathname.replace(/\/$/, '');
        if (pathname) {
          return `${pathname}/socket.io`;
        }
      }
    } catch {}
  }

  const base = getBasePath();
  return base ? `${base}/socket.io` : '/socket.io';
};

export const getShareUrl = (): string => {
  const customUrl = typeof localStorage !== 'undefined' ? localStorage.getItem('holadServerUrl') : null;
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }
  const base = getBasePath();
  return typeof window !== 'undefined' ? `${window.location.origin}${base}` : base;
};
