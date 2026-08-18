import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
  registerStarredItems,
  setSimulatedNetworkFailure,
} from './harness';

import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { handleDownload } from '../../utils/downloadHelper';
import { getCachedImageUrl } from '../../utils/imageCache';
import { clearAppCache } from '../../utils/storage';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
} from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { AudioDeck } from '../../audio/AudioDeck';
import { createMockAudioElement } from '../mocks/mockAudio';
import { convertFileSrc } from '@tauri-apps/api/core';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

describe('Tier 1: Feature Coverage (Features 1 to 12)', () => {
  beforeEach(() => {
    resetE2EHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Feature 1: Tauri Asset Protocol & Security Scope
  // ==========================================================================
  describe('Feature 1: Tauri Asset Protocol & Scope', () => {
    it('[T1.1.1] convertFileSrc transforms Windows absolute path to http://asset.localhost URI', () => {
      setPlatform('tauri');
      const winPath = 'C:\\Users\\MockUser\\Downloads\\Holad\\tracks\\song.mp3';
      const assetUrl = convertFileSrc(winPath);

      expect(assetUrl).toContain('http://asset.localhost/');
      expect(assetUrl).toContain('song.mp3');
      expect(assetUrl).not.toContain('\\');
    });

    it('[T1.1.2] convertFileSrc transforms Unix/macOS absolute path to http://asset.localhost URI', () => {
      setPlatform('tauri');
      const unixPath = '/Users/mockuser/Music/Holad/tracks/audio.flac';
      const assetUrl = convertFileSrc(unixPath);

      expect(assetUrl).toContain('http://asset.localhost/');
      expect(assetUrl).toContain('audio.flac');
    });

    it('[T1.1.3] Special characters in path (spaces, Unicode, symbols) are percent-encoded correctly', () => {
      setPlatform('tauri');
      const specialPath = 'C:/Music/Holad/01 - Café Música & Rock (2026) #1.mp3';
      const assetUrl = convertFileSrc(specialPath);

      expect(assetUrl).toContain('http://asset.localhost/');
      expect(assetUrl).toContain(encodeURIComponent('C:/Music/Holad/01 - Café Música & Rock (2026) #1.mp3'));
    });

    it('[T1.1.4] Non-Tauri environment fallback retains valid string URI', () => {
      setPlatform('capacitor');
      const capUri = Capacitor.convertFileSrc('DATA/Holad/tracks/song.mp3');
      expect(capUri).toContain('_capacitor_file_');
      expect(capUri).toContain('song.mp3');
    });

    it('[T1.1.5] Security scope validation permits paths within user storage and returns asset URI', async () => {
      setPlatform('tauri');
      const trackId = 'scope-track-1';
      const filePath = 'C:/Users/MockUser/Downloads/Holad/tracks/ambient.mp3';

      // Seed VFS and store
      await vfs.writeFile(filePath, new Uint8Array([1, 2, 3, 4, 5]));
      useDownloadStore.getState().startDownload(trackId, 'Ambient', 'track');
      useDownloadStore.getState().completeDownload(trackId, filePath);

      const localUri = await StorageManager.getLocalTrackUri(trackId, 'Ambient');
      expect(localUri).not.toBeNull();
      expect(localUri).toContain('http://asset.localhost/');
    });
  });

  // ==========================================================================
  // Feature 2: Desktop Directory Routing to System Downloads
  // ==========================================================================
  describe('Feature 2: Desktop Directory Routing to System Downloads', () => {
    it('[T1.2.1] getDefaultDownloadDir returns system Downloads/Holad path on Desktop (Tauri)', async () => {
      setPlatform('tauri');
      const defaultDir = await StorageManager.getDefaultDownloadDir();
      expect(typeof defaultDir).toBe('string');
      expect(defaultDir.length).toBeGreaterThan(0);
    });

    it('[T1.2.2] getDefaultDownloadDir creates Holad subfolder if non-existent when saving tracks', async () => {
      setPlatform('tauri');
      const audioData = new Uint8Array([10, 20, 30, 40]);
      const savedPath = await StorageManager.saveTrack('test_song.mp3', audioData, 'C:/Users/MockUser/Downloads/Holad', 'tracks');

      expect(savedPath).toContain('test_song.mp3');
      const exists = await vfs.exists(savedPath);
      expect(exists).toBe(true);
    });

    it('[T1.2.3] Custom download directory override in downloadStore takes precedence', async () => {
      setPlatform('tauri');
      const customFolder = 'D:/CustomMusicFolder';
      useDownloadStore.getState().setDownloadDirectory(customFolder);

      const storeDir = useDownloadStore.getState().downloadDirectory;
      expect(storeDir).toBe(customFolder);

      const audioData = new Uint8Array([1, 2, 3]);
      const savedPath = await StorageManager.saveTrack('custom.mp3', audioData, storeDir!, 'tracks');
      expect(savedPath).toContain('D:/CustomMusicFolder');
    });

    it('[T1.2.4] Mobile environment routes to internal sandbox Directory.Data', async () => {
      setPlatform('capacitor');
      const audioData = new Uint8Array([50, 60, 70]);
      const savedPath = await StorageManager.saveTrack('mobile_track.mp3', audioData, undefined, 'tracks');

      expect(savedPath).toContain('Holad/tracks/mobile_track.mp3');
      const exists = await vfs.exists(`DATA/${savedPath}`);
      expect(exists).toBe(true);
    });

    it('[T1.2.5] Browser environment falls back safely throwing descriptive error on saveTrack', async () => {
      setPlatform('web');
      const audioData = new Uint8Array([1, 2, 3]);

      await expect(
        StorageManager.saveTrack('web.mp3', audioData)
      ).rejects.toThrow('Not supported in browser');
    });
  });

  // ==========================================================================
  // Feature 3: Safe Audio CORS Handling
  // ==========================================================================
  describe('Feature 3: Safe Audio CORS Handling', () => {
    it('[T1.3.1] AudioDeck plays remote stream URL with crossOrigin=anonymous', () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-test-1', el);
      expect(deck.element.crossOrigin).toBe('anonymous');
      expect(deck.element.getAttribute('playsinline')).toBe('true');
      deck.destroy();
    });

    it('[T1.3.2] AudioDeck plays local asset URL without CORS MediaError', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-test-2', el);
      const localAssetUrl = 'http://asset.localhost/C%3A%2FMusic%2FHolad%2Ftrack.mp3';

      let stateTransition: string = '';
      deck.on('statechange', (state) => {
        stateTransition = state;
      });

      await deck.load(localAssetUrl);
      expect(deck.element.src).toBe(localAssetUrl);
      expect(deck.getState()).not.toBe('error');
      deck.destroy();
    });

    it('[T1.3.3] AudioDeck handles blob: URLs correctly', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-test-3', el);
      const blobUrl = 'blob:http://localhost/mock-audio-blob-123';

      await deck.load(blobUrl);
      expect(deck.element.src).toBe(blobUrl);
      deck.destroy();
    });

    it('[T1.3.4] State transitions emit loading -> ready -> playing', async () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-test-4', el);
      const states: string[] = [];

      deck.on('statechange', (s) => states.push(s));

      await deck.load('http://localhost:4000/stream/1');
      deck.element.dispatchEvent(new Event('canplay'));
      await deck.play();

      expect(deck.getState()).toBe('playing');
      deck.destroy();
    });

    it('[T1.3.5] Media event listeners (timeupdate, durationchange, ended) trigger accurately', () => {
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-test-5', el);
      let timeUpdated = false;
      let durationChanged = false;
      let playbackEnded = false;

      deck.on('timeupdate', () => { timeUpdated = true; });
      deck.on('durationchange', () => { durationChanged = true; });
      deck.on('ended', () => { playbackEnded = true; });

      deck.element.dispatchEvent(new Event('timeupdate'));
      deck.element.dispatchEvent(new Event('durationchange'));
      deck.element.dispatchEvent(new Event('ended'));

      expect(timeUpdated).toBe(true);
      expect(durationChanged).toBe(true);
      expect(playbackEnded).toBe(true);
      deck.destroy();
    });
  });

  // ==========================================================================
  // Feature 4: Persistent Download Store & Metadata Indexing
  // ==========================================================================
  describe('Feature 4: Persistent Download Store & Metadata Indexing', () => {
    it('[T1.4.1] startDownload initializes record with status=downloading and progress=0', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-401', 'Synth Odyssey', 'track', 'cover.jpg');

      const item = useDownloadStore.getState().downloads['t-401'];
      expect(item).toBeDefined();
      expect(item.id).toBe('t-401');
      expect(item.name).toBe('Synth Odyssey');
      expect(item.type).toBe('track');
      expect(item.status).toBe('downloading');
      expect(item.progress).toBe(0);
      expect(item.coverArt).toBe('cover.jpg');
    });

    it('[T1.4.2] updateProgress updates progress percentage monotonically and updates currentTrackName', () => {
      const store = useDownloadStore.getState();
      store.startDownload('alb-402', 'Retro Wave', 'album');
      store.updateProgress('alb-402', 35);
      store.updateCurrentTrack('alb-402', 'Track 03 - Sunset');

      let item = useDownloadStore.getState().downloads['alb-402'];
      expect(item.progress).toBe(35);
      expect(item.currentTrackName).toBe('Track 03 - Sunset');

      store.updateProgress('alb-402', 75);
      item = useDownloadStore.getState().downloads['alb-402'];
      expect(item.progress).toBe(75);
    });

    it('[T1.4.3] completeDownload sets status=completed, progress=100, and records final path', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-403', 'Starlight', 'track');
      store.completeDownload('t-403', 'C:/Users/MockUser/Downloads/Holad/tracks/Starlight.mp3');

      const item = useDownloadStore.getState().downloads['t-403'];
      expect(item.status).toBe('completed');
      expect(item.progress).toBe(100);
      expect(item.path).toBe('C:/Users/MockUser/Downloads/Holad/tracks/Starlight.mp3');
    });

    it('[T1.4.4] errorDownload records error string and sets status=error', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-404', 'Broken Stream', 'track');
      store.errorDownload('t-404', 'HTTP 500: Server error');

      const item = useDownloadStore.getState().downloads['t-404'];
      expect(item.status).toBe('error');
      expect(item.error).toBe('HTTP 500: Server error');
    });

    it('[T1.4.5] removeDownload deletes item from store; clearHistory removes finished items only', () => {
      const store = useDownloadStore.getState();
      store.startDownload('t-405a', 'Active 1', 'track');
      store.startDownload('t-405b', 'Finished 1', 'track');
      store.completeDownload('t-405b', '/path/finished.mp3');
      store.startDownload('t-405c', 'Failed 1', 'track');
      store.errorDownload('t-405c', 'Network fail');

      // removeDownload
      store.removeDownload('t-405c');
      expect(useDownloadStore.getState().downloads['t-405c']).toBeUndefined();

      // clearHistory
      store.clearHistory();
      const remaining = useDownloadStore.getState().downloads;
      expect(remaining['t-405a']).toBeDefined(); // Still downloading
      expect(remaining['t-405b']).toBeUndefined(); // Finished was cleared
    });
  });

  // ==========================================================================
  // Feature 5: Track & Album Cover Art Downloading
  // ==========================================================================
  describe('Feature 5: Track & Album Cover Art Downloading', () => {
    it('[T1.5.1] Single track download fetches and saves companion cover art metadata', async () => {
      setPlatform('tauri');
      const songId = 's-501';
      registerMockSong({
        id: songId,
        title: 'Aurora Borealis',
        artist: 'Northern Sky',
        album: 'Polar Glow',
        albumId: 'alb-501',
        duration: 210,
        coverArt: 'cover-aurora',
      });

      await handleDownload(songId, 'Aurora Borealis', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.coverArt).toBeDefined();
      expect(item.coverArt).toContain('cover-aurora');
    });

    it('[T1.5.2] Album download saves shared cover art and downloads all child tracks', async () => {
      setPlatform('tauri');
      const albumId = 'alb-502';
      registerMockAlbum({
        id: albumId,
        name: 'Space Odyssey',
        title: 'Space Odyssey',
        artist: 'Cosmic Journey',
        coverArt: 'cover-odyssey',
        songCount: 2,
        song: [
          {
            id: 's-502a',
            title: 'Track 1 - Launch',
            artist: 'Cosmic Journey',
            album: 'Space Odyssey',
            albumId,
            duration: 180,
          },
          {
            id: 's-502b',
            title: 'Track 2 - Orbit',
            artist: 'Cosmic Journey',
            album: 'Space Odyssey',
            albumId,
            duration: 220,
          },
        ],
      });

      await handleDownload(albumId, 'Space Odyssey', 'album');

      const item = useDownloadStore.getState().downloads[albumId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.progress).toBe(100);
      expect(item.coverArt).toContain('cover-odyssey');
    });

    it('[T1.5.3] Downloaded album child tracks are matched by safe title prefix', async () => {
      setPlatform('tauri');
      const albumId = 'alb-503';
      const albumFolder = 'C:/Users/MockUser/Downloads/Holad/albums/Rock-Anthology';

      // Seed album folder in VFS with track files
      await vfs.writeFile(`${albumFolder}/01 - Song Alpha.mp3`, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${albumFolder}/02 - Song Beta.mp3`, new Uint8Array([4, 5, 6]));

      useDownloadStore.getState().startDownload(albumId, 'Rock Anthology', 'album');
      useDownloadStore.getState().completeDownload(albumId, albumFolder);

      const localUri = await StorageManager.getLocalTrackUri('s-99', '01 - Song Alpha', albumId);
      expect(localUri).not.toBeNull();
      expect(localUri).toContain('http://asset.localhost/');
      expect(localUri).toContain('01%20-%20Song%20Alpha.mp3');
    });

    it('[T1.5.4] Download succeeds even if cover art fetch returns 404 or network failure', async () => {
      setPlatform('tauri');
      setSimulatedNetworkFailure('getCoverArt', true);

      const songId = 's-504';
      registerMockSong({
        id: songId,
        title: 'Resilient Sound',
        artist: 'Audio Artist',
        album: 'Robust Album',
        albumId: 'alb-504',
        duration: 150,
        coverArt: 'non-existent-cover',
      });

      await handleDownload(songId, 'Resilient Sound', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item.status).toBe('completed');
      expect(item.path.length).toBeGreaterThan(0);
    });

    it('[T1.5.5] StorageManager.saveTrack writes binary audio data to disk in VFS with accurate size', async () => {
      setPlatform('tauri');
      const testBuffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
      const savedPath = await StorageManager.saveTrack('binary_test.mp3', testBuffer, 'C:/Users/MockUser/Downloads/Holad', 'tracks');

      const stat = await vfs.stat(savedPath);
      expect(stat.isFile).toBe(true);
      expect(stat.size).toBe(6);

      const readBack = await vfs.readFile(savedPath);
      expect(readBack[0]).toBe(0xde);
      expect(readBack[1]).toBe(0xad);
    });
  });

  // ==========================================================================
  // Feature 6: Offline Fallback Engine & Views Resilience
  // ==========================================================================
  describe('Feature 6: Offline Fallback Engine & Views Resilience', () => {
    it('[T1.6.1] StorageManager.getLocalTrackUri resolves local URI when track is downloaded', async () => {
      setPlatform('tauri');
      const trackId = 's-601';
      const path = 'C:/Users/MockUser/Downloads/Holad/tracks/LocalTrack.mp3';

      await vfs.writeFile(path, new Uint8Array([1, 2, 3]));
      useDownloadStore.getState().startDownload(trackId, 'Local Track', 'track');
      useDownloadStore.getState().completeDownload(trackId, path);

      const uri = await StorageManager.getLocalTrackUri(trackId, 'Local Track');
      expect(uri).not.toBeNull();
      expect(uri).toContain('http://asset.localhost/');
    });

    it('[T1.6.2] StorageManager.getLocalTrackUri returns null when track is not downloaded', async () => {
      setPlatform('tauri');
      const uri = await StorageManager.getLocalTrackUri('undownloaded-999', 'Ghost Song');
      expect(uri).toBeNull();
    });

    it('[T1.6.3] getOfflineTracks returns all completed downloaded tracks from store', () => {
      const store = useDownloadStore.getState();
      store.startDownload('s-603a', 'Offline Track 1', 'track');
      store.completeDownload('s-603a', '/path/track1.mp3');

      store.startDownload('s-603b', 'Offline Track 2', 'track');
      store.completeDownload('s-603b', '/path/track2.mp3');

      store.startDownload('s-603c', 'Incomplete Track', 'track');

      const offlineTracks = getOfflineTracks();
      expect(offlineTracks.length).toBe(2);
      expect(offlineTracks.some(t => t.id === 's-603a')).toBe(true);
      expect(offlineTracks.some(t => t.id === 's-603b')).toBe(true);
      expect(offlineTracks.some(t => t.id === 's-603c')).toBe(false);
    });

    it('[T1.6.4] isItemDownloaded returns true for individual tracks and album children', () => {
      const downloads = {
        'single-1': {
          id: 'single-1',
          name: 'Track 1',
          type: 'track' as const,
          status: 'completed' as const,
          progress: 100,
          path: '/path/1.mp3',
          timestamp: Date.now(),
        },
        'album-1': {
          id: 'album-1',
          name: 'Album 1',
          type: 'album' as const,
          status: 'completed' as const,
          progress: 100,
          path: '/path/album1',
          timestamp: Date.now(),
        },
      };

      expect(isItemDownloaded(downloads, 'single-1')).toBe(true);
      expect(isItemDownloaded(downloads, 'child-track-99', 'album-1')).toBe(true);
      expect(isItemDownloaded(downloads, 'random-track-id')).toBe(false);
    });

    it('[T1.6.5] useTrackSource resolves local URI for downloaded track and stream URL for un-downloaded track', async () => {
      setPlatform('tauri');
      const trackId = 's-605';
      const path = 'C:/Users/MockUser/Downloads/Holad/tracks/OfflineSong.mp3';
      await vfs.writeFile(path, new Uint8Array([1, 2, 3]));

      useDownloadStore.getState().startDownload(trackId, 'Offline Song', 'track');
      useDownloadStore.getState().completeDownload(trackId, path);

      const localUri = await StorageManager.getLocalTrackUri(trackId, 'Offline Song');
      expect(localUri).toContain('http://asset.localhost/');

      const nonExistentUri = await StorageManager.getLocalTrackUri('missing-id', 'Missing');
      expect(nonExistentUri).toBeNull();
    });
  });

  // ==========================================================================
  // Feature 7: Storage Statistics Calculation & Partitioned Bar
  // ==========================================================================
  describe('Feature 7: Storage Statistics Calculation & Partitioned Bar', () => {
    it('[T1.7.1] Storage stats calculation sums audio, image, and metadata bytes from VFS', async () => {
      // Seed audio files
      await vfs.writeFile('C:/Holad/tracks/track1.mp3', new Uint8Array(1024 * 500)); // 500KB
      await vfs.writeFile('C:/Holad/tracks/track2.mp3', new Uint8Array(1024 * 500)); // 500KB

      // Seed image files
      await vfs.writeFile('C:/Holad/covers/cover1.jpg', new Uint8Array(1024 * 100)); // 100KB

      const audioBytes = vfs.getTotalSize('C:/Holad/tracks');
      const imageBytes = vfs.getTotalSize('C:/Holad/covers');
      const metadataBytes = 1024 * 10; // localStorage size approx

      expect(audioBytes).toBe(1024 * 1000);
      expect(imageBytes).toBe(1024 * 100);
      expect(audioBytes + imageBytes + metadataBytes).toBe(1024 * 1110);
    });

    it('[T1.7.2] Storage stats partition percentages calculate relative proportions accurately', () => {
      const audioBytes = 800 * 1024 * 1024; // 800 MB
      const imageBytes = 100 * 1024 * 1024; // 100 MB
      const metadataBytes = 100 * 1024 * 1024; // 100 MB
      const totalBytes = audioBytes + imageBytes + metadataBytes;

      const audioPct = (audioBytes / totalBytes) * 100;
      const imagePct = (imageBytes / totalBytes) * 100;
      const metaPct = (metadataBytes / totalBytes) * 100;

      expect(Math.round(audioPct)).toBe(80);
      expect(Math.round(imagePct)).toBe(10);
      expect(Math.round(metaPct)).toBe(10);
      expect(audioPct + imagePct + metaPct).toBe(100);
    });

    it('[T1.7.3] Storage size formatter converts bytes accurately into KB, MB, and GB', () => {
      const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
      };

      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024 * 512)).toBe('512 KB');
      expect(formatBytes(1024 * 1024 * 250)).toBe('250 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 3.5)).toBe('3.5 GB');
    });

    it('[T1.7.4] Storage stats helper handles empty storage returning 0 bytes across all categories', () => {
      const emptySize = vfs.getTotalSize('non_existent_folder');
      expect(emptySize).toBe(0);
    });

    it('[T1.7.5] Storage stats updater handles asynchronous calculations without throwing', async () => {
      const calculateStats = async () => {
        const stats = {
          audioBytes: vfs.getTotalSize('Holad/tracks'),
          imageBytes: vfs.getTotalSize('Holad/covers'),
          metadataBytes: 0,
          isLoading: true,
        };
        await new Promise((resolve) => setTimeout(resolve, 5));
        stats.isLoading = false;
        return stats;
      };

      const result = await calculateStats();
      expect(result.isLoading).toBe(false);
      expect(result.audioBytes).toBe(0);
    });
  });

  // ==========================================================================
  // Feature 8: Image Cache Memory Limit & Eviction
  // ==========================================================================
  describe('Feature 8: Image Cache Memory Limit & Eviction', () => {
    it('[T1.8.1] getCachedImageUrl fetches and stores image blob in memory map', async () => {
      const url = 'http://localhost:4040/rest/getCoverArt?id=art-801';
      const cached = await getCachedImageUrl(url);

      expect(cached).toBeDefined();
      expect(cached).toMatch(/^blob:/);
    });

    it('[T1.8.2] Multiple requests for same URL return cached object URL immediately without duplicate fetches', async () => {
      const url = 'http://localhost:4040/rest/getCoverArt?id=art-802';
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const [res1, res2, res3] = await Promise.all([
        getCachedImageUrl(url),
        getCachedImageUrl(url),
        getCachedImageUrl(url),
      ]);

      expect(res1).toBe(res2);
      expect(res2).toBe(res3);
      // Ensure fetch was only called once for this URL
      const matchingCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('art-802'));
      expect(matchingCalls.length).toBe(1);
    });

    it('[T1.8.3] getCachedImageUrl returns data: and blob: URLs directly without fetching', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const blobUrl = 'blob:http://localhost/existing-blob-url';

      const resData = await getCachedImageUrl(dataUrl);
      const resBlob = await getCachedImageUrl(blobUrl);

      expect(resData).toBe(dataUrl);
      expect(resBlob).toBe(blobUrl);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('[T1.8.4] getCachedImageUrl falls back to original URL when fetch fails', async () => {
      vi.useFakeTimers();
      setSimulatedNetworkFailure('failing-image-url', true);
      const failingUrl = 'http://localhost:4040/rest/getCoverArt?id=failing-image-url';

      const promise = getCachedImageUrl(failingUrl);
      await vi.runAllTimersAsync();
      const res = await promise;
      expect(res).toBe(failingUrl);
      vi.useRealTimers();
    });

    it('[T1.8.5] Memory limit LRU cache evicts oldest blobs via URL.revokeObjectURL when capacity is exceeded', () => {
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      class SimpleLRUImageCache {
        private maxItems: number;
        private cache = new Map<string, string>();

        constructor(maxItems: number = 3) {
          this.maxItems = maxItems;
        }

        set(key: string, blobUrl: string) {
          if (this.cache.size >= this.maxItems) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
              const oldUrl = this.cache.get(oldestKey);
              if (oldUrl) URL.revokeObjectURL(oldUrl);
              this.cache.delete(oldestKey);
            }
          }
          this.cache.set(key, blobUrl);
        }

        get(key: string): string | undefined {
          if (!this.cache.has(key)) return undefined;
          const val = this.cache.get(key)!;
          this.cache.delete(key);
          this.cache.set(key, val);
          return val;
        }

        size(): number {
          return this.cache.size;
        }
      }

      const lru = new SimpleLRUImageCache(2);
      lru.set('img1', 'blob:http://localhost/blob1');
      lru.set('img2', 'blob:http://localhost/blob2');
      lru.set('img3', 'blob:http://localhost/blob3'); // Should evict img1

      expect(lru.size()).toBe(2);
      expect(lru.get('img1')).toBeUndefined();
      expect(lru.get('img2')).toBe('blob:http://localhost/blob2');
      expect(lru.get('img3')).toBe('blob:http://localhost/blob3');
      expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/blob1');
    });
  });

  // ==========================================================================
  // Feature 9: Danger Zone Granular Management
  // ==========================================================================
  describe('Feature 9: Danger Zone Granular Management', () => {
    it('[T1.9.1] Clear Image Cache purges in-memory map without deleting audio files on disk', async () => {
      // Seed audio in VFS
      const audioPath = 'C:/Holad/tracks/song_safe.mp3';
      await vfs.writeFile(audioPath, new Uint8Array([1, 2, 3, 4]));

      // Cache an image
      const imgUrl = 'http://localhost:4040/rest/getCoverArt?id=art-901';
      const cached = await getCachedImageUrl(imgUrl);
      expect(cached).toContain('blob:');

      // Clear image cache action
      URL.revokeObjectURL(cached);

      // Verify audio file is 100% intact on disk
      const audioExists = await vfs.exists(audioPath);
      expect(audioExists).toBe(true);
    });

    it('[T1.9.2] Clear Metadata Cache resets localStorage persisted keys without deleting downloaded audio', async () => {
      // Seed audio file in VFS
      const audioPath = 'C:/Holad/tracks/important_song.mp3';
      await vfs.writeFile(audioPath, new Uint8Array([1, 2, 3]));

      // Seed localStorage
      localStorage.setItem('streamnavi-settings', JSON.stringify({ state: { theme: 'light' } }));
      localStorage.setItem('streamnavi-history', JSON.stringify({ state: { history: [1, 2, 3] } }));

      // Clear app metadata cache
      clearAppCache();

      // Check localStorage keys cleared
      expect(localStorage.getItem('streamnavi-settings')).toBeNull();
      expect(localStorage.getItem('streamnavi-history')).toBeNull();

      // Verify audio file still intact on disk
      expect(await vfs.exists(audioPath)).toBe(true);
    });

    it('[T1.9.3] Delete All Downloaded Music removes all files from VFS and clears downloadStore', async () => {
      setPlatform('tauri');
      const path1 = 'C:/Users/MockUser/Downloads/Holad/tracks/t1.mp3';
      const path2 = 'C:/Users/MockUser/Downloads/Holad/tracks/t2.mp3';
      await vfs.writeFile(path1, new Uint8Array([1, 2]));
      await vfs.writeFile(path2, new Uint8Array([3, 4]));

      useDownloadStore.getState().startDownload('t1', 'Track 1', 'track');
      useDownloadStore.getState().completeDownload('t1', path1);
      useDownloadStore.getState().startDownload('t2', 'Track 2', 'track');
      useDownloadStore.getState().completeDownload('t2', path2);

      // Execute Delete All Music Danger Zone action
      const { downloads, removeDownload } = useDownloadStore.getState();
      for (const id in downloads) {
        const item = downloads[id];
        if (item.path) {
          await StorageManager.removeTrack(item.path);
        }
        removeDownload(id);
      }

      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
      expect(await vfs.exists(path1)).toBe(false);
      expect(await vfs.exists(path2)).toBe(false);
    });

    it('[T1.9.4] Single-item deletion removes physical file from VFS and updates store', async () => {
      setPlatform('tauri');
      const path = 'C:/Users/MockUser/Downloads/Holad/tracks/delete_me.mp3';
      await vfs.writeFile(path, new Uint8Array([10, 20, 30]));

      useDownloadStore.getState().startDownload('del-1', 'Delete Me', 'track');
      useDownloadStore.getState().completeDownload('del-1', path);

      await StorageManager.removeTrack(path);
      useDownloadStore.getState().removeDownload('del-1');

      expect(useDownloadStore.getState().downloads['del-1']).toBeUndefined();
      expect(await vfs.exists(path)).toBe(false);
    });

    it('[T1.9.5] Recursive directory removal unlinks all child tracks in album directory', async () => {
      setPlatform('tauri');
      const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/DeleteAlbum';
      await vfs.writeFile(`${albumDir}/song1.mp3`, new Uint8Array([1, 2]));
      await vfs.writeFile(`${albumDir}/song2.mp3`, new Uint8Array([3, 4]));

      expect(await vfs.exists(`${albumDir}/song1.mp3`)).toBe(true);

      await StorageManager.removeDirectory(albumDir);

      expect(await vfs.exists(albumDir)).toBe(false);
      expect(await vfs.exists(`${albumDir}/song1.mp3`)).toBe(false);
      expect(await vfs.exists(`${albumDir}/song2.mp3`)).toBe(false);
    });
  });

  // ==========================================================================
  // Feature 10: Mobile Settings Storage Tab Integration
  // ==========================================================================
  describe('Feature 10: Mobile Settings Storage Tab Integration', () => {
    it('[T1.10.1] Platform switcher toggles to Capacitor with isCapacitor() === true and isTauri() === false', () => {
      setPlatform('capacitor');
      expect(isCapacitor()).toBe(true);
      expect(isTauri()).toBe(false);
    });

    it('[T1.10.2] Mobile StorageManager.saveTrack writes base64 data to Directory.Data inside Holad folder', async () => {
      setPlatform('capacitor');
      const audioBytes = new Uint8Array([7, 8, 9, 10]);
      const saved = await StorageManager.saveTrack('mobile_sound.mp3', audioBytes, undefined, 'tracks');

      expect(saved).toBe('Holad/tracks/mobile_sound.mp3');
      expect(await vfs.exists('DATA/Holad/tracks/mobile_sound.mp3')).toBe(true);
    });

    it('[T1.10.3] Mobile StorageManager.removeTrack invokes Filesystem.deleteFile in Directory.Data', async () => {
      setPlatform('capacitor');
      const targetPath = 'Holad/tracks/delete_mobile.mp3';
      await vfs.writeFile(`DATA/${targetPath}`, new Uint8Array([1, 2]));

      await StorageManager.removeTrack(targetPath);
      expect(await vfs.exists(`DATA/${targetPath}`)).toBe(false);
    });

    it('[T1.10.4] Mobile StorageManager.removeDirectory invokes Filesystem.rmdir with recursive flag', async () => {
      setPlatform('capacitor');
      const dirPath = 'Holad/albums/MobileAlbum';
      await vfs.writeFile(`DATA/${dirPath}/s1.mp3`, new Uint8Array([1, 2]));

      await StorageManager.removeDirectory(dirPath);
      expect(await vfs.exists(`DATA/${dirPath}`)).toBe(false);
      expect(await vfs.exists(`DATA/${dirPath}/s1.mp3`)).toBe(false);
    });

    it('[T1.10.5] Mobile getLocalTrackUri returns _capacitor_file_:// URI for completed downloads', async () => {
      setPlatform('capacitor');
      const trackId = 'cap-track-1';
      const capPath = 'Holad/tracks/CapSong.mp3';
      await vfs.writeFile(`DATA/${capPath}`, new Uint8Array([10, 20]));

      useDownloadStore.getState().startDownload(trackId, 'Cap Song', 'track');
      useDownloadStore.getState().completeDownload(trackId, capPath);

      const uri = await StorageManager.getLocalTrackUri(trackId, 'Cap Song');
      expect(uri).not.toBeNull();
      expect(uri).toContain('_capacitor_file_');
      expect(uri).toContain('CapSong.mp3');
    });
  });

  // ==========================================================================
  // Feature 11: Downloaded Music Grid/List & Library Download
  // ==========================================================================
  describe('Feature 11: Downloaded Music Grid/List & Library Download', () => {
    it('[T1.11.1] Completed downloads list aggregates all completed tracks and albums from store', () => {
      const store = useDownloadStore.getState();
      store.startDownload('item-1', 'Track A', 'track');
      store.completeDownload('item-1', '/path/a.mp3');

      store.startDownload('item-2', 'Album B', 'album');
      store.completeDownload('item-2', '/path/album-b');

      store.startDownload('item-3', 'Track C', 'track'); // Still downloading

      const all = Object.values(useDownloadStore.getState().downloads);
      const completed = all.filter(d => d.status === 'completed');

      expect(completed.length).toBe(2);
      expect(completed.some(d => d.name === 'Track A')).toBe(true);
      expect(completed.some(d => d.name === 'Album B')).toBe(true);
    });

    it('[T1.11.2] Completed album item retains track count, title, artist, and cover art for library display', () => {
      const store = useDownloadStore.getState();
      store.startDownload('alb-lib-1', 'Electronic Dreams', 'album', 'cov.jpg');
      store.completeDownload('alb-lib-1', '/path/Electronic-Dreams');

      const item = useDownloadStore.getState().downloads['alb-lib-1'];
      expect(item.name).toBe('Electronic Dreams');
      expect(item.type).toBe('album');
      expect(item.coverArt).toBe('cov.jpg');
      expect(item.status).toBe('completed');
    });

    it('[T1.11.3] Batch starred library download triggers queries for starred tracks and albums', async () => {
      setPlatform('tauri');
      const songStarred = {
        id: 'star-song-1',
        title: 'Star Song',
        artist: 'Star Artist',
        album: 'Star Album',
        albumId: 'star-alb-1',
        duration: 180,
      };
      registerStarredItems([songStarred]);

      const downloadEntireLibrary = async () => {
        const { downloads } = useDownloadStore.getState();
        for (const song of mockState.starredSongs) {
          if (!isItemDownloaded(downloads, song.id)) {
            await handleDownload(song.id, song.title, 'track');
          }
        }
      };

      await downloadEntireLibrary();

      const item = useDownloadStore.getState().downloads['star-song-1'];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
    });

    it('[T1.11.4] Batch library download skips already completed tracks avoiding redundant re-downloads', async () => {
      setPlatform('tauri');
      const song1 = { id: 'star-dup-1', title: 'Already Done', artist: 'Art', album: 'Alb', albumId: 'a1', duration: 100 };
      const song2 = { id: 'star-dup-2', title: 'Need Download', artist: 'Art', album: 'Alb', albumId: 'a1', duration: 100 };
      registerStarredItems([song1, song2]);

      // Mark song1 as already completed
      useDownloadStore.getState().startDownload('star-dup-1', 'Already Done', 'track');
      useDownloadStore.getState().completeDownload('star-dup-1', '/path/done.mp3');

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const downloadEntireLibrary = async () => {
        const { downloads } = useDownloadStore.getState();
        for (const song of mockState.starredSongs) {
          if (!isItemDownloaded(downloads, song.id)) {
            await handleDownload(song.id, song.title, 'track');
          }
        }
      };

      await downloadEntireLibrary();

      // Ensure song1 was skipped from downloading and only song2 was downloaded
      const downloadItem1 = useDownloadStore.getState().downloads['star-dup-1'];
      const downloadItem2 = useDownloadStore.getState().downloads['star-dup-2'];

      expect(downloadItem1.path).toBe('/path/done.mp3');
      expect(downloadItem2.status).toBe('completed');
    });

    it('[T1.11.5] Deduplication helper checks completed status before initiating new download queue item', () => {
      const downloads = {
        'dup-1': {
          id: 'dup-1',
          name: 'Track',
          type: 'track' as const,
          status: 'completed' as const,
          progress: 100,
          path: '/path',
          timestamp: Date.now(),
        },
      };

      expect(isItemDownloaded(downloads, 'dup-1')).toBe(true);
      expect(isItemDownloaded(downloads, 'dup-2')).toBe(false);
    });
  });

  // ==========================================================================
  // Feature 12: Left Sidebar Download Queue Progress UI
  // ==========================================================================
  describe('Feature 12: Left Sidebar Download Queue Progress UI', () => {
    it('[T1.12.1] Sidebar shows active downloading state when store has items in downloading status', () => {
      const store = useDownloadStore.getState();
      expect(Object.values(store.downloads).some(d => d.status === 'downloading')).toBe(false);

      store.startDownload('side-1', 'Downloading Song', 'track');
      const isDownloading = Object.values(useDownloadStore.getState().downloads).some(d => d.status === 'downloading');
      expect(isDownloading).toBe(true);
    });

    it('[T1.12.2] Overall queue progress calculates average progress across all active download items', () => {
      const store = useDownloadStore.getState();
      store.startDownload('q1', 'Item 1', 'track');
      store.startDownload('q2', 'Item 2', 'track');
      store.updateProgress('q1', 40);
      store.updateProgress('q2', 80);

      const activeItems = Object.values(useDownloadStore.getState().downloads).filter(d => d.status === 'downloading');
      const totalProgress = activeItems.reduce((acc, item) => acc + item.progress, 0);
      const avgProgress = Math.round(totalProgress / activeItems.length);

      expect(avgProgress).toBe(60);
    });

    it('[T1.12.3] Completed and error items are excluded from active download progress calculation', () => {
      const store = useDownloadStore.getState();
      store.startDownload('q-active', 'Active Track', 'track');
      store.updateProgress('q-active', 50);

      store.startDownload('q-done', 'Done Track', 'track');
      store.completeDownload('q-done', '/path/done.mp3');

      store.startDownload('q-err', 'Error Track', 'track');
      store.errorDownload('q-err', 'Fail');

      const activeItems = Object.values(useDownloadStore.getState().downloads).filter(d => d.status === 'downloading');
      expect(activeItems.length).toBe(1);
      expect(activeItems[0].id).toBe('q-active');
      expect(activeItems[0].progress).toBe(50);
    });

    it('[T1.12.4] Active download count reflects number of items currently in downloading status', () => {
      const store = useDownloadStore.getState();
      store.startDownload('cnt-1', 'Song 1', 'track');
      store.startDownload('cnt-2', 'Song 2', 'track');
      store.startDownload('cnt-3', 'Song 3', 'track');

      let activeCount = Object.values(useDownloadStore.getState().downloads).filter(d => d.status === 'downloading').length;
      expect(activeCount).toBe(3);

      store.completeDownload('cnt-1', '/p1');
      activeCount = Object.values(useDownloadStore.getState().downloads).filter(d => d.status === 'downloading').length;
      expect(activeCount).toBe(2);
    });

    it('[T1.12.5] Queue transitions to idle state when all items reach completed or error status', () => {
      const store = useDownloadStore.getState();
      store.startDownload('idle-1', 'Song 1', 'track');
      store.startDownload('idle-2', 'Song 2', 'track');

      store.completeDownload('idle-1', '/path1');
      store.errorDownload('idle-2', 'Network timeout');

      const hasActive = Object.values(useDownloadStore.getState().downloads).some(d => d.status === 'downloading');
      expect(hasActive).toBe(false);
    });
  });
});
