import { isTauri, isCapacitor } from './StorageManager';
import { registerPlugin } from '@capacitor/core';
import { getBasePath } from './basePath';

interface AppIconPluginType {
  setAppIcon(options: { icon: string }): Promise<{ success: boolean; icon: string }>;
}

const AppIconPlugin = isCapacitor()
  ? registerPlugin<AppIconPluginType>('AppIcon')
  : null;

export function getAssetUrl(path: string): string {
  const base = getBasePath();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export async function applyAppIcon(icon: string) {
  // 1. Browser favicon update
  try {
    const rawPath =
      icon === 'cassette'
        ? '/icons/logo_cassette.png'
        : icon === 'wave_light'
        ? '/icons/favicon_light.png'
        : '/icons/favicon_dark.png';

    const faviconHref = getAssetUrl(rawPath);

    const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
    if (links.length > 0) {
      links.forEach((l) => {
        l.removeAttribute('media');
        l.href = faviconHref;
      });
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = faviconHref;
      document.head.appendChild(link);
    }
  } catch (e) {
    console.error('Failed to update browser favicon:', e);
  }

  // 2. Tauri: desktop window, tray, taskbar
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_app_icon', { icon });
    } catch (e) {
      console.error('Failed to update Tauri app icon:', e);
    }
  }

  // 3. Mobile (Capacitor / Android): launcher activity alias
  if (isCapacitor() && AppIconPlugin) {
    try {
      await AppIconPlugin.setAppIcon({ icon });
    } catch (e) {
      console.error('Failed to update Capacitor app icon:', e);
    }
  }
}