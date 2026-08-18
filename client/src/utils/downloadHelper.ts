import { isTauri, isCapacitor, StorageManager } from './StorageManager';
import { getDownloadUrl, getAlbumFull, getCoverArtUrl, getSong } from '../api/subsonic';
import { join } from '@tauri-apps/api/path';
import { useDownloadStore, isItemDownloaded } from '../store/downloadStore';
import type { DownloadItem } from '../store/downloadStore';
import { isOffline } from './networkStatus';

const activeAbortControllers = new Map<string, AbortController>();

export const isDownloadActive = (id: string) => {
  return activeAbortControllers.has(id);
};

export const cancelActiveDownload = (id: string) => {
  const controller = activeAbortControllers.get(id);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(id);
  }
  useDownloadStore.getState().cancelDownload(id);
};

const waitIfPaused = async (id: string, signal?: AbortSignal) => {
  while (true) {
    if (signal?.aborted) return;
    const status = useDownloadStore.getState().downloads[id]?.status;
    if (status === 'cancelled' || status === 'error') return;
    if (status !== 'paused') return;
    await new Promise(r => setTimeout(r, 500));
  }
};



const downloadSingleFile = async (
  url: string,
  name: string,
  onProgress?: (loaded: number, total: number) => void,
  downloadDirectory?: string | null,
  subDir?: string,
  signal?: AbortSignal,
  checkPause?: () => Promise<void>
): Promise<{ filePath: string; sizeBytes: number }> => {
  const response = await fetch(url, { signal });
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
    if (checkPause) await checkPause();
    if (signal?.aborted) throw new Error('Aborted');
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      if (onProgress) {
        onProgress(loaded, total);
      }
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
  const contentType = response.headers.get('content-type');
  
  let ext = '.mp3';
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      const parts = match[1].split('.');
      if (parts.length > 1) {
        ext = '.' + parts[parts.length - 1];
      }
    }
  } else if (contentType) {
    if (contentType.includes('audio/flac') || contentType.includes('audio/x-flac')) ext = '.flac';
    else if (contentType.includes('audio/mp4') || contentType.includes('audio/m4a') || contentType.includes('audio/x-m4a')) ext = '.m4a';
    else if (contentType.includes('audio/ogg')) ext = '.ogg';
    else if (contentType.includes('audio/wav') || contentType.includes('audio/x-wav')) ext = '.wav';
    else if (contentType.includes('audio/aac')) ext = '.aac';
    else if (contentType.includes('audio/webm')) ext = '.webm';
    else if (contentType.includes('audio/opus')) ext = '.opus';
    // default remains .mp3
  }

  const safeName = name.replace(/[/\\?%*:|"<>]/g, '-');
  const finalFileName = `${safeName}${ext}`;

  const filePath = await StorageManager.saveTrack(finalFileName, data, downloadDirectory || undefined, subDir);
  return { filePath, sizeBytes: totalLength };
};

const downloadCoverArt = async (
  coverArtIdOrUrl: string,
  coverName: string,
  downloadDirectory?: string | null,
  subDir?: string,
  signal?: AbortSignal
): Promise<{ filePath: string; localUri: string | null } | null> => {
  try {
    const url = coverArtIdOrUrl.startsWith('http') ? coverArtIdOrUrl : getCoverArtUrl(coverArtIdOrUrl, 500);
    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const safeCoverName = coverName.replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${safeCoverName}.jpg`;

    const filePath = await StorageManager.saveCoverArt(fileName, data, downloadDirectory || undefined, subDir || 'covers');
    const localUri = await StorageManager.getLocalCoverUri(filePath);
    return { filePath, localUri };
  } catch (e) {
    console.warn('Cover art download skipped/failed:', e);
    return null;
  }
};

export const handleDownload = async (id: string, name: string, type: 'track' | 'album' = 'track') => {
  if (isTauri() || isCapacitor()) {
    const {
      startDownload,
      completeDownload,
      errorDownload,
      updateProgress,
      updateCurrentTrack,
      downloadDirectory,
      updateItem
    } = useDownloadStore.getState();

    const abortController = new AbortController();
    activeAbortControllers.set(id, abortController);
    const signal = abortController.signal;

    // Register initial downloading state immediately
    startDownload(id, name || id, type);

    try {
      if (type === 'album') {
        const album = await getAlbumFull(id);
        if (signal.aborted) {
          useDownloadStore.getState().cancelDownload(id);
          return;
        }
        const albumName = name === 'album' ? (album.title || album.name || album.album || name) : name;
        const safeAlbumName = albumName.replace(/[/\\?%*:|"<>]/g, '-');
        const remoteCoverUrl = album.coverArt ? getCoverArtUrl(album.coverArt, 500) : undefined;
        
        const rawSongs = album?.song;
        const songs = Array.isArray(rawSongs) ? rawSongs : (rawSongs ? [rawSongs] : []);
        const totalSongs = songs.length;

        updateItem(id, {
          name: albumName,
          coverArt: remoteCoverUrl,
          artist: album.artist,
          album: albumName,
          albumId: album.id,
          totalTrackCount: totalSongs,
          completedTrackCount: 0
        });

        // 1. Download Album Cover Art
        let localCoverArtUri: string | undefined = undefined;
        if (album.coverArt) {
          await waitIfPaused(id, signal);
          if (signal.aborted) {
            useDownloadStore.getState().cancelDownload(id);
            return;
          }
          const coverResult = await downloadCoverArt(album.coverArt, `${safeAlbumName}_cover`, downloadDirectory, 'covers', signal);
          if (signal.aborted) {
            useDownloadStore.getState().cancelDownload(id);
            return;
          }
          if (coverResult?.localUri) {
            localCoverArtUri = coverResult.localUri;
            updateItem(id, { localCoverArtUri });
          }
        }

        if (totalSongs === 0) {
          completeDownload(id, 'album_empty', { localCoverArtUri });
          activeAbortControllers.delete(id);
          return;
        }

        let completedSongs = 0;
        let lastOverallProgress = 0;
        let totalAlbumBytes = 0;

        const subDir = isTauri() ? await join('albums', safeAlbumName) : `albums/${safeAlbumName}`;

        for (const song of songs) {
          await waitIfPaused(id, signal);
          if (signal.aborted) break;
          const trackName = song.title || song.name || 'track';
          updateCurrentTrack(id, trackName);
          const trackUrl = getDownloadUrl(song.id);

          try {
            const { filePath, sizeBytes } = await downloadSingleFile(
              trackUrl,
              trackName,
              (loaded, total) => {
                const songProgress = total > 0 ? (loaded / total) : 0;
                const overallProgress = Math.round(((completedSongs + songProgress) / totalSongs) * 100);
                if (overallProgress > lastOverallProgress) {
                  lastOverallProgress = overallProgress;
                  updateProgress(id, overallProgress);
                }
              },
              downloadDirectory,
              subDir,
              signal,
              () => waitIfPaused(id, signal)
            );

            completedSongs++;
            totalAlbumBytes += sizeBytes;
            updateProgress(id, Math.round((completedSongs / totalSongs) * 100));
            updateItem(id, { completedTrackCount: completedSongs });

            // Index child track into downloadStore
            useDownloadStore.getState().startDownload(song.id, trackName, 'track', remoteCoverUrl, {
              artist: song.artist || album.artist,
              album: albumName,
              albumId: album.id,
              duration: song.duration,
              localCoverArtUri,
              sizeBytes
            });
            useDownloadStore.getState().completeDownload(song.id, filePath, {
              localCoverArtUri,
              artist: song.artist || album.artist,
              album: albumName,
              albumId: album.id,
              duration: song.duration,
              sizeBytes
            });
          } catch (e: any) {
            if (signal.aborted) throw e;
            console.error('Failed to download track', trackName, e);
          }
        }

        if (signal.aborted) {
          useDownloadStore.getState().cancelDownload(id);
          return;
        }

        let albumDir = '';
        if (isTauri()) {
          albumDir = await join(downloadDirectory || await StorageManager.getDefaultDownloadDir(), 'albums', safeAlbumName);
        } else {
          albumDir = `Holad/albums/${safeAlbumName}`;
        }
        completeDownload(id, albumDir, {
          localCoverArtUri,
          sizeBytes: totalAlbumBytes,
          completedTrackCount: completedSongs
        });

      } else {
        // Single track download
        const track = await getSong(id);
        if (signal.aborted) {
          useDownloadStore.getState().cancelDownload(id);
          return;
        }
        const trackName = name || track.title || 'track';
        const remoteCoverUrl = track.coverArt ? getCoverArtUrl(track.coverArt, 500) : undefined;
        
        updateItem(id, {
          name: trackName,
          coverArt: remoteCoverUrl,
          artist: track.artist,
          album: track.album,
          albumId: track.albumId,
          duration: track.duration
        });

        // Download cover art if available
        let localCoverArtUri: string | undefined = undefined;
        if (track.coverArt) {
          await waitIfPaused(id, signal);
          if (signal.aborted) {
            useDownloadStore.getState().cancelDownload(id);
            return;
          }
          const coverResult = await downloadCoverArt(track.coverArt, `track_${id}_cover`, downloadDirectory, 'covers', signal);
          if (signal.aborted) {
            useDownloadStore.getState().cancelDownload(id);
            return;
          }
          if (coverResult?.localUri) {
            localCoverArtUri = coverResult.localUri;
            updateItem(id, { localCoverArtUri });
          }
        }

        await waitIfPaused(id, signal);
        if (signal.aborted) {
          useDownloadStore.getState().cancelDownload(id);
          return;
        }

        let lastTrackProgress = -1;
        const url = getDownloadUrl(id);
        const { filePath, sizeBytes } = await downloadSingleFile(
          url,
          trackName,
          (loaded, total) => {
            if (total > 0) {
              const currentProgress = Math.round((loaded / total) * 100);
              if (currentProgress > lastTrackProgress) {
                lastTrackProgress = currentProgress;
                updateProgress(id, currentProgress, loaded, total);
              }
            }
          },
          downloadDirectory,
          'tracks',
          signal,
          () => waitIfPaused(id, signal)
        );

        if (signal.aborted) {
          useDownloadStore.getState().cancelDownload(id);
          return;
        }

        completeDownload(id, filePath, {
          localCoverArtUri,
          artist: track.artist,
          album: track.album,
          albumId: track.albumId,
          duration: track.duration,
          sizeBytes
        });
      }
    } catch (err: any) {
      if (signal.aborted) {
        console.log(`Download for ${id} cancelled`);
        useDownloadStore.getState().cancelDownload(id);
      } else {
        console.error('Download error:', err);
        errorDownload(id, err instanceof Error ? err.message : String(err));
      }
    } finally {
      activeAbortControllers.delete(id);
    }
  } else {
    // Standard web download
    window.open(getDownloadUrl(id), '_blank');
  }
};

export interface BatchDownloadProgress {
  total: number;
  queued: number;
  skipped: number;
  completed: number;
  failed: number;
  currentName?: string;
  status: 'idle' | 'fetching' | 'enqueuing' | 'downloading' | 'completed' | 'error';
  error?: string;
}

export interface DownloadEntireLibraryResult {
  totalFound: number;
  queuedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * Robustly fetches all albums from Subsonic API to download the entire server library.
 */
export const fetchAllLibrary = async (): Promise<{ songs: any[]; albums: any[] }> => {
  try {
    const { buildUrl, fetchWithRetry } = await import('../api/subsonic-core');
    const url = buildUrl('getAlbumList2', { type: 'newest', size: '50000' });
    const res = await fetchWithRetry(url);
    const data = await res.json();
    const rawAlbums = data['subsonic-response']?.albumList2?.album || [];
    const albums = Array.isArray(rawAlbums) ? rawAlbums : (rawAlbums ? [rawAlbums] : []);
    
    // To also get loose tracks, we can optionally search or get random, 
    // but Subsonic usually groups all music into albums.
    // For safety, we will just return the massive album list.
    return { songs: [], albums };
  } catch (error) {
    console.error('Failed to fetch entire library:', error);
    throw error;
  }
};

/**
 * Deduplicates starred songs and albums against current downloadStore.
 */
export const filterItemsForLibraryDownload = (
  starredSongs: any[],
  starredAlbums: any[],
  downloads: Record<string, DownloadItem>
) => {
  const albumsToQueue: Array<{ id: string; name: string; coverArt?: string }> = [];
  const tracksToQueue: Array<{ id: string; name: string; coverArt?: string; albumId?: string; artist?: string; album?: string; duration?: number; genre?: string; title?: string }> = [];
  const albumIdsToDownload = new Set<string>();

  // 1. Process Starred Albums
  for (const album of starredAlbums) {
    if (!album?.id) continue;
    const albumId = album.id;
    const albumName = album.title || album.name || album.album || 'Album';
    const existing = downloads[albumId];

    if (existing && (existing.status === 'completed' || existing.status === 'downloading' || existing.status === 'queued')) {
      albumIdsToDownload.add(albumId);
      continue;
    }

    albumsToQueue.push({
      id: albumId,
      name: albumName,
      coverArt: album.coverArt
    });
    albumIdsToDownload.add(albumId);
  }

  // 2. Process Starred Tracks
  for (const song of starredSongs) {
    if (!song?.id) continue;
    const songId = song.id;
    const songTitle = song.title || song.name || 'Track';
    const albumId = song.albumId;

    // Check if already completed in downloads
    if (isItemDownloaded(downloads, songId, albumId)) {
      continue;
    }

    const existing = downloads[songId];
    if (existing && (existing.status === 'downloading' || existing.status === 'queued')) {
      continue;
    }

    // Skip if parent album is also queued in this batch
    if (albumId && albumIdsToDownload.has(albumId)) {
      continue;
    }

    tracksToQueue.push({
      id: songId,
      name: songTitle,
      coverArt: song.coverArt,
      albumId: song.albumId,
      artist: song.artist,
      album: song.album,
      duration: song.duration,
      genre: song.genre,
      title: song.title
    });
  }

  const totalCount = starredSongs.length + starredAlbums.length;
  const queuedCount = albumsToQueue.length + tracksToQueue.length;
  const skippedCount = totalCount - queuedCount;

  return { albumsToQueue, tracksToQueue, skippedCount, totalCount };
};

/**
 * Orchestrates downloading entire starred library with bounded concurrency.
 */
export const downloadEntireLibrary = async (
  onProgress?: (progress: BatchDownloadProgress) => void,
  concurrency = 3
): Promise<DownloadEntireLibraryResult> => {
  if (isOffline()) {
    const errorMsg = 'Cannot download library while offline';
    onProgress?.({ total: 0, queued: 0, skipped: 0, completed: 0, failed: 0, status: 'error', error: errorMsg });
    return { totalFound: 0, queuedCount: 0, skippedCount: 0, error: errorMsg };
  }

  onProgress?.({ total: 0, queued: 0, skipped: 0, completed: 0, failed: 0, status: 'fetching' });

  const { songs, albums } = await fetchAllLibrary();
  const downloads = useDownloadStore.getState().downloads;

  const { albumsToQueue, tracksToQueue, skippedCount, totalCount } = filterItemsForLibraryDownload(songs, albums, downloads);

  if (albumsToQueue.length === 0 && tracksToQueue.length === 0) {
    onProgress?.({ total: totalCount, queued: 0, skipped: skippedCount, completed: 0, failed: 0, status: 'completed' });
    return { totalFound: totalCount, queuedCount: 0, skippedCount };
  }

  onProgress?.({ total: totalCount, queued: albumsToQueue.length + tracksToQueue.length, skipped: skippedCount, completed: 0, failed: 0, status: 'enqueuing' });

  const store = useDownloadStore.getState();

  // 1. Enqueue all items to downloadStore immediately for UI reactivity
  for (const alb of albumsToQueue) {
    store.queueDownload(alb.id, alb.name, 'album', alb.coverArt);
  }
  for (const trk of tracksToQueue) {
    store.queueDownload(trk.id, trk.name || trk.title || 'Unknown Track', 'track', trk.coverArt, {
      artist: trk.artist,
      album: trk.album,
      albumId: trk.albumId,
      duration: trk.duration,
      genre: trk.genre,
    });
  }

  // 2. Worker Pool with bounded concurrency
  const queue: Array<{ id: string; name: string; type: 'track' | 'album' }> = [
    ...albumsToQueue.map(a => ({ id: a.id, name: a.name, type: 'album' as const })),
    ...tracksToQueue.map(t => ({ id: t.id, name: t.name, type: 'track' as const }))
  ];

  let completed = 0;
  let failed = 0;
  const totalToDownload = queue.length;

  const worker = async () => {
    while (queue.length > 0) {
      if (isOffline()) {
        console.warn('Network went offline during batch download');
        break;
      }
      const item = queue.shift();
      if (!item) break;

      const currentItemState = useDownloadStore.getState().downloads[item.id];
      if (currentItemState?.status === 'cancelled') {
        continue;
      }

      onProgress?.({
        total: totalCount,
        queued: totalToDownload,
        skipped: skippedCount,
        completed,
        failed,
        currentName: item.name,
        status: 'downloading'
      });

      try {
        await handleDownload(item.id, item.name, item.type);
        completed++;
      } catch (err) {
        console.error(`Failed to download ${item.name}:`, err);
        failed++;
      }
    }
  };

  const poolWorkers = Array.from({ length: Math.min(concurrency, queue.length) }, () => worker());
  await Promise.all(poolWorkers);

  onProgress?.({
    total: totalCount,
    queued: totalToDownload,
    skipped: skippedCount,
    completed,
    failed,
    status: 'completed'
  });

  return {
    totalFound: totalCount,
    queuedCount: totalToDownload,
    skippedCount
  };
};
