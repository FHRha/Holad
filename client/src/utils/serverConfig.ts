
import { getBasePath } from './basePath';

export const getHoladServerUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }

  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL.replace(/\/$/, '');
  }
  
  return getBasePath();
};

export const getSocketUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) return customUrl.replace(/\/$/, '');
  return import.meta.env.VITE_SERVER_URL || window.location.origin;
};

export const getSocketPath = (): string => {
  const base = getBasePath();
  return base ? `${base}/socket.io` : '/socket.io';
};

export const getShareUrl = (): string => {
  const customUrl = localStorage.getItem('holadServerUrl');
  if (customUrl) {
    return customUrl.replace(/\/$/, '');
  }
  return window.location.origin;
};
