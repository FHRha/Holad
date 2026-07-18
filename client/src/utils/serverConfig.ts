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
  return import.meta.env.VITE_SERVER_URL || import.meta.env.BASE_URL.replace(/\/$/, '');
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
