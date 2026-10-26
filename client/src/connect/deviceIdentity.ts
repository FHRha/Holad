import { isTauri, isCapacitor } from '../utils/StorageManager';

/**
 * Checks whether the current environment is running on a mobile client
 * (mobile web or mobile Capacitor app, excluding desktop Tauri app).
 */
export const isMobileClient = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !isTauri() && (isCapacitor() || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
};

/**
 * Retrieves the device ID from localStorage or sessionStorage if available.
 */
export function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  let id: string | null = null;
  try {
    id = localStorage.getItem('holad_deviceId');
  } catch {}
  if (!id) {
    try {
      id = sessionStorage.getItem('holad_deviceId');
    } catch {}
  }
  return id;
}

/**
 * Persists the device ID to both localStorage and sessionStorage.
 */
export function saveDeviceId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('holad_deviceId', id);
  } catch {}
  try {
    sessionStorage.setItem('holad_deviceId', id);
  } catch {}
}

/**
 * Generates a unique device ID or reads the previously stored one.
 */
export function generateDeviceId(): string {
  const genId = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

  if (typeof window === 'undefined') {
    return genId();
  }

  let id = getStoredDeviceId();
  if (!id) {
    id = genId();
  }
  saveDeviceId(id);
  return id;
}

/**
 * Computes a human-friendly device name according to user agent and platform.
 */
export function getDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Holad Web Client';
  const ua = navigator.userAgent;
  
  if (ua.includes('Holad-Mobile')) {
    const os = /Android/.test(ua) ? 'Android' : /iOS|iPhone|iPad/.test(ua) ? 'iOS' : 'OS';
    return `Holad App on ${os}`;
  }
  
  if (ua.includes('Holad-Desktop')) {
    const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'OS';
    return `Holad Desktop on ${os}`;
  }

  const isMobile = /Mobi|Android/i.test(ua);
  const browser = /Chrome/.test(ua) ? 'Chrome' : 
                  /Safari/.test(ua) ? 'Safari' : 
                  /Firefox/.test(ua) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : 
             /Mac/.test(ua) ? 'Mac' : 
             /Linux/.test(ua) ? 'Linux' : 
             /Android/.test(ua) ? 'Android' : 
             /iOS|iPhone|iPad/.test(ua) ? 'iOS' : 'OS';
  
  return `${isMobile ? 'Mobile' : 'Desktop'} ${browser} on ${os}`;
}
