import { writeFile, mkdir, exists, remove, copyFile, readDir } from '@tauri-apps/plugin-fs';
import { downloadDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useDownloadStore } from '../store/downloadStore';

// Check if we are running inside Tauri
export const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Check if we are running inside Capacitor natively
export const isCapacitor = () => {
  return typeof window !== 'undefined' && (window as any).Capacitor !== undefined && (window as any).Capacitor.isNativePlatform();
};

export class StorageManager {
  static async getDefaultDownloadDir(): Promise<string> {
    if (isTauri()) {
      try {
        const dDir = await downloadDir();
        return await join(dDir, 'Holad');
      } catch (err) {
        console.error('Error getting download dir:', err);
        return 'download';
      }
    } else if (isCapacitor()) {
      return 'Holad';
    }
    return 'download';
  }

  static async saveTrack(fileName: string, data: ArrayBuffer | Uint8Array, targetDir?: string, subDir?: string): Promise<string> {
    if (isTauri()) {
      try {
        let baseDir = targetDir || await this.getDefaultDownloadDir();
        if (subDir) {
          baseDir = await join(baseDir, subDir);
        }
        
        // Ensure directory exists
        const hasDir = await exists(baseDir);
        if (!hasDir) {
          await mkdir(baseDir, { recursive: true });
        }

        const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);
        const filePath = await join(baseDir, fileName);
        await writeFile(filePath, uint8Array);
        console.log(`Track ${fileName} saved successfully at ${filePath}`);
        return filePath;
      } catch (err) {
        console.error('Error saving track via Tauri:', err);
        throw err;
      }
    } else if (isCapacitor()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        
        // Convert array buffer to base64 safely
        const blob = new Blob([new Uint8Array(data) as BlobPart]);
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const targetPath = subDir ? `Holad/${subDir}/${fileName}` : `Holad/${fileName}`;
        const dirPath = subDir ? `Holad/${subDir}` : 'Holad';

        // Ensure directory exists
        try {
          await Filesystem.stat({ path: dirPath, directory: Directory.Data });
        } catch {
          const parts = dirPath.split('/');
          let curr = '';
          for (const part of parts) {
            curr = curr ? `${curr}/${part}` : part;
            try {
              await Filesystem.stat({ path: curr, directory: Directory.Data });
            } catch {
              await Filesystem.mkdir({ path: curr, directory: Directory.Data, recursive: true });
            }
          }
        }

        await Filesystem.writeFile({
          path: targetPath,
          data: base64Data,
          directory: Directory.Data
        });
        console.log(`Track ${fileName} saved successfully via Capacitor fs at ${targetPath}`);
        return targetPath;
      } catch (err) {
        console.error('Error saving track via Capacitor:', err);
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
        let baseDir = customDir || await this.getDefaultDownloadDir();
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
    } else if (isCapacitor()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const blob = new Blob([new Uint8Array(data) as BlobPart]);
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        const targetPath = defaultSubDir ? `Holad/${defaultSubDir}/${fileName}` : `Holad/${fileName}`;
        const dirPath = defaultSubDir ? `Holad/${defaultSubDir}` : 'Holad';

        try {
          await Filesystem.stat({ path: dirPath, directory: Directory.Data });
        } catch {
          const parts = dirPath.split('/');
          let curr = '';
          for (const part of parts) {
            curr = curr ? `${curr}/${part}` : part;
            try {
              await Filesystem.stat({ path: curr, directory: Directory.Data });
            } catch {
              await Filesystem.mkdir({ path: curr, directory: Directory.Data, recursive: true });
            }
          }
        }

        await Filesystem.writeFile({
          path: targetPath,
          data: base64Data,
          directory: Directory.Data
        });
        console.log(`Cover art ${fileName} saved successfully via Capacitor fs at ${targetPath}`);
        return targetPath;
      } catch (err) {
        console.error('Error saving cover art via Capacitor:', err);
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
        coverPathOrId.startsWith('_capacitor_file_') || 
        coverPathOrId.startsWith('capacitor://') || 
        coverPathOrId.startsWith('file://') || 
        coverPathOrId.startsWith('blob:') || 
        coverPathOrId.startsWith('data:')) {
      return coverPathOrId;
    }

