import { writeFile, BaseDirectory, mkdir, exists } from '@tauri-apps/plugin-fs';

// Check if we are running inside Tauri
export const isTauri = () => {
  return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
};

// Check if we are running inside Capacitor (to be implemented in Phase 3)
export const isCapacitor = () => {
  return typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
};

export class StorageManager {
  static async saveTrack(fileName: string, data: ArrayBuffer | Uint8Array): Promise<void> {
    if (isTauri()) {
      try {
        // Ensure Holad directory exists in AppLocalData
        const hasDir = await exists('Holad', { baseDir: BaseDirectory.AppLocalData });
        if (!hasDir) {
          await mkdir('Holad', { baseDir: BaseDirectory.AppLocalData });
        }

        const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);
        await writeFile(`Holad/${fileName}`, uint8Array, { baseDir: BaseDirectory.AppLocalData });
        console.log(`Track ${fileName} saved successfully via Tauri fs`);
      } catch (err) {
        console.error('Error saving track via Tauri:', err);
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

        // Ensure directory exists
        try {
          await Filesystem.stat({ path: 'Holad', directory: Directory.Data });
        } catch (e) {
          await Filesystem.mkdir({ path: 'Holad', directory: Directory.Data });
        }

        await Filesystem.writeFile({
          path: `Holad/${fileName}`,
          data: base64Data,
          directory: Directory.Data
        });
        console.log(`Track ${fileName} saved successfully via Capacitor fs`);
      } catch (err) {
        console.error('Error saving track via Capacitor:', err);
      }
    } else {
      // Browser environment
      console.warn('Browser environment detected. Track downloading for offline use is not supported in plain web.');
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
}

