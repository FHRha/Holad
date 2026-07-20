import { writeFile, mkdir, exists, remove, copyFile, readDir } from '@tauri-apps/plugin-fs';
import { executableDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useDownloadStore } from '../store/downloadStore';

// Check if we are running inside Tauri
export const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Check if we are running inside Capacitor (to be implemented in Phase 3)
export const isCapacitor = () => {
  return typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
};

export class StorageManager {
  static async getDefaultDownloadDir(): Promise<string> {
    if (isTauri()) {
      try {
        const exeDir = await executableDir();
        return await join(exeDir, 'download');
      } catch (err) {
        console.error('Error getting executable dir:', err);
        return 'download';
      }
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
        } catch (e) {
          const parts = dirPath.split('/');
          let curr = '';
          for (const part of parts) {
            curr = curr ? `${curr}/${part}` : part;
            try {
              await Filesystem.stat({ path: curr, directory: Directory.Data });
            } catch {
              await Filesystem.mkdir({ path: curr, directory: Directory.Data });
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

  static async moveDirectory(oldPath: string, newPath: string): Promise<void> {
    if (!isTauri()) return;
    try {
      if (!await exists(oldPath)) return;
      
      // Ensure new directory exists
      if (!await exists(newPath)) {
        await mkdir(newPath, { recursive: true });
      }

      const entries = await readDir(oldPath);
      for (const entry of entries) {
        if (entry.isFile) {
          const oldFile = await join(oldPath, entry.name);
          const newFile = await join(newPath, entry.name);
          await copyFile(oldFile, newFile);
        }
      }
      
      // Remove old directory after successful copy
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

  // Future method for retrieving tracks
  // @ts-ignore
  static async getTrack(fileName: string): Promise<Uint8Array | null> {
    if (isTauri()) {
      // Phase 1 implementation
      return null;
    } else if (isCapacitor()) {
      // Phase 3 implementation
      return null;
    } else {
      // Browser
      return null;
    }
  }

  static async getLocalTrackUri(trackId: string, trackTitle: string, albumId?: string): Promise<string | null> {
    // Resolve dynamic import for store to avoid circular dependency
    // Changed to static import as it was causing warnings
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
          console.error('Error resolving local track uri:', e);
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
        } catch (e) {}
      }
    }

    // 2. Check if it's inside a downloaded album
    if (albumId) {
      const albumDownload = downloads[albumId];
      if (albumDownload && albumDownload.status === 'completed' && albumDownload.path) {
        const safeTitle = trackTitle.replace(/[/\\?%*:|"<>]/g, '-');
        
        if (isTauri()) {
          try {
            if (await exists(albumDownload.path)) {
              const entries = await readDir(albumDownload.path);
              // Find a file that starts with the safe title (because of extension)
              const matchedEntry = entries.find(e => e.isFile && e.name.startsWith(safeTitle));
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
             const matchedFile = res.files.find(f => f.name.startsWith(safeTitle));
             if (matchedFile) {
                const fullPath = `${albumDownload.path}/${matchedFile.name}`;
                const uri = await Filesystem.getUri({ path: fullPath, directory: Directory.Data });
                return Capacitor.convertFileSrc(uri.uri);
             }
          } catch (e) {}
        }
      }
    }

    return null;
  }
}

