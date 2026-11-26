import { isTauriDesktop } from './platform';
import { getBasePath } from './basePath';

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
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_app_icon', { icon });
    } catch (e) {
      console.error('Failed to update Tauri app icon:', e);
    }
  }
}