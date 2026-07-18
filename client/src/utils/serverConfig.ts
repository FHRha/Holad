import { isTauri, isCapacitor } from './StorageManager';

export const getHoladServerUrl = (): string => {
  if (isTauri() || isCapacitor()) {
    const customUrl = localStorage.getItem('holadServerUrl');
    if (customUrl) {
      const cleanUrl = customUrl.replace(/\/$/, '');
      if (!cleanUrl.endsWith('/Holad')) {
        return `${cleanUrl}/Holad`;
      }
      return cleanUrl;
    }
  }
  
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  
  const path = window.location.pathname;
  if (path.toLowerCase().includes('/holad')) {
      return path.substring(0, path.toLowerCase().indexOf('/holad') + 6);
  }
  
  return import.meta.env.BASE_URL.replace(/\/$/, '') || '.';
};

export const getSocketUrl = (): string => {
  if (isTauri() || isCapacitor()) {
    const customUrl = localStorage.getItem('holadServerUrl');
    if (customUrl) return customUrl.replace(/\/$/, '');
  }
  return import.meta.env.VITE_SERVER_URL || window.location.origin;
};

export const getShareUrl = (): string => {
  if (isTauri() || isCapacitor()) {
    const customUrl = localStorage.getItem('holadServerUrl');
    if (customUrl) {
      return customUrl.replace(/\/$/, '');
    }
  }
  return window.location.origin;
};
