import { isTauri } from './StorageManager';

function isSafeExternalUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export const openExternalLink = async (url: string) => {
    if (!isSafeExternalUrl(url)) {
        console.warn('Blocked unsafe external URL:', url);
        return;
    }
    try {
        if (isTauri()) {
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    } catch (e) {
        console.error('Failed to open link', e);
        window.open(url, '_blank', 'noopener,noreferrer');
    }
};
