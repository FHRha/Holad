import { writeFile, mkdir, exists, remove, copyFile, readDir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useDownloadStore } from '../store/downloadStore';
import { findDownloadedTrackMatch } from './trackFingerprint';
import { isTauri, isTauriMobile, isMobileClient } from './platform';

export { isTauri, isMobileClient };

const ANDROID_STORAGE_MIGRATED_KEY = 'holad_android_storage_migrated_v1';

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .trim() || 'track';
}

function guessAudioMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'flac': return 'audio/flac';
    case 'm4a':
    case 'aac': return 'audio/mp4';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'wav': return 'audio/wav';
    case 'wma': return 'audio/x-ms-wma';
    case 'alac': return 'audio/alac';
    default: return 'audio/*';
  }
}

export class StorageManager {
  private static migrationPromise: Promise<void> | null = null;

  static async requestStoragePermissions(): Promise<boolean> {
    if (!isTauriMobile()) return true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<{ granted?: boolean }>('plugin:storage|requestStoragePermissions');
      return Boolean(res?.granted);
    } catch (err) {
      console.warn('Error requesting Android storage permissions:', err);
      return false;
    }
  }

  static async migrateLegacyDownloads(): Promise<void> {
    if (!isTauriMobile()) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(ANDROID_STORAGE_MIGRATED_KEY) === '1') {
      return;
    }
    if (this.migrationPromise) {
      return this.migrationPromise;
    }

    this.migrationPromise = (async () => {
      try {
        await this.requestStoragePermissions();
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke<{
          migratedCount?: number;
          migratedTracks?: Array<{ oldPath: string; newPath: string }>;
        }>('plugin:storage|migrateLegacyDownloads');

        const migratedTracks = Array.isArray(res?.migratedTracks) ? res.migratedTracks : [];
        if (migratedTracks.length > 0) {
          const pathMap = new Map<string, string>();
          for (const entry of migratedTracks) {
            if (entry?.oldPath && entry?.newPath) {
              pathMap.set(entry.oldPath, entry.newPath);
              pathMap.set(entry.oldPath.replace(/^file:\/\//, ''), entry.newPath);
            }
          }

          const store = useDownloadStore.getState();
          for (const [id, item] of Object.entries(store.downloads)) {
            if (!item) continue;
            const updates: Record<string, any> = {};
            if (item.path) {
              const cleanPath = item.path.replace(/^file:\/\//, '');
              const mapped = pathMap.get(item.path) || pathMap.get(cleanPath);
              if (mapped) {
                updates.path = mapped;
              }
            }
            if (item.localCoverArtUri) {
              for (const [oldP, newP] of pathMap.entries()) {
                if (item.localCoverArtUri === oldP || item.localCoverArtUri.endsWith(oldP)) {
                  updates.localCoverArtUri = convertFileSrc(newP);
                  break;
                }
              }
            }
            if (Object.keys(updates).length > 0) {
              store.updateItem(id, updates);
            }
          }
          console.log(`[StorageManager] Migrated ${migratedTracks.length} legacy Android download files.`);
        }

        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(ANDROID_STORAGE_MIGRATED_KEY, '1');
        }
      } catch (err) {
        console.warn('[StorageManager] Legacy Android download migration failed:', err);
      } finally {
        this.migrationPromise = null;
      }
    })();

    return this.migrationPromise;
  }

  static async getDefaultDownloadDir(): Promise<string> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const customDir = await invoke<string>('get_music_download_dir');
        if (customDir && customDir.trim().length > 0) {
          return customDir.trim();
        }
      } catch {
        // fallback
      }
      try {
        if (isTauriMobile()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const publicDir = await invoke<{ path?: string }>('plugin:storage|getPublicMusicDir');
            if (publicDir?.path && publicDir.path.trim().length > 0) {
              return publicDir.path.trim();
            }
          } catch {
            // fallback to appDataDir
          }
          const { appDataDir } = await import('@tauri-apps/api/path');
          return await join(await appDataDir(), 'Holad');
        }
        const { downloadDir } = await import('@tauri-apps/api/path');
        const dDir = await downloadDir();
        return await join(dDir, 'Holad');
      } catch (err) {
        console.error('Error getting download dir:', err);
        return 'download';
      }
    }
    return 'download';
  }

  static async downloadTrackToDisk(
    url: string,
    fileName: string,
    onProgress?: (loaded: number, total: number) => void,
    targetDir?: string,
    subDir?: string,
    signal?: AbortSignal
  ): Promise<{ filePath: string; sizeBytes: number } | null> {
    if (!isTauri()) return null;
    if (signal?.aborted) throw new Error('Aborted');

    let invoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | undefined;
    let ChannelCtor: (new <T>() => { onmessage: (msg: T) => void }) | undefined;
    try {
      const core = await import('@tauri-apps/api/core') as {
        invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
        Channel?: new <T>() => { onmessage: (msg: T) => void };
      };
      invoke = core.invoke;
      ChannelCtor = core.Channel;
    } catch {
      return null;
    }
    if (typeof invoke !== 'function' || typeof ChannelCtor !== 'function') {
      return null;
    }

    const safeFileName = sanitizeFileName(fileName);
    const channel = new ChannelCtor<{ downloaded: number; total: number | null }>();
    channel.onmessage = (msg) => {
      if (onProgress && msg) {
        onProgress(msg.downloaded ?? 0, msg.total ?? 0);
      }
    };

    if (isTauriMobile() && !targetDir) {
      await this.requestStoragePermissions();
      const { appDataDir } = await import('@tauri-apps/api/path');
      const tmpDir = await join(await appDataDir(), 'Holad', '.tmp');
      if (!await exists(tmpDir)) {
        await mkdir(tmpDir, { recursive: true });
      }
      const tmpFile = await join(tmpDir, `${Date.now()}_${safeFileName}`);
      try {
        const res = await invoke<{ sizeBytes?: number; bytesWritten?: number } | number | null>(
          'download_file_to_path',
          { url, destPath: tmpFile, channel }
        );
        if (signal?.aborted) throw new Error('Aborted');
        if (res === null || res === undefined) return null;

        const sizeBytes = typeof res === 'number' ? res : (res.sizeBytes ?? res.bytesWritten ?? 0);
        try {
          const normalizedSubDir = subDir ? subDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
          const relativePath = normalizedSubDir ? `${normalizedSubDir}/${safeFileName}` : safeFileName;
          const pubRes = await invoke<{ path: string; uri: string }>('plugin:storage|savePublicAudio', {
            sourcePath: tmpFile,
            relativePath,
            title: safeFileName.replace(/\.[^.]+$/, ''),
            mimeType: guessAudioMimeType(safeFileName)
          });
          console.log(`Track ${safeFileName} saved to public Music/Holad at ${pubRes.path}`);
          return { filePath: pubRes.path, sizeBytes };
        } catch (mobileErr) {
          console.warn('Public MediaStore save failed, falling back to app directory:', mobileErr);
          let fallbackDir = await this.getDefaultDownloadDir();
          if (subDir) {
            fallbackDir = await join(fallbackDir, subDir);
          }
          if (!await exists(fallbackDir)) {
            await mkdir(fallbackDir, { recursive: true });
          }
          const destPath = await join(fallbackDir, safeFileName);
          await copyFile(tmpFile, destPath);
          return { filePath: destPath, sizeBytes };
        }
      } catch (err) {
        if (signal?.aborted) throw new Error('Aborted');
        console.warn('Native download_file_to_path failed on mobile, falling back to fetch:', err);
        return null;
      } finally {
        await remove(tmpFile).catch(() => {});
      }
    }

    try {
      let baseDir = targetDir || await this.getDefaultDownloadDir();
      if (subDir) {
        baseDir = await join(baseDir, subDir);
      }
      if (!await exists(baseDir)) {
        await mkdir(baseDir, { recursive: true });
      }
      const destPath = await join(baseDir, safeFileName);
      const res = await invoke<{ sizeBytes?: number; bytesWritten?: number; path?: string } | number | null>(
        'download_file_to_path',
        { url, destPath, channel }
      );
      if (signal?.aborted) throw new Error('Aborted');
      if (res === null || res === undefined) return null;

      const sizeBytes = typeof res === 'number' ? res : (res.sizeBytes ?? res.bytesWritten ?? 0);
      const filePath = (typeof res === 'object' && res.path) ? res.path : destPath;
      console.log(`Track ${safeFileName} downloaded natively to ${filePath}`);
      return { filePath, sizeBytes };
    } catch (err) {
      if (signal?.aborted) throw new Error('Aborted');
      console.warn('Native download_file_to_path failed, falling back to fetch:', err);
      return null;
    }
  }

  static async saveTrack(fileName: string, data: ArrayBuffer | Uint8Array, targetDir?: string, subDir?: string): Promise<string> {
    if (isTauri()) {
      try {
        const safeTmpFileName = sanitizeFileName(fileName);
        const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);

        if (isTauriMobile() && !targetDir) {
          await this.requestStoragePermissions();
          try {
            const { appDataDir } = await import('@tauri-apps/api/path');
            const { invoke } = await import('@tauri-apps/api/core');
            const tmpDir = await join(await appDataDir(), 'Holad', '.tmp');
            if (!await exists(tmpDir)) {
              await mkdir(tmpDir, { recursive: true });
            }
            const tmpFile = await join(tmpDir, `${Date.now()}_${safeTmpFileName}`);
            await writeFile(tmpFile, uint8Array);
            try {
              const normalizedSubDir = subDir ? subDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') : '';
              const relativePath = normalizedSubDir ? `${normalizedSubDir}/${safeTmpFileName}` : safeTmpFileName;
              const res = await invoke<{ path: string; uri: string }>('plugin:storage|savePublicAudio', {
                sourcePath: tmpFile,
                relativePath,
                title: safeTmpFileName.replace(/\.[^.]+$/, ''),
                mimeType: guessAudioMimeType(safeTmpFileName)
              });
              console.log(`Track ${safeTmpFileName} saved to public Music/Holad at ${res.path}`);
              return res.path;
            } finally {
              await remove(tmpFile).catch(() => {});
            }
          } catch (mobileErr) {
            console.warn('Public MediaStore save failed, falling back to app directory:', mobileErr);
          }
        }

        let baseDir = targetDir || await this.getDefaultDownloadDir();
        if (subDir) {
          baseDir = await join(baseDir, subDir);
        }
        
        // Ensure directory exists
        const hasDir = await exists(baseDir);
        if (!hasDir) {
          await mkdir(baseDir, { recursive: true });
        }

        const filePath = await join(baseDir, fileName);
        await writeFile(filePath, uint8Array);
        console.log(`Track ${fileName} saved successfully at ${filePath}`);
        return filePath;
      } catch (err) {
        console.error('Error saving track via Tauri:', err);
        throw err;
      }
    } else {
      // Browser environment
      console.warn('Browser environment detected. Track downloading for offline use is not supported in plain web.');
      throw new Error('Not supported in browser');
    }
  }

  static async saveCoverArt(fileName: string, data: ArrayBuffer | Uint8Array, customDir?: string, subDir?: string): Promise<string> {
    const defaultSubDir = subDir !== undefined ? subDir : 'covers';
    if (isTauri()) {
      try {
        let baseDir = customDir;
        if (!baseDir) {
          if (isTauriMobile()) {
            const { appDataDir } = await import('@tauri-apps/api/path');
            baseDir = await join(await appDataDir(), 'Holad');
          } else {
            baseDir = await this.getDefaultDownloadDir();
          }
        }
        if (defaultSubDir) {
          baseDir = await join(baseDir, defaultSubDir);
        }

        const hasDir = await exists(baseDir);
        if (!hasDir) {
          await mkdir(baseDir, { recursive: true });
        }

        const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);
        const filePath = await join(baseDir, fileName);
        await writeFile(filePath, uint8Array);
        console.log(`Cover art ${fileName} saved successfully at ${filePath}`);
        return filePath;
      } catch (err) {
        console.error('Error saving cover art via Tauri:', err);
        throw err;
      }
    } else {
      console.warn('Browser environment detected. Cover art downloading for offline use is not supported in plain web.');
      throw new Error('Not supported in browser');
    }
  }

  static async getLocalCoverUri(coverPathOrId: string): Promise<string | null> {
    if (!coverPathOrId) return null;
    if (coverPathOrId.startsWith('http://asset.localhost') || 
        coverPathOrId.startsWith('asset://') || 
        coverPathOrId.startsWith('file://') || 
        coverPathOrId.startsWith('blob:') || 
        coverPathOrId.startsWith('data:')) {
      return coverPathOrId;
    }

    if (isTauri()) {
      try {
        if ((coverPathOrId.includes('/') || coverPathOrId.includes('\\')) && await exists(coverPathOrId)) {
          return convertFileSrc(coverPathOrId);
        }
        const candidateDirs: string[] = [];
        if (isTauriMobile()) {
          const { appDataDir } = await import('@tauri-apps/api/path');
          candidateDirs.push(await join(await appDataDir(), 'Holad'));
        }
        candidateDirs.push(await this.getDefaultDownloadDir());
        const extensions = ['', '.jpg', '.jpeg', '.png', '.webp'];
        for (const dir of candidateDirs) {
          for (const ext of extensions) {
            const testPath = await join(dir, 'covers', `${coverPathOrId}${ext}`);
            if (await exists(testPath)) {
              return convertFileSrc(testPath);
            }
          }
        }
      } catch (e) {
        console.warn('Error resolving local cover URI via Tauri, assuming valid if absolute:', e);
        if (coverPathOrId.includes('/') || coverPathOrId.includes('\\')) {
          return convertFileSrc(coverPathOrId);
        }
      }
    }
    return null;
  }

  static async moveDirectory(oldPath: string, newPath: string): Promise<void> {
    if (!isTauri()) return;
    try {
      if (!await exists(oldPath)) return;
      
      const copyRecursive = async (src: string, dest: string) => {
        if (!await exists(dest)) {
          await mkdir(dest, { recursive: true });
        }
        const entries = await readDir(src);
        for (const entry of entries) {
          const srcItem = await join(src, entry.name);
          const destItem = await join(dest, entry.name);
          if (entry.isDirectory) {
            await copyRecursive(srcItem, destItem);
          } else if (entry.isFile) {
            await copyFile(srcItem, destItem);
          }
        }
      };

      await copyRecursive(oldPath, newPath);
      await remove(oldPath, { recursive: true });
      console.log(`Moved directory from ${oldPath} to ${newPath}`);
    } catch (err) {
      console.error('Error moving directory:', err);
      throw err;
    }
  }

  static async removeTrack(filePath: string): Promise<void> {
    if (isTauri()) {
      try {
        if (isTauriMobile()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('plugin:storage|deletePublicAudio', { path: filePath });
          } catch (mobileErr) {
            console.warn('Failed to delete public audio via StoragePlugin, falling back to fs.remove:', mobileErr);
          }
        }
        if (await exists(filePath)) {
          await remove(filePath);
          console.log(`Track ${filePath} removed successfully via Tauri`);
        }
      } catch (err) {
        console.error('Error removing track via Tauri:', err);
        throw err;
      }
    }
  }

  static async removeDirectory(dirPath: string): Promise<void> {
    if (isTauri()) {
      try {
        if (await exists(dirPath)) {
          await remove(dirPath, { recursive: true });
          console.log(`Directory ${dirPath} removed successfully via Tauri`);
        }
      } catch (err) {
        console.error('Error removing directory via Tauri:', err);
        throw err;
      }
    }
  }

  private static createdBlobUrls = new Set<string>();

  static registerBlobUrl(url: string): string {
    if (url && url.startsWith('blob:')) {
      this.createdBlobUrls.add(url);
    }
    return url;
  }

  static revokeBlobUrl(url: string | null | undefined): void {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Failed to revoke blob URL:', e);
      }
      this.createdBlobUrls.delete(url);
    }
  }

  static revokeAllBlobUrls(): void {
    for (const url of this.createdBlobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Failed to revoke blob URL:', e);
      }
    }
    this.createdBlobUrls.clear();
  }

  static async resolveAudioUri(
    trackIdOrPath: string,
    trackTitle?: string,
    albumId?: string,
    trackMeta?: any
  ): Promise<string | null> {
    if (!trackIdOrPath) return null;
    if (isTauri()) {
      if (trackIdOrPath.startsWith('http://asset.localhost') || trackIdOrPath.startsWith('asset://')) {
        return trackIdOrPath;
      }
      if (trackIdOrPath.includes('/') || trackIdOrPath.includes('\\')) {
        try {
          if (await exists(trackIdOrPath)) {
            return convertFileSrc(trackIdOrPath);
          }
        } catch {
          return convertFileSrc(trackIdOrPath);
        }
      }
    }
    return this.getLocalTrackUri(trackIdOrPath, trackTitle, albumId, trackMeta);
  }

  static async getTrackAudioUri(trackId: string, trackTitle?: string, albumId?: string, trackMeta?: any): Promise<string | null> {
    return this.resolveAudioUri(trackId, trackTitle, albumId, trackMeta);
  }

  static async getLocalTrackUri(
    trackId: string,
    trackTitle?: string,
    albumId?: string,
    trackMeta?: any
  ): Promise<string | null> {
    const { downloads } = useDownloadStore.getState();

    // 1. Check if track was downloaded directly
    let trackDownload = downloads[trackId];

    // If not found by direct ID, attempt reconciliation via fingerprint & metadata
    if (!trackDownload && (trackTitle || trackMeta)) {
      const candidate = {
        id: trackId,
        title: trackTitle || trackMeta?.title || trackMeta?.name,
        albumId: albumId || trackMeta?.albumId,
        artist: trackMeta?.artist,
        album: trackMeta?.album,
        duration: trackMeta?.duration,
        track: trackMeta?.track ?? trackMeta?.trackNumber,
        fingerprint: trackMeta?.fingerprint,
        fileName: trackMeta?.fileName ?? trackMeta?.path,
        path: trackMeta?.path
      };
      const matched = findDownloadedTrackMatch(downloads, candidate);
      if (matched && matched.status === 'completed' && matched.path) {
        trackDownload = matched;
        if (trackId && matched.id !== trackId) {
          try {
            useDownloadStore.getState().aliasDownloadId(matched.id, trackId);
          } catch {}
        }
      }
    }
    if (trackDownload && trackDownload.status === 'completed' && trackDownload.path) {
      if (isTauri()) {
        try {
          if (await exists(trackDownload.path)) {
            return convertFileSrc(trackDownload.path);
          }
        } catch (e) {
          console.warn('Error reading track via Tauri, assuming it exists to prevent playback blocking:', e);
          return convertFileSrc(trackDownload.path);
        }
      }
    }

    // 2. Check if it's inside a downloaded album
    if (albumId) {
      const albumDownload = downloads[albumId];
      if (albumDownload && albumDownload.status === 'completed' && albumDownload.path) {
        const safeTitle = trackTitle ? trackTitle.replace(/[/\\?%*:|"<>]/g, '-') : '';
        
        if (isTauri()) {
          try {
            if (await exists(albumDownload.path)) {
              const entries = await readDir(albumDownload.path);
              const matchedEntry = safeTitle
                ? entries.find(e => e.isFile && (e.name.startsWith(safeTitle) || e.name.includes(safeTitle)))
                : entries.find(e => e.isFile);
              if (matchedEntry) {
                const fullPath = await join(albumDownload.path, matchedEntry.name);
                return convertFileSrc(fullPath);
              }
            }
          } catch (e) {
            console.error('Error resolving album local track uri:', e);
          }
        }
      }
    }

    return null;
  }
}

if (typeof window !== 'undefined' && isTauriMobile()) {
  void StorageManager.migrateLegacyDownloads();
}
