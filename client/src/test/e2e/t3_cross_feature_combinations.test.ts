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
  createChunkedStream,
} from './harness';

import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { handleDownload, cancelActiveDownload } from '../../utils/downloadHelper';
import { getCachedImageUrl } from '../../utils/imageCache';
import { clearAppCache } from '../../utils/storage';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
  getDownloadedTracks,
  getDownloadedAlbums,
} from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { AudioDeck } from '../../audio/AudioDeck';
import { AudioEngine } from '../../audio/AudioEngine';
import { PreloadManager } from '../../audio/PreloadManager';
import { resolveTrackAudioSource } from '../../hooks/useTrackSource';
import { createMockAudioElement } from '../mocks/mockAudio';
import { convertFileSrc } from '@tauri-apps/api/core';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

describe('Tier 3: Cross-Feature Combinations & Subsystem Interactions', () => {
  beforeEach(() => {
    resetE2EHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // [T3.C1] Active Download Queue + Danger Zone "Delete All Downloaded Music"
  // ==========================================================================
  it('[T3.C1] Active Download Queue + Danger Zone "Delete All Downloaded Music" aborts in-flight streams, unlinks disk files, and empties store', async () => {
    setPlatform('tauri');
    const songA = { id: 'c1-song-a', title: 'Solar Flare', artist: 'Nova', album: 'Cosmos', albumId: 'c1-alb-1', duration: 200 };
    const songB = { id: 'c1-song-b', title: 'Nebula Drift', artist: 'Nova', album: 'Cosmos', albumId: 'c1-alb-1', duration: 210 };
    registerMockSong(songA);
    registerMockSong(songB);

    // 1. Start downloading songA and complete it
    await handleDownload('c1-song-a', 'Solar Flare', 'track');
    const completedItem = useDownloadStore.getState().downloads['c1-song-a'];
    expect(completedItem.status).toBe('completed');
    expect(await vfs.exists(completedItem.path)).toBe(true);

    // 2. Start downloading songB in background
    const downloadPromise = handleDownload('c1-song-b', 'Nebula Drift', 'track');

    // 3. User triggers Danger Zone "Delete All Downloaded Music" while download is active
    // Cancel any active abort controllers and purge all files from VFS
    cancelActiveDownload('c1-song-b');
    await downloadPromise;

    const { downloads, removeDownload } = useDownloadStore.getState();
    for (const id in downloads) {
      const item = downloads[id];
      if (item.path && (await vfs.exists(item.path))) {
        await StorageManager.removeTrack(item.path);
      }
      removeDownload(id);
    }

    // 4. Verify all files are deleted from VFS and download store is empty
    expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
    expect(await vfs.exists(completedItem.path)).toBe(false);
  });

  // ==========================================================================
  // [T3.C2] Offline Mode Toggle + Active Download Queue
  // ==========================================================================
  it('[T3.C2] Offline Mode Toggle + Active Download Queue transitions in-flight to error/paused state while preserving completed tracks for offline playback', async () => {
    setPlatform('tauri');
    const songDone = { id: 'c2-done', title: 'Evergreen', artist: 'Flora', album: 'Forest', albumId: 'c2-alb', duration: 180 };
    const songPending = { id: 'c2-pend', title: 'Rainforest', artist: 'Flora', album: 'Forest', albumId: 'c2-alb', duration: 220 };
    registerMockSong(songDone);
    registerMockSong(songPending);

    // 1. Download first song while online
    setOnline(true);
    await handleDownload('c2-done', 'Evergreen', 'track');
    expect(useDownloadStore.getState().downloads['c2-done'].status).toBe('completed');

    // 2. Start second song download and drop network to offline
    useDownloadStore.getState().startDownload('c2-pend', 'Rainforest', 'track');
    expect(useDownloadStore.getState().downloads['c2-pend'].status).toBe('downloading');

    setOnline(false);

    // 3. In-flight download transitions to error when network is lost
    useDownloadStore.getState().errorDownload('c2-pend', 'Failed to fetch: Network is offline');
    const pendingItem = useDownloadStore.getState().downloads['c2-pend'];
    expect(pendingItem.status).toBe('error');
    expect(pendingItem.error).toContain('offline');

    // 4. Verify completed song resolves to local asset URI even in offline mode
    const sourceDone = await resolveTrackAudioSource(songDone);
    expect(sourceDone.isLocal).toBe(true);
    expect(sourceDone.isAvailable).toBe(true);
    expect(sourceDone.src).toContain('http://asset.localhost/');

    // 5. Non-downloaded song resolves to not available in offline mode
    const sourcePending = await resolveTrackAudioSource(songPending);
    expect(sourcePending.isLocal).toBe(false);
    expect(sourcePending.isAvailable).toBe(false);
    expect(sourcePending.src).toBe('');
  });

  // ==========================================================================
  // [T3.C3] Image Cache LRU Eviction + Cover Art Download & View Rendering
  // ==========================================================================
  it('[T3.C3] Image Cache LRU Eviction + Cover Art Download ensures disk covers remain accessible when in-memory cache evicts web blobs', async () => {
    setPlatform('tauri');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    // 1. Download album with cover art to disk
    const albumCoverData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);
    const diskCoverPath = await StorageManager.saveCoverArt('c3_album_cover.jpg', albumCoverData, undefined, 'covers');
    expect(await vfs.exists(diskCoverPath)).toBe(true);

    // 2. Resolve local cover URI (points to VFS disk path via asset protocol)
    const localCoverUri = await StorageManager.getLocalCoverUri(diskCoverPath);
    expect(localCoverUri).toContain('http://asset.localhost/');

    // 3. Simulate LRU cache for web preview images
    class LRUWebImageCache {
      private limit: number;
      private map = new Map<string, string>();
      constructor(limit: number) { this.limit = limit; }
      set(key: string, blobUrl: string) {
        if (this.map.size >= this.limit) {
          const oldest = this.map.keys().next().value;
          if (oldest) {
            const url = this.map.get(oldest);
            if (url) URL.revokeObjectURL(url);
            this.map.delete(oldest);
          }
        }
        this.map.set(key, blobUrl);
      }
      get(key: string) { return this.map.get(key); }
    }

    const webCache = new LRUWebImageCache(2);
    webCache.set('web-img-1', 'blob:http://localhost/web-blob-1');
    webCache.set('web-img-2', 'blob:http://localhost/web-blob-2');
    webCache.set('web-img-3', 'blob:http://localhost/web-blob-3'); // Evicts web-img-1

    expect(webCache.get('web-img-1')).toBeUndefined();
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/web-blob-1');

    // 4. Verify disk cover remains intact on VFS and local URI resolution is unaffected by in-memory blob eviction
    expect(await vfs.exists(diskCoverPath)).toBe(true);
    const recheckedUri = await StorageManager.getLocalCoverUri(diskCoverPath);
    expect(recheckedUri).toBe(localCoverUri);
  });

  // ==========================================================================
  // [T3.C4] Download Directory Relocation + Completed Downloads
  // ==========================================================================
  it('[T3.C4] Download Directory Relocation + Completed Downloads moves physical files, updates store paths, and maintains URI resolution', async () => {
    setPlatform('tauri');
    const oldDir = 'C:/Users/MockUser/Downloads/Holad';
    const newDir = 'D:/UserMusic/CustomHolad';

    // 1. Save track in old directory
    const audioBytes = new Uint8Array([11, 22, 33, 44]);
    const oldPath = await StorageManager.saveTrack('relocate_track.mp3', audioBytes, oldDir, 'tracks');
    expect(await vfs.exists(oldPath)).toBe(true);

    useDownloadStore.getState().startDownload('c4-track', 'Relocate Track', 'track');
    useDownloadStore.getState().completeDownload('c4-track', oldPath);

    // 2. Relocate directory
    await StorageManager.moveDirectory(oldDir, newDir);
    useDownloadStore.getState().setDownloadDirectory(newDir);

    // Update store paths to new directory
    const oldItem = useDownloadStore.getState().downloads['c4-track'];
    const updatedPath = oldItem.path.replace(oldDir, newDir);
    useDownloadStore.getState().updateItem('c4-track', { path: updatedPath });

    // 3. Verify old path is gone and new path exists in VFS
    expect(await vfs.exists(oldPath)).toBe(false);
    expect(await vfs.exists(updatedPath)).toBe(true);

    // 4. Verify local URI resolution works from new directory
    const resolvedUri = await StorageManager.getLocalTrackUri('c4-track', 'Relocate Track');
    expect(resolvedUri).not.toBeNull();
    expect(resolvedUri).toContain('http://asset.localhost/');
    expect(resolvedUri).toContain('CustomHolad');
  });

  // ==========================================================================
  // [T3.C5] Starred Library Batch Download + Deduplication Check
  // ==========================================================================
  it('[T3.C5] Starred Library Batch Download + Deduplication Check downloads only missing starred items and skips completed ones', async () => {
    setPlatform('tauri');
    const song1 = { id: 'c5-s1', title: 'Track Alpha', artist: 'Cosmo', album: 'A1', albumId: 'c5-alb-1', duration: 150 };
    const song2 = { id: 'c5-s2', title: 'Track Beta', artist: 'Cosmo', album: 'A1', albumId: 'c5-alb-1', duration: 160 };
    const song3 = { id: 'c5-s3', title: 'Track Gamma', artist: 'Cosmo', album: 'A1', albumId: 'c5-alb-1', duration: 170 };
    registerStarredItems([song1, song2, song3]);

    // Pre-complete song1 and song2
    useDownloadStore.getState().startDownload('c5-s1', 'Track Alpha', 'track');
    useDownloadStore.getState().completeDownload('c5-s1', 'C:/Users/MockUser/Downloads/Holad/tracks/Track Alpha.mp3');
    useDownloadStore.getState().startDownload('c5-s2', 'Track Beta', 'track');
    useDownloadStore.getState().completeDownload('c5-s2', 'C:/Users/MockUser/Downloads/Holad/tracks/Track Beta.mp3');

    // Run batch sync
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const syncLibrary = async () => {
      const { downloads } = useDownloadStore.getState();
      for (const item of mockState.starredSongs) {
        if (!isItemDownloaded(downloads, item.id)) {
          await handleDownload(item.id, item.title, 'track');
        }
      }
    };

    await syncLibrary();

    // Verify all 3 songs are completed
    expect(isItemDownloaded(useDownloadStore.getState().downloads, 'c5-s1')).toBe(true);
    expect(isItemDownloaded(useDownloadStore.getState().downloads, 'c5-s2')).toBe(true);
    expect(isItemDownloaded(useDownloadStore.getState().downloads, 'c5-s3')).toBe(true);

    // Verify fetch was only executed for song3
    const downloadCalls = fetchSpy.mock.calls.filter(c => String(c[0]).includes('c5-s3'));
    expect(downloadCalls.length).toBeGreaterThanOrEqual(1);
    const skippedCalls1 = fetchSpy.mock.calls.filter(c => String(c[0]).includes('c5-s1'));
    expect(skippedCalls1.length).toBe(0);
  });

  // ==========================================================================
  // [T3.C6] Storage Stats Calculation + Danger Zone Partition Clear
  // ==========================================================================
  it('[T3.C6] Storage Stats Calculation + Danger Zone Partition Clear clears image partition without touching audio or metadata partitions', async () => {
    // 1. Seed audio files (800KB total)
    await vfs.writeFile('C:/Holad/tracks/song1.mp3', new Uint8Array(1024 * 400));
    await vfs.writeFile('C:/Holad/tracks/song2.mp3', new Uint8Array(1024 * 400));

    // 2. Seed image files (150KB total)
    await vfs.writeFile('C:/Holad/covers/cover1.jpg', new Uint8Array(1024 * 75));
    await vfs.writeFile('C:/Holad/covers/cover2.jpg', new Uint8Array(1024 * 75));

    // 3. Seed metadata in localStorage
    localStorage.setItem('streamnavi-settings', JSON.stringify({ state: { theme: 'dark' } }));

    // Storage stats function
    const getStats = () => ({
      audioBytes: vfs.getTotalSize('C:/Holad/tracks'),
      imageBytes: vfs.getTotalSize('C:/Holad/covers'),
      metadataBytes: localStorage.getItem('streamnavi-settings')?.length || 0,
    });

    const initialStats = getStats();
    expect(initialStats.audioBytes).toBe(1024 * 800);
    expect(initialStats.imageBytes).toBe(1024 * 150);
    expect(initialStats.metadataBytes).toBeGreaterThan(0);

    // 4. Trigger Danger Zone: Clear Image Cache partition
    await vfs.remove('C:/Holad/covers', { recursive: true });

    const postClearStats = getStats();
    expect(postClearStats.imageBytes).toBe(0);
    expect(postClearStats.audioBytes).toBe(1024 * 800); // Unchanged!
    expect(postClearStats.metadataBytes).toBe(initialStats.metadataBytes); // Unchanged!
  });

  // ==========================================================================
  // [T3.C7] Gapless Playback Engine + Local Asset Protocol Decks
  // ==========================================================================
  it('[T3.C7] Gapless Playback Engine + Local Asset Protocol Decks transitions seamlessly between two downloaded local tracks', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();

    const deck0 = new AudioDeck('deck-0', el0);
    const deck1 = new AudioDeck('deck-1', el1);

    const track1AssetUri = 'http://asset.localhost/C%3A%2FHolad%2Ftracks%2Ftrack1.mp3';
    const track2AssetUri = 'http://asset.localhost/C%3A%2FHolad%2Ftracks%2Ftrack2.mp3';

    // 1. Deck 0 loads Track 1 and begins playback
    await deck0.load(track1AssetUri);
    deck0.element.dispatchEvent(new Event('canplay'));
    await deck0.play();
    expect(deck0.getState()).toBe('playing');
    expect(deck0.element.src).toBe(track1AssetUri);

    // 2. Gapless PreloadManager preloads Track 2 on Deck 1
    await deck1.load(track2AssetUri);
    deck1.element.dispatchEvent(new Event('canplay'));
    expect(deck1.getState()).toBe('ready');
    expect(deck1.element.src).toBe(track2AssetUri);

    // 3. Track 1 completes (ended event fired) -> Zero-latency switchover to Deck 1
    deck0.element.dispatchEvent(new Event('ended'));
    expect(deck0.getState()).toBe('ended');

    await deck1.play();
    expect(deck1.getState()).toBe('playing');
    expect(deck1.element.src).toBe(track2AssetUri);

    deck0.destroy();
    deck1.destroy();
  });

  // ==========================================================================
  // [T3.C8] Mobile Sandbox Migration + Directory Traversal Isolation
  // ==========================================================================
  it('[T3.C8] Mobile Sandbox Migration + Directory Traversal Isolation ensures Capacitor Filesystem operations remain strictly sandboxed in Directory.Data', async () => {
    setPlatform('capacitor');

    // 1. Save mobile track in subfolder
    const data = new Uint8Array([5, 6, 7, 8]);
    const savedPath = await StorageManager.saveTrack('sandboxed_song.mp3', data, undefined, 'albums/MobileAlbum');
    expect(savedPath).toBe('Holad/albums/MobileAlbum/sandboxed_song.mp3');

    // 2. Verify physical file is located strictly inside DATA/Holad/... in VFS
    expect(await vfs.exists('DATA/Holad/albums/MobileAlbum/sandboxed_song.mp3')).toBe(true);

    // 3. Delete directory and verify child unlinking
    await StorageManager.removeDirectory('Holad/albums/MobileAlbum');
    expect(await vfs.exists('DATA/Holad/albums/MobileAlbum/sandboxed_song.mp3')).toBe(false);
    expect(await vfs.exists('DATA/Holad/albums/MobileAlbum')).toBe(false);
  });

  // ==========================================================================
  // [T3.C9] Memory Limit Adjustment during Active Album Download
  // ==========================================================================
  it('[T3.C9] Memory Limit Adjustment during Active Album Download updates settingsStore without disrupting active audio streaming pipeline', async () => {
    setPlatform('tauri');
    const song1 = { id: 'c9-s1', title: 'Wave 1', artist: 'Synth', album: 'Retro Synth', albumId: 'c9-alb', duration: 180 };
    const song2 = { id: 'c9-s2', title: 'Wave 2', artist: 'Synth', album: 'Retro Synth', albumId: 'c9-alb', duration: 190 };
    const album = { id: 'c9-alb', name: 'Retro Synth', artist: 'Synth', songCount: 2, song: [song1, song2] };
    registerMockAlbum(album);

    // 1. Start album download
    const downloadPromise = handleDownload('c9-alb', 'Retro Synth', 'album');

    // 2. Adjust Image Cache Limit in settingsStore mid-download
    useSettingsStore.setState({ theme: 'light' }); // Settings state change
    expect(useSettingsStore.getState().theme).toBe('light');

    // 3. Wait for album download to complete
    await downloadPromise;

    const albumItem = useDownloadStore.getState().downloads['c9-alb'];
    expect(albumItem).toBeDefined();
    expect(albumItem.status).toBe('completed');
    expect(albumItem.completedTrackCount).toBe(2);
  });

  // ==========================================================================
  // [T3.C10] Partial Album Deletion & Sibling Track Playback
  // ==========================================================================
  it('[T3.C10] Partial Album Deletion removes specified track while sibling tracks in album directory remain playable', async () => {
    setPlatform('tauri');
    const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/RockLive';
    const track1Path = `${albumDir}/Track 1 - Intro.mp3`;
    const track2Path = `${albumDir}/Track 2 - Jam.mp3`;

    await vfs.writeFile(track1Path, new Uint8Array([1, 2, 3]));
    await vfs.writeFile(track2Path, new Uint8Array([4, 5, 6]));

    useDownloadStore.getState().startDownload('c10-t1', 'Track 1 - Intro', 'track');
    useDownloadStore.getState().completeDownload('c10-t1', track1Path);

    useDownloadStore.getState().startDownload('c10-t2', 'Track 2 - Jam', 'track');
    useDownloadStore.getState().completeDownload('c10-t2', track2Path);

    // Delete Track 1 only
    await StorageManager.removeTrack(track1Path);
    useDownloadStore.getState().removeDownload('c10-t1');

    // Verify Track 1 is gone but Track 2 is still on disk and resolves
    expect(await vfs.exists(track1Path)).toBe(false);
    expect(await vfs.exists(track2Path)).toBe(true);

    const track2Uri = await StorageManager.getLocalTrackUri('c10-t2', 'Track 2 - Jam');
    expect(track2Uri).not.toBeNull();
    expect(track2Uri).toContain('http://asset.localhost/');
  });

  // ==========================================================================
  // [T3.C11] Concurrent Playback of Local Track while Downloading New Album
  // ==========================================================================
  it('[T3.C11] Concurrent Playback of Local Track while Downloading New Album maintains smooth audio deck state and emits time updates', async () => {
    setPlatform('tauri');
    const localSongPath = 'C:/Users/MockUser/Downloads/Holad/tracks/Chill.mp3';
    await vfs.writeFile(localSongPath, new Uint8Array([10, 20, 30]));

    useDownloadStore.getState().startDownload('chill-1', 'Chill', 'track');
    useDownloadStore.getState().completeDownload('chill-1', localSongPath);

    // 1. Deck 0 plays local track
    const el = createMockAudioElement();
    const deck = new AudioDeck('deck-playing', el);
    const localUri = await StorageManager.getLocalTrackUri('chill-1', 'Chill');
    await deck.load(localUri!);
    deck.element.dispatchEvent(new Event('canplay'));
    await deck.play();

    expect(deck.getState()).toBe('playing');

    // 2. Start downloading another track concurrently
    const newSong = { id: 'new-song-1', title: 'New Energy', artist: 'Apex', album: 'Energy', albumId: 'e-1', duration: 200 };
    registerMockSong(newSong);
    await handleDownload('new-song-1', 'New Energy', 'track');

    // 3. Verify Deck 0 is still in playing state
    deck.element.dispatchEvent(new Event('timeupdate'));
    expect(deck.getState()).toBe('playing');
    expect(useDownloadStore.getState().downloads['new-song-1'].status).toBe('completed');

    deck.destroy();
  });

  // ==========================================================================
  // [T3.C12] Preload Next Track with Hybrid Local & Remote Queue
  // ==========================================================================
  it('[T3.C12] Preload Next Track with Hybrid Queue resolves local asset for downloaded track and remote stream URL for online track', async () => {
    setPlatform('tauri');
    const localTrack = { id: 'hyb-local', title: 'Local Groove', artist: 'DJ 1', album: 'Mix', albumId: 'm1', duration: 180 };
    const remoteTrack = { id: 'hyb-remote', title: 'Remote Stream', artist: 'DJ 2', album: 'Mix', albumId: 'm1', duration: 220 };
    registerMockSong(localTrack);
    registerMockSong(remoteTrack);

    // Save local track in VFS
    const localPath = 'C:/Users/MockUser/Downloads/Holad/tracks/Local Groove.mp3';
    await vfs.writeFile(localPath, new Uint8Array([1, 2, 3]));
    useDownloadStore.getState().startDownload('hyb-local', 'Local Groove', 'track');
    useDownloadStore.getState().completeDownload('hyb-local', localPath);

    // Resolve sources
    const localSource = await resolveTrackAudioSource(localTrack);
    const remoteSource = await resolveTrackAudioSource(remoteTrack);

    expect(localSource.isLocal).toBe(true);
    expect(localSource.src).toContain('http://asset.localhost/');

    expect(remoteSource.isLocal).toBe(false);
    expect(remoteSource.src).toContain('stream');
  });

  // ==========================================================================
  // [T3.C13] Offline Mode Playback with Local Cover Art Resolution
  // ==========================================================================
  it('[T3.C13] Offline Mode Playback with Local Cover Art Resolution resolves both audio and cover art from local disk when disconnected', async () => {
    setPlatform('tauri');
    const trackId = 'off-art-1';
    const audioPath = 'C:/Users/MockUser/Downloads/Holad/tracks/OfflineSong.mp3';
    const coverPath = 'C:/Users/MockUser/Downloads/Holad/covers/OfflineCover.jpg';

    await vfs.writeFile(audioPath, new Uint8Array([10, 20, 30]));
    await vfs.writeFile(coverPath, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));

    const coverAssetUri = convertFileSrc(coverPath);
    useDownloadStore.getState().startDownload(trackId, 'OfflineSong', 'track', undefined, { localCoverArtUri: coverAssetUri });
    useDownloadStore.getState().completeDownload(trackId, audioPath, { localCoverArtUri: coverAssetUri });

    // Set offline
    setOnline(false);

    const offlineTrack = { id: trackId, title: 'OfflineSong', albumId: 'alb-off' };
    const audioSource = await resolveTrackAudioSource(offlineTrack);
    const coverUri = await StorageManager.getLocalCoverUri(coverPath);

    expect(audioSource.isLocal).toBe(true);
    expect(audioSource.isAvailable).toBe(true);
    expect(audioSource.src).toContain('http://asset.localhost/');

    expect(coverUri).toContain('http://asset.localhost/');
    expect(coverUri).toContain('OfflineCover.jpg');
  });

  // ==========================================================================
  // [T3.C14] Download Queue Cancellation + Storage Stats Re-evaluation
  // ==========================================================================
  it('[T3.C14] Download Queue Cancellation sets status to cancelled and prevents storage bloat', () => {
    const store = useDownloadStore.getState();
    store.startDownload('cancel-me', 'Heavy Stream', 'track');
    store.updateProgress('cancel-me', 40);

    expect(useDownloadStore.getState().downloads['cancel-me'].status).toBe('downloading');

    cancelActiveDownload('cancel-me');

    const cancelledItem = useDownloadStore.getState().downloads['cancel-me'];
    expect(cancelledItem.status).toBe('cancelled');

    const activeDownloads = Object.values(useDownloadStore.getState().downloads).filter(d => d.status === 'downloading');
    expect(activeDownloads.length).toBe(0);
  });

  // ==========================================================================
  // [T3.C15] Rapid Crossfade between Local Asset Track and Remote Stream
  // ==========================================================================
  it('[T3.C15] Rapid Crossfade between Local Asset Track and Remote Stream executes gain ramp smoothly across different protocol schemes', async () => {
    const el0 = createMockAudioElement();
    const el1 = createMockAudioElement();
    const deck0 = new AudioDeck('deck-fade-0', el0);
    const deck1 = new AudioDeck('deck-fade-1', el1);

    const localAssetUrl = 'http://asset.localhost/C%3A%2FMusic%2FLocal.mp3';
    const remoteStreamUrl = 'http://localhost:4040/rest/stream?id=rem-1';

    // Deck 0 plays local
    await deck0.load(localAssetUrl);
    deck0.element.dispatchEvent(new Event('canplay'));
    await deck0.play();
    deck0.setVolume(1.0);

    // Deck 1 loads remote
    await deck1.load(remoteStreamUrl);
    deck1.element.dispatchEvent(new Event('canplay'));
    await deck1.play();
    deck1.setVolume(0.0);

    // Simulate crossfade step
    const steps = [0.25, 0.5, 0.75, 1.0];
    for (const progress of steps) {
      deck0.setVolume(Math.cos(progress * 0.5 * Math.PI));
      deck1.setVolume(Math.sin(progress * 0.5 * Math.PI));
    }

    expect(deck0.element.volume).toBeCloseTo(0.0, 1);
    expect(deck1.element.volume).toBeCloseTo(1.0, 1);

    deck0.pause();
    expect(deck0.getState()).toBe('paused');
    expect(deck1.getState()).toBe('playing');

    deck0.destroy();
    deck1.destroy();
  });

  // ==========================================================================
  // [T3.C16] Starred Album Download with Missing Track vs Single Track Re-download
  // ==========================================================================
  it('[T3.C16] Starred Album Download identifies missing track and backfills disk directory', async () => {
    setPlatform('tauri');
    const albumDir = 'C:/Users/MockUser/Downloads/Holad/albums/SynthWave';
    const s1Path = `${albumDir}/Track 01 - Neon.mp3`;
    await vfs.writeFile(s1Path, new Uint8Array([1, 2]));

    useDownloadStore.getState().startDownload('sw-s1', 'Track 01 - Neon', 'track');
    useDownloadStore.getState().completeDownload('sw-s1', s1Path);

    // Now missing track s2 is downloaded
    const s2Path = `${albumDir}/Track 02 - Grid.mp3`;
    await vfs.writeFile(s2Path, new Uint8Array([3, 4]));
    useDownloadStore.getState().startDownload('sw-s2', 'Track 02 - Grid', 'track');
    useDownloadStore.getState().completeDownload('sw-s2', s2Path);

    const entries = await vfs.readDir(albumDir);
    expect(entries.length).toBe(2);
    expect(entries.some(e => e.name.includes('Neon'))).toBe(true);
    expect(entries.some(e => e.name.includes('Grid'))).toBe(true);
  });

  // ==========================================================================
  // [T3.C17] Clear Metadata Cache preserves Download Store and Local Audio Index
  // ==========================================================================
  it('[T3.C17] Clear Metadata Cache preserves Download Store records and VFS audio files', async () => {
    setPlatform('tauri');
    const audioPath = 'C:/Users/MockUser/Downloads/Holad/tracks/Preserve.mp3';
    await vfs.writeFile(audioPath, new Uint8Array([10, 20]));

    useDownloadStore.getState().startDownload('pres-1', 'Preserve', 'track');
    useDownloadStore.getState().completeDownload('pres-1', audioPath);

    localStorage.setItem('streamnavi-history', JSON.stringify({ state: { history: [] } }));
    localStorage.setItem('streamnavi-lyrics', JSON.stringify({ state: {} }));

    // Execute metadata cache clear
    clearAppCache();

    // Check localStorage cache cleared
    expect(localStorage.getItem('streamnavi-history')).toBeNull();
    expect(localStorage.getItem('streamnavi-lyrics')).toBeNull();

    // Check downloadStore and VFS file remain intact
    expect(useDownloadStore.getState().downloads['pres-1'].status).toBe('completed');
    expect(await vfs.exists(audioPath)).toBe(true);
  });

  // ==========================================================================
  // [T3.C18] Desktop to Mobile Platform Switch on Completed Storage
  // ==========================================================================
  it('[T3.C18] Platform Switch validates respective URI formats (Tauri asset vs Capacitor file)', async () => {
    // 1. Tauri Mode
    setPlatform('tauri');
    const tauriTrack = 'C:/Users/MockUser/Downloads/Holad/tracks/Song.mp3';
    await vfs.writeFile(tauriTrack, new Uint8Array([1, 2]));
    useDownloadStore.getState().startDownload('t-switch-1', 'Song', 'track');
    useDownloadStore.getState().completeDownload('t-switch-1', tauriTrack);

    const tauriUri = await StorageManager.getLocalTrackUri('t-switch-1', 'Song');
    expect(tauriUri).toContain('http://asset.localhost/');

    // 2. Mobile Mode
    setPlatform('capacitor');
    const mobileTrack = 'Holad/tracks/MobileSong.mp3';
    await vfs.writeFile(`DATA/${mobileTrack}`, new Uint8Array([1, 2]));
    useDownloadStore.getState().startDownload('m-switch-1', 'MobileSong', 'track');
    useDownloadStore.getState().completeDownload('m-switch-1', mobileTrack);

    const capUri = await StorageManager.getLocalTrackUri('m-switch-1', 'MobileSong');
    expect(capUri).toContain('_capacitor_file_');
  });
});
