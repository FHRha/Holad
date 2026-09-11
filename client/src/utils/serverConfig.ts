
import { getBasePath } from './basePath';

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
