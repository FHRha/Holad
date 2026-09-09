import { isTauri, isCapacitor } from './StorageManager';

/**
 * Returns the normalized base path for routing (without trailing slash).
 * Examples:
 * - root domain: ""
 * - /Holad/ subpath: "/Holad"
 * - /music/ subpath: "/music"
 */
export function getBasePath(): string {
  // Desktop (Tauri) and Mobile (Capacitor) run locally in their own webview
  if (isTauri() || isCapacitor()) {
    return '';
  }

  if (typeof document !== 'undefined') {
    const baseEl = document.querySelector('base');
    const href = baseEl?.getAttribute('href');
    if (href) {
      if (href === '/' || href === './') return '';
      return href.endsWith('/') ? href.slice(0, -1) : href;
    }
  }

  const envBase = import.meta.env.BASE_URL;
  if (envBase && envBase !== '/' && envBase !== './') {
    return envBase.endsWith('/') ? envBase.slice(0, -1) : envBase;
  }

  if (typeof window !== 'undefined') {
    const path = window.location.pathname.toLowerCase();
    if (path === '/holad' || path.startsWith('/holad/')) {
      return '/Holad';
    }
  }

  return '';
}
