import { toast } from 'sonner';
import { isTauri, isCapacitor } from '../utils/StorageManager';
import { useUIStore, type UpdateProgress } from '../store/uiStore';
import { openExternalLink } from '../utils/linkHelper';
import { ApkUpdaterPlugin } from '../utils/apkUpdaterHelper';
import { getHoladServerUrl } from '../utils/serverConfig';
import { useSettingsStore } from '../store/settingsStore';
import i18n from '../i18n';

export function compareVersions(v1: string, v2: string): number {
    const parse = (v: string) => {
        const clean = (v || '').replace(/^v/i, '').trim();
        const [core, ...preParts] = clean.split('-');
        const pre = preParts.length > 0 ? preParts.join('-') : null;
        const coreNums = core.split('.').map(n => parseInt(n, 10) || 0);
        while (coreNums.length < 3) coreNums.push(0);
        return { coreNums, pre };
    };

    const p1 = parse(v1);
    const p2 = parse(v2);

    const maxLen = Math.max(p1.coreNums.length, p2.coreNums.length);
    for (let i = 0; i < maxLen; i++) {
        const n1 = p1.coreNums[i] || 0;
        const n2 = p2.coreNums[i] || 0;
        if (n1 > n2) return 1;
        if (n1 < n2) return -1;
    }

    // Core numbers are equal:
    // Normal release (no pre-release) has higher precedence than a pre-release
    if (!p1.pre && p2.pre) return 1;
    if (p1.pre && !p2.pre) return -1;
    if (!p1.pre && !p2.pre) return 0;

    // Both have pre-release identifiers, compare segment by segment
    const parts1 = p1.pre!.split('.');
    const parts2 = p2.pre!.split('.');
    const maxPreLen = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < maxPreLen; i++) {
        const seg1 = parts1[i];
        const seg2 = parts2[i];
        if (seg1 === undefined) return -1;
        if (seg2 === undefined) return 1;

        const num1 = parseInt(seg1, 10);
        const num2 = parseInt(seg2, 10);
        const isNum1 = !isNaN(num1) && String(num1) === seg1;
        const isNum2 = !isNaN(num2) && String(num2) === seg2;

        if (isNum1 && isNum2) {
            if (num1 > num2) return 1;
            if (num1 < num2) return -1;
        } else if (isNum1 && !isNum2) {
            return -1;
        } else if (!isNum1 && isNum2) {
            return 1;
        } else {
            const cmp = seg1.localeCompare(seg2);
            if (cmp !== 0) return cmp > 0 ? 1 : -1;
        }
    }
    return 0;
}

function getPlatform(): 'windows' | 'linux' | 'android' | 'other' {
    if (isCapacitor()) return 'android';
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
    const plat = (typeof navigator !== 'undefined' ? (navigator as any).platform || '' : '').toLowerCase();
    if (ua.includes('android')) return 'android';
    if (plat.startsWith('win') || ua.includes('windows')) return 'windows';
    if (plat.startsWith('linux') || ua.includes('linux')) return 'linux';
    return 'other';
}

export class UpdateService {
    private static readonly SNOOZE_KEY = 'update_snooze_until';
    private static readonly GITHUB_RELEASES_API = 'https://api.github.com/repos/FHRha/Holad/releases/latest';
    private static cachedServerVersion: string | null = null;

    static clearCachedVersion(): void {
        this.cachedServerVersion = null;
    }

    static isSnoozed(): boolean {
        const snoozeUntil = localStorage.getItem(this.SNOOZE_KEY);
        if (!snoozeUntil) return false;
        
        const snoozeDate = new Date(snoozeUntil);
        return new Date() < snoozeDate;
    }

    static snooze() {
        const snoozeDate = new Date();
        snoozeDate.setDate(snoozeDate.getDate() + 7);
        localStorage.setItem(this.SNOOZE_KEY, snoozeDate.toISOString());
    }

