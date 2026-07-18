import { isTauri, isCapacitor, StorageManager } from './StorageManager';
import { getDownloadUrl } from '../api/subsonic';

export const handleDownload = async (id: string, name: string) => {
  const url = getDownloadUrl(id);

  if (isTauri() || isCapacitor()) {
    try {
      console.log(`Starting download for ${name}...`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch file');
      }

      const data = await response.arrayBuffer();
      
      const contentDisposition = response.headers.get('content-disposition');
      let ext = '.mp3'; // Default to mp3 for tracks, or maybe zip for albums
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          const parts = match[1].split('.');
          if (parts.length > 1) {
            ext = '.' + parts[parts.length - 1];
          }
        }
      }

      // Format safe filename
      const safeName = name.replace(/[/\\?%*:|"<>]/g, '-');
      const finalFileName = `${safeName}${ext}`;

      await StorageManager.saveTrack(finalFileName, data);
      alert(`✅ Успешно сохранено: ${finalFileName}\nИщите в локальном хранилище устройства.`);
    } catch (err) {
      console.error('Download error:', err);
      alert(`❌ Ошибка скачивания: ${err}`);
    }
  } else {
    // Standard web download
    window.open(url, '_blank');
  }
};