    if (isTauri()) {
      try {
        if (await exists(coverPathOrId)) {
          return convertFileSrc(coverPathOrId);
        }
        const defaultDir = await this.getDefaultDownloadDir();
        const extensions = ['', '.jpg', '.jpeg', '.png', '.webp'];
        for (const ext of extensions) {
          const testPath = await join(defaultDir, 'covers', `${coverPathOrId}${ext}`);
          if (await exists(testPath)) {
            return convertFileSrc(testPath);
          }
        }
      } catch (e) {
        console.warn('Error resolving local cover URI via Tauri, assuming valid if absolute:', e);
        if (coverPathOrId.includes('/') || coverPathOrId.includes('\\')) {
          return convertFileSrc(coverPathOrId);
        }
      }
    } else if (isCapacitor()) {
      try {
        const { Capacitor } = await import('@capacitor/core');
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        
        try {
          const stat = await Filesystem.stat({ path: coverPathOrId, directory: Directory.Data });
          if (stat) {
            const uri = await Filesystem.getUri({ path: coverPathOrId, directory: Directory.Data });
            return Capacitor.convertFileSrc(uri.uri);
          }
        } catch {}

        const extensions = ['', '.jpg', '.jpeg', '.png', '.webp'];
        for (const ext of extensions) {
          const testPath = `Holad/covers/${coverPathOrId}${ext}`;
          try {
            const stat = await Filesystem.stat({ path: testPath, directory: Directory.Data });
            if (stat) {
              const uri = await Filesystem.getUri({ path: testPath, directory: Directory.Data });
              return Capacitor.convertFileSrc(uri.uri);
            }
          } catch {}
        }
      } catch (e) {
        console.error('Error resolving local cover URI via Capacitor:', e);
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
        if (await exists(filePath)) {
          await remove(filePath);
          console.log(`Track ${filePath} removed successfully via Tauri`);
        }
      } catch (err) {
        console.error('Error removing track via Tauri:', err);
        throw err;
      }
    } else if (isCapacitor()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.deleteFile({
          path: filePath,
          directory: Directory.Data
        });
        console.log(`Track ${filePath} removed successfully via Capacitor fs`);
      } catch (err) {
        console.error('Error removing track via Capacitor:', err);
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
    } else if (isCapacitor()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.rmdir({
          path: dirPath,
          directory: Directory.Data,
          recursive: true
        });
        console.log(`Directory ${dirPath} removed successfully via Capacitor fs`);
      } catch (err) {
        console.error('Error removing directory via Capacitor:', err);
        throw err;
      }
    }
  }

  static async getLocalTrackUri(trackId: string, trackTitle?: string, albumId?: string): Promise<string | null> {
    const { downloads } = useDownloadStore.getState();

    // 1. Check if track was downloaded directly
    const trackDownload = downloads[trackId];
    if (trackDownload && trackDownload.status === 'completed' && trackDownload.path) {
      if (isTauri()) {
        try {
          if (await exists(trackDownload.path)) {
            return convertFileSrc(trackDownload.path);
          }
        } catch (e) {
          console.warn('Error checking track uri via Tauri, assuming it exists to prevent playback blocking:', e);
          return convertFileSrc(trackDownload.path);
        }
      } else if (isCapacitor()) {
        try {
          const { Capacitor } = await import('@capacitor/core');
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          const stat = await Filesystem.stat({ path: trackDownload.path, directory: Directory.Data });
          if (stat) {
             const uri = await Filesystem.getUri({ path: trackDownload.path, directory: Directory.Data });
             return Capacitor.convertFileSrc(uri.uri);
          }
        } catch {}
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
        } else if (isCapacitor()) {
          try {
             const { Capacitor } = await import('@capacitor/core');
             const { Filesystem, Directory } = await import('@capacitor/filesystem');
             const res = await Filesystem.readdir({ path: albumDownload.path, directory: Directory.Data });
             const matchedFile = safeTitle
               ? res.files.find(f => f.name.startsWith(safeTitle) || f.name.includes(safeTitle))
               : res.files[0];
             if (matchedFile) {
                const fullPath = `${albumDownload.path}/${matchedFile.name}`;
                const uri = await Filesystem.getUri({ path: fullPath, directory: Directory.Data });
                return Capacitor.convertFileSrc(uri.uri);
             }
          } catch {}
        }
      }
    }

    return null;
  }
}
