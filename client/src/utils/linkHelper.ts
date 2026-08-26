import { isTauri } from './StorageManager';

export const openExternalLink = async (url: string) => {
    try {
        if (isTauri()) {
            const { open } = await import('@tauri-apps/plugin-shell');
            await open(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        console.error('Failed to open link', e);
        window.open(url, '_blank');
    }
};