    static async getCurrentVersion(): Promise<string> {
        if (isTauri()) {
            try {
                const { getVersion } = await import('@tauri-apps/api/app');
                const version = await getVersion();
                if (version && version !== '0.0.0') {
                    return version;
                }
            } catch (e) {
                console.warn('Could not read Tauri app version:', e);
            }
        }

        if (isCapacitor()) {
            try {
                const { App } = await import('@capacitor/app');
                const info = await App.getInfo();
                if (info?.version && info.version !== '0.0.0') {
                    return info.version;
                }
            } catch (e) {
                console.warn('Could not read Capacitor app version:', e);
            }
        }

        // Web mode: return cached server version if available
        if (this.cachedServerVersion) {
            return this.cachedServerVersion;
        }

        // Try querying the backend /api/version endpoint
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const serverUrl = getHoladServerUrl();
            const res = await fetch(`${serverUrl}/api/version`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data?.version && data.version !== '0.0.0') {
                    this.cachedServerVersion = data.version;
                    return data.version;
                }
            }
        } catch {
            // Endpoint unreachable or offline; fallback to compile-time define
        }

        if (typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ && __APP_VERSION__ !== '0.0.0') {
            return __APP_VERSION__;
        }

        return '2.0.6';
    }

    static async checkForUpdates(manualCheck = false): Promise<{ 
        available: boolean; 
        version?: string; 
        notes?: string; 
        downloadUrl?: string; 
        fileName?: string; 
        size?: number;
        isPrerelease?: boolean;
    }> {
        if (!manualCheck && this.isSnoozed()) {
            return { available: false };
        }

        try {
            if (manualCheck) {
                toast.info(i18n.t('update.checking', 'Checking for updates...'));
            }

            const includePrereleases = useSettingsStore.getState().includePrereleases;
            const apiUrl = includePrereleases
                ? 'https://api.github.com/repos/FHRha/Holad/releases?per_page=10'
                : this.GITHUB_RELEASES_API;

            const response = await fetch(apiUrl);
            if (!response.ok) {
                if (manualCheck) toast.error(i18n.t('update.check_failed', 'Failed to check for updates (API error).'));
                return { available: false };
            }
            
            const rawData = await response.json();
            let data: any = null;
            if (Array.isArray(rawData)) {
                data = rawData.find((r: any) => !r.draft) || null;
            } else {
                data = rawData;
            }

            if (!data) {
                if (manualCheck) toast.error(i18n.t('update.check_failed', 'No release found.'));
                return { available: false };
            }

            const latestVersion = data.tag_name || '';
            const notes = data.body || '';
            const isPrerelease = Boolean(data.prerelease || latestVersion.includes('-'));
            const currentVersion = await this.getCurrentVersion();
            
            if (!manualCheck && (currentVersion === '0.0.0' || import.meta.env.DEV)) {
                return { available: false, version: latestVersion, notes, isPrerelease };
            }

            const isNewer = compareVersions(latestVersion, currentVersion) > 0;
            console.log(`[UpdateService] Current: "${currentVersion}", Latest: "${latestVersion}", isPrerelease: ${isPrerelease}, isNewer: ${isNewer}`);
            
            if (isNewer) {
                const platform = getPlatform();
                const assets: any[] = Array.isArray(data.assets) ? data.assets : [];

                let targetAsset: any = null;
                if (platform === 'windows') {
                    targetAsset = assets.find((a: any) => a.name?.endsWith('-setup.exe')) 
                               || assets.find((a: any) => a.name?.endsWith('.exe'))
                               || assets.find((a: any) => a.name?.endsWith('.msi'));
                } else if (platform === 'linux') {
                    targetAsset = assets.find((a: any) => a.name?.endsWith('.AppImage'))
                               || assets.find((a: any) => a.name?.endsWith('.deb'));
                } else if (platform === 'android') {
                    targetAsset = assets.find((a: any) => a.name?.endsWith('.apk'));
                }

                if (!targetAsset && assets.length > 0) {
                    targetAsset = assets[0];
                }

                const downloadUrl = targetAsset?.browser_download_url;
                const fileName = targetAsset?.name;
                const size = targetAsset?.size;

                useUIStore.getState().setUpdateInfo({ 
                    version: latestVersion, 
                    notes, 
                    downloadUrl,
                    fileName,
                    size,
                    progress: null,
                    isPrerelease
                });
                useUIStore.getState().setUpdateModalOpen(true);

                return {
                    available: true,
                    version: latestVersion,
                    notes,
                    downloadUrl,
                    fileName,
                    size,
                    isPrerelease
                };
            } else if (manualCheck) {
                toast.success(i18n.t('update.up_to_date', 'You are on the latest version!'));
            }
            
            return {
                available: false,
                version: latestVersion,
                notes,
                isPrerelease
            };
        } catch (error) {
            console.error('Failed to check for updates', error);
            if (manualCheck) toast.error(i18n.t('update.check_failed', 'Failed to check for updates (Network error).'));
            return { available: false };
        }
    }

    static async performUpdate() {
        const info = useUIStore.getState().updateInfo;
        
        if (!info?.downloadUrl || !info?.fileName) {
            toast.error(i18n.t('update.download_failed', 'Failed to download update'));
            return;
        }

        if (isTauri()) {
            try {
                useUIStore.getState().setUpdateProgress({
                    stage: 'downloading',
                    percent: 0,
                    downloaded: 0,
                    total: info.size || 0
                });

                const { listen } = await import('@tauri-apps/api/event');
                const { invoke } = await import('@tauri-apps/api/core');

                const unlisten = await listen<UpdateProgress>('update-download-progress', (event) => {
                    useUIStore.getState().setUpdateProgress(event.payload);
                });

                await invoke('download_and_install_update', {
                    url: info.downloadUrl,
                    fileName: info.fileName
                });

                unlisten();
            } catch (err: any) {
                console.error('Desktop update error:', err);
                const errorStr = typeof err === 'string' ? err : err?.message || 'Update failed';
                useUIStore.getState().setUpdateProgress({
                    stage: 'error',
                    percent: 0,
                    downloaded: 0,
                    total: 0,
                    error: errorStr
                });
                toast.error(errorStr);
            }
        } else if (isCapacitor() && ApkUpdaterPlugin) {
            try {
                useUIStore.getState().setUpdateProgress({
                    stage: 'downloading',
                    percent: 0,
                    downloaded: 0,
                    total: info.size || 0
                });

                const listener = await ApkUpdaterPlugin.addListener('update-download-progress', (event) => {
                    useUIStore.getState().setUpdateProgress(event);
                });

                const res = await ApkUpdaterPlugin.downloadAndInstall({
                    url: info.downloadUrl,
                    fileName: info.fileName || 'Holad-Update.apk'
                });

                if (res.stage === 'permission_required') {
                    useUIStore.getState().setUpdateProgress({
                        stage: 'permission_required',
                        percent: 100,
                        downloaded: info.size || 0,
                        total: info.size || 0,
                        filePath: res.filePath
                    });
                }

                await listener.remove();
            } catch (err: any) {
                console.error('Android update error:', err);
                const errorStr = typeof err === 'string' ? err : err?.message || 'Update failed';
                useUIStore.getState().setUpdateProgress({
                    stage: 'error',
                    percent: 0,
                    downloaded: 0,
                    total: 0,
                    error: errorStr
                });
                toast.error(errorStr);
            }
        } else {
            openExternalLink(info.downloadUrl);
        }
    }

    static async requestInstallPermission() {
        if (isCapacitor() && ApkUpdaterPlugin) {
            await ApkUpdaterPlugin.openInstallSettings();
        }
    }

    static async installDownloadedApk(filePath: string) {
        if (isCapacitor() && ApkUpdaterPlugin) {
            await ApkUpdaterPlugin.installApk({ filePath });
        }
    }
}
