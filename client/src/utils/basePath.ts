import { isTauri, isCapacitor } from './StorageManager';

declare global {
  interface Window {
    __HOLAD_BASE_PATH__?: string;
  }
}

/**
 * Returns the normalized base path for routing (without trailing slash).
 * Examples:
 * - root domain: ""
 * - /Holad/ subpath: "/Holad"
 */
export function getBasePath(): string {
  // Desktop (Tauri) and Mobile (Capacitor) run locally in their own webview
  if (isTauri() || isCapacitor()) {
    return '';
  }

  // 1. Direct server-injected runtime config
  if (typeof window !== 'undefined' && window.__HOLAD_BASE_PATH__ !== undefined) {
    const injected = window.__HOLAD_BASE_PATH__.trim();
    if (injected === '/' || injected === '' || injected === './') return '';
    const clean = injected.startsWith('/') ? injected : `/${injected}`;
    return clean.endsWith('/') ? clean.slice(0, -1) : clean;
  }

  // 2. HTML <base href="..."> injected by backend
  if (typeof document !== 'undefined') {
    const baseEl = document.querySelector('base');
    const href = baseEl?.getAttribute('href')?.trim();
    if (href) {
      if (href === '/' || href === './') return '';
      const clean = href.startsWith('/') ? href : `/${href}`;
      return clean.endsWith('/') ? clean.slice(0, -1) : clean;
    }
  }

  // 3. Build-time Vite base URL
  const envBase = import.meta.env.BASE_URL?.trim();
  if (envBase && envBase !== '/' && envBase !== './') {
    const clean = envBase.startsWith('/') ? envBase : `/${envBase}`;
    return clean.endsWith('/') ? clean.slice(0, -1) : clean;
  }

  // 4. Fallback: check if window.location has known prefix like /holad
  if (typeof window !== 'undefined') {
    const path = window.location.pathname.toLowerCase();
    if (path === '/holad' || path.startsWith('/holad/')) {
      return '/Holad';
    }
  }

  return '';
}

/**
 * Checks if the current or provided pathname is a Jam-related route (/jam, /join, etc.)
 * taking into account the configured base path.
 */
export function isJamPath(rawPath = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  if (!rawPath) return false;
  const base = getBasePath();
  let clean = rawPath;
  if (base && clean.toLowerCase().startsWith(base.toLowerCase())) {
    clean = clean.slice(base.length);
  }
  if (!clean.startsWith('/')) {
    clean = `/${clean}`;
  }
  return clean === '/jam' || clean.startsWith('/jam/') || clean === '/join' || clean.startsWith('/join/');
}

