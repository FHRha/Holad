import { isTauri, isCapacitor } from './StorageManager';
import { registerPlugin } from '@capacitor/core';

interface AppIconPluginType {
  setAppIcon(options: { icon: string }): Promise<{ success: boolean; icon: string }>;
}

const AppIconPlugin = isCapacitor()
  ? registerPlugin<AppIconPluginType>('AppIcon')
  : null;

export async function applyAppIcon(icon: string) {
  // 1. Browser favicon update
  try {
    const faviconHref =
      icon === 'cassette'
        ? '/icons/logo_cassette.png'
        : icon === 'wave_light'
        ? '/icons/favicon_light.png'
        : '/icons/favicon_dark.png';

    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconHref;
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