import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
  registerMockSong,
  registerMockAlbum,
} from './e2e/harness';
import { StorageManager, isTauri, isCapacitor } from '../utils/StorageManager';
import { isLocalMediaUrl, AudioDeck } from '../audio/AudioDeck';
import { MobileAudioCore } from '../audio/MobileAudioCore';
import {
  useDownloadStore,
  isItemDownloaded,
  getOfflineTracks,
  getDownloadedTracks,
  getDownloadedAlbums,
} from '../store/downloadStore';
import { handleDownload, cancelActiveDownload } from '../utils/downloadHelper';
import {
  networkManager,
  isOnline,
  isOffline,
  setNetworkStatusForTesting,
  resetNetworkStatusForTesting,
} from '../utils/networkStatus';
import { resolveTrackAudioSource } from '../hooks/useTrackSource';

describe('Milestone 1: Core Storage, Asset Protocols & Safe Offline Playback Engine', () => {
  beforeEach(() => {
    resetE2EHarness();
    resetNetworkStatusForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetNetworkStatusForTesting();
  });

  describe('1. StorageManager & Asset Protocols', () => {
    it('routes getDefaultDownloadDir() to Downloads/Holad on Desktop Tauri', async () => {
      setPlatform('tauri');
      const dir = await StorageManager.getDefaultDownloadDir();
      expect(dir).toContain('Downloads');
      expect(dir).toContain('Holad');
    });

    it('routes getDefaultDownloadDir() to Holad on Mobile Capacitor', async () => {
      setPlatform('capacitor');
      const dir = await StorageManager.getDefaultDownloadDir();
      expect(dir).toBe('Holad');
    });

    it('saveCoverArt saves image data and getLocalCoverUri returns local asset URL', async () => {
      setPlatform('tauri');
      const imgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const savedPath = await StorageManager.saveCoverArt('album_art.jpg', imgBytes, undefined, 'covers');
      
      expect(savedPath).toContain('covers');
      expect(savedPath).toContain('album_art.jpg');
      expect(await vfs.exists(savedPath)).toBe(true);

      const localUri = await StorageManager.getLocalCoverUri(savedPath);
      expect(localUri).toContain('http://asset.localhost/');
      expect(localUri).toContain('album_art.jpg');
    });

    it('getLocalCoverUri resolves by coverId in covers folder', async () => {
      setPlatform('tauri');
      const coverDir = 'C:/Users/MockUser/Downloads/Holad/covers';
      await vfs.writeFile(`${coverDir}/art-123.jpg`, new Uint8Array([1, 2, 3]));

      const localUri = await StorageManager.getLocalCoverUri('art-123');
      expect(localUri).not.toBeNull();
      expect(localUri).toContain('http://asset.localhost/');
      expect(localUri).toContain('art-123.jpg');
    });

    it('moveDirectory recursively moves directories and nested files', async () => {
      setPlatform('tauri');
      const oldDir = 'C:/Users/MockUser/Downloads/OldHolad';
      const newDir = 'D:/NewHolad';

      await vfs.writeFile(`${oldDir}/tracks/song1.mp3`, new Uint8Array([1, 2, 3]));
      await vfs.writeFile(`${oldDir}/covers/cover1.jpg`, new Uint8Array([4, 5, 6]));

      await StorageManager.moveDirectory(oldDir, newDir);

      expect(await vfs.exists(oldDir)).toBe(false);
      expect(await vfs.exists(`${newDir}/tracks/song1.mp3`)).toBe(true);
      expect(await vfs.exists(`${newDir}/covers/cover1.jpg`)).toBe(true);
    });
  });

  describe('2. CORS-Safe Media Playback Schemes', () => {
    it('isLocalMediaUrl identifies all local protocol formats', () => {
      expect(isLocalMediaUrl('http://asset.localhost/music/song.mp3')).toBe(true);
      expect(isLocalMediaUrl('asset://localhost/music/song.mp3')).toBe(true);
      expect(isLocalMediaUrl('_capacitor_file_:///data/user/0/com.holad/files/song.mp3')).toBe(true);
      expect(isLocalMediaUrl('capacitor://localhost/song.mp3')).toBe(true);
      expect(isLocalMediaUrl('file:///C:/Users/Holad/song.mp3')).toBe(true);
      expect(isLocalMediaUrl('blob:http://localhost:4000/123-456')).toBe(true);
      expect(isLocalMediaUrl('data:audio/mp3;base64,AAAA')).toBe(true);

      expect(isLocalMediaUrl('http://example.com/stream/1')).toBe(false);
      expect(isLocalMediaUrl('https://my-subsonic.server.net/rest/stream')).toBe(false);
    });

    it('AudioDeck clears crossOrigin for local media and retains anonymous for remote streams', async () => {
      const deck = new AudioDeck('m1-deck-test');

      // 1. Initial / remote HTTP stream -> crossOrigin is anonymous
      expect(deck.element.crossOrigin).toBe('anonymous');

      // 2. Local asset URL -> load dispatches ready event
      const loadPromise = deck.load('http://asset.localhost/C%3A%2FDownloads%2Fsong.mp3');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await loadPromise;
      expect(deck.element.crossOrigin).toBeNull();

      // 3. Remote stream
      const remotePromise = deck.load('https://myserver.org/rest/stream/123');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await remotePromise;
      expect(deck.element.crossOrigin).toBe('anonymous');

      deck.destroy();
    });

    it('MobileAudioCore configures crossOrigin dynamically for primary and crossfade elements', async () => {
      const core = new MobileAudioCore();

      await core.play('http://asset.localhost/local.mp3');
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBeNull();

      await core.play('https://remote-server.com/stream/456');
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBe('anonymous');

      core.destroy();
    });
  });

  describe('3. DownloadStore Queue & Metadata Indexing', () => {
    it('manages complete queue lifecycle states: queued -> downloading -> paused -> completed', () => {
      const store = useDownloadStore.getState();

      store.queueDownload('item-1', 'Test Track', 'track', 'cover.jpg', { artist: 'Artist X', duration: 200 });
      expect(useDownloadStore.getState().downloads['item-1'].status).toBe('queued');

      store.resumeDownload('item-1');
      expect(useDownloadStore.getState().downloads['item-1'].status).toBe('downloading');

      store.pauseDownload('item-1');
      expect(useDownloadStore.getState().downloads['item-1'].status).toBe('paused');

      store.updateProgress('item-1', 50, 5000, 10000);
      expect(useDownloadStore.getState().downloads['item-1'].bytesDownloaded).toBe(5000);
      expect(useDownloadStore.getState().downloads['item-1'].totalBytes).toBe(10000);

      store.completeDownload('item-1', '/path/to/track.mp3', { sizeBytes: 10000 });
      expect(useDownloadStore.getState().downloads['item-1'].status).toBe('completed');
      expect(useDownloadStore.getState().downloads['item-1'].progress).toBe(100);

      const downloadedTracks = getDownloadedTracks();
      expect(downloadedTracks.some(d => d.id === 'item-1')).toBe(true);
    });

    it('getOfflineTracks indexes all completed tracks with full metadata and cover URIs', () => {
      const store = useDownloadStore.getState();
      store.startDownload('track-offline-1', 'Track 1', 'track', 'http://remote/cover1.jpg', {
        artist: 'Offline Artist',
        album: 'Offline Album',
        albumId: 'alb-offline-1',
        duration: 180,
        localCoverArtUri: 'http://asset.localhost/covers/cover1.jpg',
        sizeBytes: 4500000
      });
      store.completeDownload('track-offline-1', '/downloads/track1.mp3');

      const offlineTracks = getOfflineTracks();
      const target = offlineTracks.find(t => t.id === 'track-offline-1');

      expect(target).toBeDefined();
      expect(target.title).toBe('Track 1');
      expect(target.artist).toBe('Offline Artist');
      expect(target.album).toBe('Offline Album');
      expect(target.duration).toBe(180);
      expect(target.coverArt).toBe('http://asset.localhost/covers/cover1.jpg');
    });
  });

  describe('4. DownloadHelper Cover Art & Child Track Indexing', () => {
    it('downloads track and cover art simultaneously, indexing localCoverArtUri', async () => {
      setPlatform('tauri');
      const songId = 'helper-song-1';
      registerMockSong({
        id: songId,
        title: 'Helper Single',
        artist: 'Helper Artist',
        album: 'Helper Album',
        albumId: 'alb-helper-1',
        duration: 240,
        coverArt: 'cover-single-art'
      });

      await handleDownload(songId, 'Helper Single', 'track');

      const item = useDownloadStore.getState().downloads[songId];
      expect(item).toBeDefined();
      expect(item.status).toBe('completed');
      expect(item.localCoverArtUri).toBeDefined();
      expect(item.localCoverArtUri).toContain('http://asset.localhost/');
    });

    it('downloads full album and automatically indexes all child tracks into downloadStore', async () => {
      setPlatform('tauri');
      const albumId = 'alb-multi-1';
      registerMockAlbum({
        id: albumId,
        name: 'Full Album Test',
        title: 'Full Album Test',
        artist: 'Band Alpha',
        coverArt: 'cover-band-alpha',
        songCount: 2,
        song: [
          { id: 'child-1', title: 'Child 1', artist: 'Band Alpha', album: 'Full Album Test', albumId, duration: 150 },
          { id: 'child-2', title: 'Child 2', artist: 'Band Alpha', album: 'Full Album Test', albumId, duration: 170 }
        ]
      });

      await handleDownload(albumId, 'Full Album Test', 'album');

      // Verify album container
      const albumItem = useDownloadStore.getState().downloads[albumId];
      expect(albumItem).toBeDefined();
      expect(albumItem.status).toBe('completed');
      expect(albumItem.localCoverArtUri).toBeDefined();

      // Verify child tracks are registered and completed in downloadStore
      const child1 = useDownloadStore.getState().downloads['child-1'];
      const child2 = useDownloadStore.getState().downloads['child-2'];

      expect(child1).toBeDefined();
      expect(child1.status).toBe('completed');
      expect(child1.localCoverArtUri).toBe(albumItem.localCoverArtUri);

      expect(child2).toBeDefined();
      expect(child2.status).toBe('completed');
      expect(child2.localCoverArtUri).toBe(albumItem.localCoverArtUri);

      // Verify getOfflineTracks returns both child tracks
      const offlineList = getOfflineTracks();
      expect(offlineList.some(t => t.id === 'child-1')).toBe(true);
      expect(offlineList.some(t => t.id === 'child-2')).toBe(true);
    });
  });

  describe('5. NetworkStatus & Offline Audio Source Resolution', () => {
    it('notifies subscribers on network online/offline transitions', () => {
      const states: boolean[] = [];
      const unsub = networkManager.subscribe(s => states.push(s));

      setNetworkStatusForTesting(false);
      expect(isOffline()).toBe(true);
      expect(isOnline()).toBe(false);

      setNetworkStatusForTesting(true);
      expect(isOnline()).toBe(true);
      expect(isOffline()).toBe(false);

      unsub();
      expect(states).toEqual([false, true]);
    });

    it('resolveTrackAudioSource returns local asset URI when track is downloaded', async () => {
      setPlatform('tauri');
      const trackId = 'res-track-1';
      const path = 'C:/Users/MockUser/Downloads/Holad/tracks/ResTrack.mp3';
      await vfs.writeFile(path, new Uint8Array([1, 2, 3]));

      useDownloadStore.getState().startDownload(trackId, 'Res Track', 'track');
      useDownloadStore.getState().completeDownload(trackId, path);

      const result = await resolveTrackAudioSource({ id: trackId, title: 'Res Track' });
      expect(result.isLocal).toBe(true);
      expect(result.isAvailable).toBe(true);
      expect(result.src).toContain('http://asset.localhost/');
    });

    it('resolveTrackAudioSource returns stream URL when online and track is not downloaded', async () => {
      setNetworkStatusForTesting(true);
      const result = await resolveTrackAudioSource({ id: 'online-stream-99', title: 'Stream Only' });

      expect(result.isLocal).toBe(false);
      expect(result.isAvailable).toBe(true);
      expect(result.src).toContain('stream');
    });

    it('resolveTrackAudioSource returns isAvailable=false and empty src when offline and track is not downloaded', async () => {
      setNetworkStatusForTesting(false);
      const result = await resolveTrackAudioSource({ id: 'ghost-track-00', title: 'Ghost Track' });

      expect(result.isLocal).toBe(false);
      expect(result.isAvailable).toBe(false);
      expect(result.src).toBe('');
    });
  });
});
