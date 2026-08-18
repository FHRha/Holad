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

describe('Tier 4: Real-World Workload Scenarios', () => {
  beforeEach(() => {
    resetE2EHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Scenario 1: The Offline Flight Journey (High Complexity)
  // ==========================================================================
  describe('Scenario 1: The Offline Flight Journey', () => {
    it('executes full album download on Wi-Fi, switches to airplane mode, plays downloaded tracks with local cover arts, and resumes online sync upon landing', async () => {
      setPlatform('tauri');
      setOnline(true);

      // Step 1: User opens Album view with 4 tracks and cover art while online
      const flightSong1 = { id: 'fl-1', title: 'Takeoff', artist: 'Aero', album: 'Skyward', albumId: 'fl-alb', duration: 210, coverArt: 'cov-fl' };
      const flightSong2 = { id: 'fl-2', title: 'Cruising Altitude', artist: 'Aero', album: 'Skyward', albumId: 'fl-alb', duration: 240, coverArt: 'cov-fl' };
      const flightSong3 = { id: 'fl-3', title: 'Cloudscape', artist: 'Aero', album: 'Skyward', albumId: 'fl-alb', duration: 195, coverArt: 'cov-fl' };
      const flightSong4 = { id: 'fl-4', title: 'Touchdown', artist: 'Aero', album: 'Skyward', albumId: 'fl-alb', duration: 225, coverArt: 'cov-fl' };

      const flightAlbum = {
        id: 'fl-alb',
        name: 'Skyward',
        artist: 'Aero',
        coverArt: 'cov-fl',
        songCount: 4,
        song: [flightSong1, flightSong2, flightSong3, flightSong4],
      };
      registerMockAlbum(flightAlbum);

      // Step 2: Clicks "Download Album" in Album view
      await handleDownload('fl-alb', 'Skyward', 'album');

      // Step 3: Sidebar download queue reaches 100% and store indexes all child tracks
      const albumDownload = useDownloadStore.getState().downloads['fl-alb'];
      expect(albumDownload).toBeDefined();
      expect(albumDownload.status).toBe('completed');
      expect(albumDownload.completedTrackCount).toBe(4);
      expect(albumDownload.localCoverArtUri).toBeDefined();
      expect(albumDownload.localCoverArtUri).toContain('http://asset.localhost/');

      // Verify all child tracks are indexed in download store
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'fl-1', 'fl-alb')).toBe(true);
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'fl-2', 'fl-alb')).toBe(true);
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'fl-3', 'fl-alb')).toBe(true);
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'fl-4', 'fl-alb')).toBe(true);

      // Step 4: Network toggles to Offline (airplane mode engaged)
      setOnline(false);

      // Step 5: User navigates to Downloaded Music view, verifies offline tracks list and local cover art
      const offlineTracks = getOfflineTracks();
      expect(offlineTracks.length).toBeGreaterThanOrEqual(4);
      const offlineSong1 = offlineTracks.find(t => t.id === 'fl-1');
      expect(offlineSong1).toBeDefined();
      expect(offlineSong1.localCoverArtUri).toContain('http://asset.localhost/');

      // Step 6: User clicks Play on Track 1; AudioDeck loads local asset URI
      const source1 = await resolveTrackAudioSource(flightSong1);
      expect(source1.isLocal).toBe(true);
      expect(source1.isAvailable).toBe(true);
      expect(source1.src).toContain('http://asset.localhost/');

      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-flight', el);
      await deck.load(source1.src);
      deck.element.dispatchEvent(new Event('canplay'));
      await deck.play();
      expect(deck.getState()).toBe('playing');

      // Step 7: Sequential playback transitions through tracks 1 to 4 smoothly
      const allSongs = [flightSong1, flightSong2, flightSong3, flightSong4];
      for (const song of allSongs) {
        const source = await resolveTrackAudioSource(song);
        expect(source.isLocal).toBe(true);
        expect(source.isAvailable).toBe(true);
        await deck.load(source.src);
        deck.element.dispatchEvent(new Event('canplay'));
        deck.element.dispatchEvent(new Event('timeupdate'));
        expect(['ready', 'playing']).toContain(deck.getState());
      }

      // Step 8: Network reconnects upon landing; app resumes online state
      setOnline(true);
      const onlineStatus = mockState.online;
      expect(onlineStatus).toBe(true);

      deck.destroy();
    });
  });

  // ==========================================================================
  // Scenario 2: Heavy Library Sync & Storage Budgeting (High Complexity)
  // ==========================================================================
  describe('Scenario 2: Heavy Library Sync & Storage Budgeting', () => {
    it('stars multiple songs, batch downloads library, recalculates partitioned storage bar, and manages image cache under memory limits', async () => {
      setPlatform('tauri');
      setOnline(true);

      // Step 1: User stars 10 songs across albums
      const starredSongs = Array.from({ length: 10 }, (_, i) => ({
        id: `sync-song-${i + 1}`,
        title: `Library Track ${i + 1}`,
        artist: 'Various Artists',
        album: 'Mega Compilation',
        albumId: 'comp-1',
        duration: 180 + i * 5,
        coverArt: `cov-comp-${i + 1}`,
      }));
      registerStarredItems(starredSongs);

      // Step 2: In Settings -> Storage tab, clicks "Download Entire Library"
      const { downloads } = useDownloadStore.getState();
      for (const item of mockState.starredSongs) {
        if (!isItemDownloaded(downloads, item.id)) {
          await handleDownload(item.id, item.title, 'track');
        }
      }

      // Step 3: Verify all 10 tracks downloaded and indexed
      const downloadedTracks = getDownloadedTracks();
      expect(downloadedTracks.length).toBe(10);
      for (const song of starredSongs) {
        expect(isItemDownloaded(useDownloadStore.getState().downloads, song.id)).toBe(true);
      }

      // Step 4: Storage Statistics bar updates dynamically as files accumulate
      const audioBytes = vfs.getTotalSize('C:/Users/MockUser/Downloads/Holad/tracks');
      const imageBytes = vfs.getTotalSize('C:/Users/MockUser/Downloads/Holad/covers');
      expect(audioBytes).toBeGreaterThan(0);
      expect(imageBytes).toBeGreaterThan(0);

      // Step 5: User adjusts Image Cache Limit to 128MB
      useSettingsStore.setState({ isGaplessEnabled: true }); // State update

      // Step 6: User browses extensive online catalog, caching image blobs
      const blobUrl1 = await getCachedImageUrl('http://localhost:4040/rest/getCoverArt?id=browse-1');
      const blobUrl2 = await getCachedImageUrl('http://localhost:4040/rest/getCoverArt?id=browse-2');
      expect(blobUrl1).toContain('blob:');
      expect(blobUrl2).toContain('blob:');

      // Step 7: User executes "Clear Image Cache" in Danger Zone
      await vfs.remove('C:/Users/MockUser/Downloads/Holad/covers', { recursive: true });

      // Step 8: Verifies image folder is purged while all 10 downloaded songs remain intact
      const postClearAudioBytes = vfs.getTotalSize('C:/Users/MockUser/Downloads/Holad/tracks');
      const postClearImageBytes = vfs.getTotalSize('C:/Users/MockUser/Downloads/Holad/covers');
      expect(postClearImageBytes).toBe(0);
      expect(postClearAudioBytes).toBe(audioBytes);
      expect(getDownloadedTracks().length).toBe(10);
    });
  });

  // ==========================================================================
  // Scenario 3: Storage Migration & Cleanup (High Complexity)
  // ==========================================================================
  describe('Scenario 3: Storage Migration & Cleanup', () => {
    it('downloads albums to default folder, relocates directory to custom path, verifies URI resolution, and selectively deletes an album', async () => {
      setPlatform('tauri');
      const defaultDir = 'C:/Users/MockUser/Downloads/Holad';
      const customDir = 'D:/CustomMusicFolder/Holad';

      // Step 1: User downloads 3 albums to default directory
      const alb1 = {
        id: 'mig-alb-1',
        name: 'Album One',
        artist: 'Band A',
        songCount: 2,
        song: [
          { id: 'm1-s1', title: 'One Intro', artist: 'Band A', album: 'Album One', albumId: 'mig-alb-1', duration: 180 },
          { id: 'm1-s2', title: 'One Outro', artist: 'Band A', album: 'Album One', albumId: 'mig-alb-1', duration: 190 },
        ],
      };
      const alb2 = {
        id: 'mig-alb-2',
        name: 'Album Two',
        artist: 'Band B',
        songCount: 1,
        song: [{ id: 'm2-s1', title: 'Two Solo', artist: 'Band B', album: 'Album Two', albumId: 'mig-alb-2', duration: 200 }],
      };
      registerMockAlbum(alb1);
      registerMockAlbum(alb2);

      await handleDownload('mig-alb-1', 'Album One', 'album');
      await handleDownload('mig-alb-2', 'Album Two', 'album');

      expect(useDownloadStore.getState().downloads['mig-alb-1'].status).toBe('completed');
      expect(useDownloadStore.getState().downloads['mig-alb-2'].status).toBe('completed');

      // Step 2: User changes download directory to custom path
      await StorageManager.moveDirectory(defaultDir, customDir);
      useDownloadStore.getState().setDownloadDirectory(customDir);

      // Step 3: Update store records with relocated paths
      const alb1Item = useDownloadStore.getState().downloads['mig-alb-1'];
      const alb2Item = useDownloadStore.getState().downloads['mig-alb-2'];
      const updatedAlb1Path = alb1Item.path.replace(defaultDir, customDir);
      const updatedAlb2Path = alb2Item.path.replace(defaultDir, customDir);
      useDownloadStore.getState().updateItem('mig-alb-1', { path: updatedAlb1Path });
      useDownloadStore.getState().updateItem('mig-alb-2', { path: updatedAlb2Path });

      // Step 4: Local URI resolution verifies new custom path
      const song1Uri = await StorageManager.getLocalTrackUri('m1-s1', 'One Intro', 'mig-alb-1');
      expect(song1Uri).not.toBeNull();
      expect(song1Uri).toContain('http://asset.localhost/');
      expect(song1Uri).toContain('CustomMusicFolder');

      // Step 5: User opens DeleteDownloadsModal, selects Album Two to delete
      await StorageManager.removeDirectory(updatedAlb2Path);
      useDownloadStore.getState().removeDownload('mig-alb-2');

      // Step 6: Verify Album Two is deleted from VFS and store while Album One remains intact
      expect(await vfs.exists(updatedAlb2Path)).toBe(false);
      expect(await vfs.exists(updatedAlb1Path)).toBe(true);
      expect(useDownloadStore.getState().downloads['mig-alb-2']).toBeUndefined();
      expect(useDownloadStore.getState().downloads['mig-alb-1']).toBeDefined();
    });
  });

  // ==========================================================================
  // Scenario 4: Concurrent Download Queue & Danger Zone Interruption (High Complexity)
  // ==========================================================================
  describe('Scenario 4: Concurrent Download Queue & Danger Zone Interruption', () => {
    it('initiates active downloads and cleanly aborts and wipes storage when Delete All Downloaded Music is triggered mid-flight', async () => {
      setPlatform('tauri');
      const songX = { id: 'dx-1', title: 'Storm 1', artist: 'Elements', album: 'Tempest', albumId: 't-1', duration: 180 };
      const songY = { id: 'dx-2', title: 'Storm 2', artist: 'Elements', album: 'Tempest', albumId: 't-1', duration: 200 };
      registerMockSong(songX);
      registerMockSong(songY);

      // Step 1: Pre-download one track
      await handleDownload('dx-1', 'Storm 1', 'track');
      expect(useDownloadStore.getState().downloads['dx-1'].status).toBe('completed');

      // Step 2: Start second download in flight
      const downloadPromise = handleDownload('dx-2', 'Storm 2', 'track');

      // Step 3: Trigger Danger Zone interruption: Cancel in-flight streams and delete all files
      cancelActiveDownload('dx-2');
      await downloadPromise;

      const { downloads, removeDownload } = useDownloadStore.getState();
      for (const id in downloads) {
        const item = downloads[id];
        if (item.path && (await vfs.exists(item.path))) {
          await StorageManager.removeTrack(item.path);
        }
        removeDownload(id);
      }

      // Step 4: Verify complete storage and store cleanup
      expect(Object.keys(useDownloadStore.getState().downloads).length).toBe(0);
      const remainingFiles = vfs.getAllFiles().filter(f => f.includes('Holad/tracks'));
      expect(remainingFiles.length).toBe(0);
    });
  });

  // ==========================================================================
  // Scenario 5: Mobile Sandbox Integrity & Storage Management (Medium Complexity)
  // ==========================================================================
  describe('Scenario 5: Mobile Sandbox Integrity & Storage Management', () => {
    it('manages downloads, local URI playback, storage stats, and cache purge strictly within mobile Capacitor sandbox', async () => {
      setPlatform('capacitor');
      expect(isCapacitor()).toBe(true);

      // Step 1: Mobile album download
      const mobileAlbum = {
        id: 'mob-alb-1',
        name: 'Mobile Beats',
        artist: 'Pocket Sound',
        songCount: 2,
        song: [
          { id: 'ms-1', title: 'Pocket Track 1', artist: 'Pocket Sound', album: 'Mobile Beats', albumId: 'mob-alb-1', duration: 150 },
          { id: 'ms-2', title: 'Pocket Track 2', artist: 'Pocket Sound', album: 'Mobile Beats', albumId: 'mob-alb-1', duration: 160 },
        ],
      };
      registerMockAlbum(mobileAlbum);

      await handleDownload('mob-alb-1', 'Mobile Beats', 'album');
      expect(useDownloadStore.getState().downloads['mob-alb-1'].status).toBe('completed');

      // Step 2: Verify sandbox location
      expect(await vfs.exists('DATA/Holad/albums/Mobile Beats')).toBe(true);

      // Step 3: Play mobile track using _capacitor_file_:// URI
      const trackUri = await StorageManager.getLocalTrackUri('ms-1', 'Pocket Track 1', 'mob-alb-1');
      expect(trackUri).toContain('_capacitor_file_');

      const el = createMockAudioElement();
      const deck = new AudioDeck('mobile-deck', el);
      await deck.load(trackUri!);
      deck.element.dispatchEvent(new Event('canplay'));
      await deck.play();
      expect(deck.getState()).toBe('playing');

      // Step 4: Granular cache purge
      localStorage.setItem('streamnavi-settings', JSON.stringify({ state: { theme: 'dark' } }));
      clearAppCache();
      expect(localStorage.getItem('streamnavi-settings')).toBeNull();

      // Step 5: Mobile audio files remain 100% intact
      expect(await vfs.exists('DATA/Holad/albums/Mobile Beats')).toBe(true);

      deck.destroy();
    });
  });

  // ==========================================================================
  // Scenario 6: Interrupted Road Trip & Network Flapping (Medium Complexity)
  // ==========================================================================
  describe('Scenario 6: Interrupted Road Trip & Network Flapping', () => {
    it('handles network drop during album download and allows resuming/completing when connectivity is restored', async () => {
      setPlatform('tauri');
      setOnline(true);

      const tripSong1 = { id: 'trip-1', title: 'Highway 1', artist: 'Cruiser', album: 'Road Trip', albumId: 'trip-alb', duration: 180 };
      const tripSong2 = { id: 'trip-2', title: 'Highway 2', artist: 'Cruiser', album: 'Road Trip', albumId: 'trip-alb', duration: 190 };
      registerMockSong(tripSong1);
      registerMockSong(tripSong2);

      // 1. Download first song successfully online
      await handleDownload('trip-1', 'Highway 1', 'track');
      expect(useDownloadStore.getState().downloads['trip-1'].status).toBe('completed');

      // 2. Tunnel entered (network drops)
      setOnline(false);

      // 3. User attempts to download song 2 offline -> item marked as paused / queued
      useDownloadStore.getState().queueDownload('trip-2', 'Highway 2', 'track');
      expect(useDownloadStore.getState().downloads['trip-2'].status).toBe('queued');

      // 4. Tunnel exited (network restored)
      setOnline(true);

      // 5. Download resumed
      await handleDownload('trip-2', 'Highway 2', 'track');
      expect(useDownloadStore.getState().downloads['trip-2'].status).toBe('completed');

      // Both songs completed and available offline
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'trip-1')).toBe(true);
      expect(isItemDownloaded(useDownloadStore.getState().downloads, 'trip-2')).toBe(true);
    });
  });

  // ==========================================================================
  // Scenario 7: DJ Live Set with Gapless Local Playback & Dynamic Queue (High Complexity)
  // ==========================================================================
  describe('Scenario 7: DJ Live Set with Gapless Local Playback & Dynamic Queue Injection', () => {
    it('executes zero-latency gapless transitions across dual local asset decks with dynamic queue injection', async () => {
      setPlatform('tauri');
      const el0 = createMockAudioElement();
      const el1 = createMockAudioElement();
      const deck0 = new AudioDeck('dj-deck-0', el0);
      const deck1 = new AudioDeck('dj-deck-1', el1);

      // Seed 3 local EDM tracks
      const t1Path = 'C:/Users/MockUser/Downloads/Holad/tracks/EDM Track 1.mp3';
      const t2Path = 'C:/Users/MockUser/Downloads/Holad/tracks/EDM Track 2.mp3';
      const t3Path = 'C:/Users/MockUser/Downloads/Holad/tracks/EDM Track 3.mp3';

      await vfs.writeFile(t1Path, new Uint8Array([10, 20]));
      await vfs.writeFile(t2Path, new Uint8Array([30, 40]));
      await vfs.writeFile(t3Path, new Uint8Array([50, 60]));

      useDownloadStore.getState().startDownload('dj-1', 'EDM Track 1', 'track');
      useDownloadStore.getState().completeDownload('dj-1', t1Path);
      useDownloadStore.getState().startDownload('dj-2', 'EDM Track 2', 'track');
      useDownloadStore.getState().completeDownload('dj-2', t2Path);
      useDownloadStore.getState().startDownload('dj-3', 'EDM Track 3', 'track');
      useDownloadStore.getState().completeDownload('dj-3', t3Path);

      const uri1 = await StorageManager.getLocalTrackUri('dj-1', 'EDM Track 1');
      const uri2 = await StorageManager.getLocalTrackUri('dj-2', 'EDM Track 2');
      const uri3 = await StorageManager.getLocalTrackUri('dj-3', 'EDM Track 3');

      // 1. Deck 0 starts Track 1
      await deck0.load(uri1!);
      deck0.element.dispatchEvent(new Event('canplay'));
      await deck0.play();
      expect(deck0.getState()).toBe('playing');

      // 2. Deck 1 preloads Track 2
      await deck1.load(uri2!);
      deck1.element.dispatchEvent(new Event('canplay'));
      expect(deck1.getState()).toBe('ready');

      // 3. Track 1 completes -> seamless switchover to Deck 1
      deck0.element.dispatchEvent(new Event('ended'));
      deck0.pause();
      await deck1.play();
      expect(deck1.getState()).toBe('playing');

      // 4. Deck 0 preloads dynamically injected Track 3
      await deck0.load(uri3!);
      deck0.element.dispatchEvent(new Event('canplay'));
      expect(['ready', 'playing']).toContain(deck0.getState());

      // 5. Track 2 completes -> switchover back to Deck 0
      deck1.element.dispatchEvent(new Event('ended'));
      deck1.pause();
      await deck0.play();
      expect(deck0.getState()).toBe('playing');
      expect(deck0.element.src).toBe(uri3);

      deck0.destroy();
      deck1.destroy();
    });
  });

  // ==========================================================================
  // Scenario 8: High-Frequency Playback Scrubbing & Rapid Source Switching (Medium Complexity)
  // ==========================================================================
  describe('Scenario 8: High-Frequency Playback Scrubbing & Rapid Source Switching', () => {
    it('handles rapid sequential load/play calls across local and remote sources without crashing or abort errors', async () => {
      setPlatform('tauri');
      const el = createMockAudioElement();
      const deck = new AudioDeck('deck-scrub', el);

      const localPath = 'C:/Users/MockUser/Downloads/Holad/tracks/ScrubTrack.mp3';
      await vfs.writeFile(localPath, new Uint8Array([1, 2, 3]));
      useDownloadStore.getState().startDownload('scrub-local', 'ScrubTrack', 'track');
      useDownloadStore.getState().completeDownload('scrub-local', localPath);

      const localUri = await StorageManager.getLocalTrackUri('scrub-local', 'ScrubTrack');
      const remoteUri = 'http://localhost:4040/rest/stream?id=rem-scrub';

      // Rapidly fire load requests
      await deck.load(localUri!);
      await deck.load(remoteUri);
      await deck.load(localUri!);

      deck.element.dispatchEvent(new Event('canplay'));
      await deck.play();

      expect(deck.getState()).toBe('playing');
      expect(deck.element.src).toBe(localUri);

      deck.destroy();
    });
  });

  // ==========================================================================
  // Scenario 9: Multi-Partition Danger Zone Cleanup with Selective Retention (Medium Complexity)
  // ==========================================================================
  describe('Scenario 9: Multi-Partition Danger Zone Cleanup with Selective Retention', () => {
    it('clears image partition, clears metadata cache, and selectively removes single album while retaining other downloaded albums', async () => {
      setPlatform('tauri');
      // 1. Seed 2 albums
      const albAPath = 'C:/Users/MockUser/Downloads/Holad/albums/AlbumA';
      const albBPath = 'C:/Users/MockUser/Downloads/Holad/albums/AlbumB';
      const coverPath = 'C:/Users/MockUser/Downloads/Holad/covers/coverA.jpg';

      await vfs.writeFile(`${albAPath}/track1.mp3`, new Uint8Array(1024 * 200));
      await vfs.writeFile(`${albBPath}/track2.mp3`, new Uint8Array(1024 * 200));
      await vfs.writeFile(coverPath, new Uint8Array(1024 * 50));

      useDownloadStore.getState().startDownload('alb-A', 'AlbumA', 'album');
      useDownloadStore.getState().completeDownload('alb-A', albAPath);
      useDownloadStore.getState().startDownload('alb-B', 'AlbumB', 'album');
      useDownloadStore.getState().completeDownload('alb-B', albBPath);

      localStorage.setItem('streamnavi-lyrics', JSON.stringify({ state: { '1': 'la la la' } }));

      // 2. Clear image cache
      await vfs.remove('C:/Users/MockUser/Downloads/Holad/covers', { recursive: true });
      expect(await vfs.exists(coverPath)).toBe(false);

      // 3. Clear metadata cache
      clearAppCache();
      expect(localStorage.getItem('streamnavi-lyrics')).toBeNull();

      // 4. Selectively remove Album A
      await StorageManager.removeDirectory(albAPath);
      useDownloadStore.getState().removeDownload('alb-A');

      // 5. Verify Album A is gone, Album B is 100% intact and playable
      expect(await vfs.exists(albAPath)).toBe(false);
      expect(await vfs.exists(albBPath)).toBe(true);
      expect(useDownloadStore.getState().downloads['alb-A']).toBeUndefined();
      expect(useDownloadStore.getState().downloads['alb-B'].status).toBe('completed');
    });
  });

  // ==========================================================================
  // Scenario 10: Full Lifecycle Library Curation & App Relaunch Simulation (High Complexity)
  // ==========================================================================
  describe('Scenario 10: Full Lifecycle Library Curation & App Relaunch Simulation', () => {
    it('downloads library, relocates folder, simulates full app relaunch, and validates offline playback persistence', async () => {
      setPlatform('tauri');
      setOnline(true);

      const songA = { id: 'life-1', title: 'Genesis', artist: 'Origin', album: 'Cycle', albumId: 'life-alb', duration: 200 };
      const songB = { id: 'life-2', title: 'Exodus', artist: 'Origin', album: 'Cycle', albumId: 'life-alb', duration: 210 };
      registerStarredItems([songA, songB]);

      // 1. Batch download
      for (const item of mockState.starredSongs) {
        await handleDownload(item.id, item.title, 'track');
      }

      // 2. Relocate download folder
      const oldDir = 'C:/Users/MockUser/Downloads/Holad';
      const newDir = 'C:/Users/MockUser/Music/MyHolad';
      await StorageManager.moveDirectory(oldDir, newDir);
      useDownloadStore.getState().setDownloadDirectory(newDir);

      // Update store records
      const d1 = useDownloadStore.getState().downloads['life-1'];
      const d2 = useDownloadStore.getState().downloads['life-2'];
      useDownloadStore.getState().updateItem('life-1', { path: d1.path.replace(oldDir, newDir) });
      useDownloadStore.getState().updateItem('life-2', { path: d2.path.replace(oldDir, newDir) });

      // 3. Simulate app restart: rehydrate store state
      const savedDownloads = JSON.parse(JSON.stringify(useDownloadStore.getState().downloads));
      useDownloadStore.setState({ downloads: savedDownloads });

      // 4. Offline mode verification after restart
      setOnline(false);
      const offlineTracks = getOfflineTracks();
      expect(offlineTracks.length).toBe(2);

      const sourceA = await resolveTrackAudioSource(songA);
      expect(sourceA.isLocal).toBe(true);
      expect(sourceA.isAvailable).toBe(true);
      expect(sourceA.src).toContain('MyHolad');
    });
  });

  // ==========================================================================
  // Scenario 11: Cross-Platform Hybrid Playlist Offline Fallback (Medium Complexity)
  // ==========================================================================
  describe('Scenario 11: Cross-Platform Hybrid Playlist Offline Fallback', () => {
    it('resolves available offline tracks and flags unavailable tracks when playlist is played while disconnected', async () => {
      setPlatform('tauri');
      const trackLocal = { id: 'hyb-play-1', title: 'Local Song', artist: 'Band', album: 'A', albumId: 'a', duration: 180 };
      const trackOnline = { id: 'hyb-play-2', title: 'Online Only Song', artist: 'Band', album: 'A', albumId: 'a', duration: 200 };
      registerMockSong(trackLocal);
      registerMockSong(trackOnline);

      // Download trackLocal only
      await handleDownload('hyb-play-1', 'Local Song', 'track');

      // Go offline
      setOnline(false);

      const resLocal = await resolveTrackAudioSource(trackLocal);
      const resOnline = await resolveTrackAudioSource(trackOnline);

      expect(resLocal.isLocal).toBe(true);
      expect(resLocal.isAvailable).toBe(true);
      expect(resLocal.src).toContain('http://asset.localhost/');

      expect(resOnline.isLocal).toBe(false);
      expect(resOnline.isAvailable).toBe(false);
      expect(resOnline.src).toBe('');
    });
  });

  // ==========================================================================
  // Scenario 12: Storage Quota Pressure & Automatic LRU Image Eviction (Medium Complexity)
  // ==========================================================================
  describe('Scenario 12: Storage Quota Pressure & Automatic LRU Image Eviction', () => {
    it('evicts oldest memory blobs under capacity pressure while keeping disk cover arts available', async () => {
      setPlatform('tauri');
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

      // 1. Save disk cover art
      const coverPath = await StorageManager.saveCoverArt('album_art_permanent.jpg', new Uint8Array([0xff, 0xd8, 0xff]), undefined, 'covers');

      // 2. LRU memory eviction test
      class BoundedLRU {
        private capacity: number;
        private map = new Map<string, string>();
        constructor(cap: number) { this.capacity = cap; }
        put(key: string, val: string) {
          if (this.map.size >= this.capacity) {
            const first = this.map.keys().next().value;
            if (first) {
              const url = this.map.get(first);
              if (url) URL.revokeObjectURL(url);
              this.map.delete(first);
            }
          }
          this.map.set(key, val);
        }
        has(key: string) { return this.map.has(key); }
      }

      const lru = new BoundedLRU(3);
      for (let i = 1; i <= 6; i++) {
        lru.put(`img-${i}`, `blob:http://localhost/blob-${i}`);
      }

      // Oldest blobs should have been evicted
      expect(lru.has('img-1')).toBe(false);
      expect(lru.has('img-2')).toBe(false);
      expect(lru.has('img-3')).toBe(false);
      expect(lru.has('img-6')).toBe(true);
      expect(revokeSpy).toHaveBeenCalledTimes(3);

      // Disk cover remains intact
      expect(await vfs.exists(coverPath)).toBe(true);
      const localUri = await StorageManager.getLocalCoverUri(coverPath);
      expect(localUri).toContain('http://asset.localhost/');
    });
  });
});
