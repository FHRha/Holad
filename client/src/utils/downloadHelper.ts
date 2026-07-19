import { isTauri, isCapacitor, StorageManager } from './StorageManager';
import { getDownloadUrl, getAlbumFull, getCoverArtUrl, getSong } from '../api/subsonic';
import { join } from '@tauri-apps/api/path';
import { useDownloadStore } from '../store/downloadStore';

const downloadSingleFile = async (url: string, name: string, onProgress: (loaded: number, total: number) => void, downloadDirectory: string | null, subDir?: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch file');
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  let loaded = 0;

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Failed to read response body');

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
  }

  const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
  const data = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  
  const contentDisposition = response.headers.get('content-disposition');
  let ext = '.mp3';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      const parts = match[1].split('.');
      if (parts.length > 1) {
        ext = '.' + parts[parts.length - 1];
      }
    }
  }

  const safeName = name.replace(/[/\\?%*:|"<>]/g, '-');
  const finalFileName = `${safeName}${ext}`;

  return await StorageManager.saveTrack(finalFileName, data, downloadDirectory || undefined, subDir);
};

export const handleDownload = async (id: string, name: string, type: 'track' | 'album' = 'track') => {
  if (isTauri() || isCapacitor()) {
    const { startDownload, completeDownload, errorDownload, updateProgress, updateCurrentTrack, downloadDirectory } = useDownloadStore.getState();
    try {
      if (type === 'album') {
        const album = await getAlbumFull(id);
        const coverArt = album.coverArt ? getCoverArtUrl(album.coverArt, 300) : undefined;
        const albumName = name === 'album' ? (album.title || album.name || album.album || name) : name;
        const safeAlbumName = albumName.replace(/[/\\?%*:|"<>]/g, '-');
        startDownload(id, albumName, 'album', coverArt);
        
        const songs = album.song || [];
        const totalSongs = songs.length;
        if (totalSongs === 0) {
           completeDownload(id, 'album_empty');
           return;
        }

        let completedSongs = 0;
        let lastOverallProgress = 0;

        for (const song of songs) {
           const trackName = song.title || song.name || 'track';
           updateCurrentTrack(id, trackName);
           const trackUrl = getDownloadUrl(song.id);
           
           try {
             await downloadSingleFile(trackUrl, trackName, (loaded, total) => {
               const songProgress = total > 0 ? (loaded / total) : 0;
               const overallProgress = Math.round(((completedSongs + songProgress) / totalSongs) * 100);
               if (overallProgress > lastOverallProgress) {
                 lastOverallProgress = overallProgress;
                 updateProgress(id, overallProgress);
               }
             }, downloadDirectory, isTauri() ? await join('albums', safeAlbumName) : `albums/${safeAlbumName}`);
             completedSongs++;
             updateProgress(id, Math.round((completedSongs / totalSongs) * 100));
           } catch (e) {
             console.error('Failed to download track', trackName, e);
           }
        }
        
        let albumDir = '';
        if (isTauri()) {
          albumDir = await join(downloadDirectory || await StorageManager.getDefaultDownloadDir(), 'albums', safeAlbumName);
        } else {
          albumDir = `Holad/albums/${safeAlbumName}`;
        }
        completeDownload(id, albumDir);

      } else {
        const track = await getSong(id);
        const coverArt = track.coverArt ? getCoverArtUrl(track.coverArt, 300) : undefined;
        startDownload(id, name, 'track', coverArt);
        console.log(`Starting download for ${name}...`);
        const url = getDownloadUrl(id);
        const savedPath = await downloadSingleFile(url, name, (loaded, total) => {
          if (total > 0) {
            updateProgress(id, Math.round((loaded / total) * 100));
          }
        }, downloadDirectory, 'tracks');
        completeDownload(id, savedPath);
      }
    } catch (err) {
      console.error('Download error:', err);
      errorDownload(id, err instanceof Error ? err.message : String(err));
    }
  } else {
    // Standard web download
    window.open(getDownloadUrl(id), '_blank');
  }
};
