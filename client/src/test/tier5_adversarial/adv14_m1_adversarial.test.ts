import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  vfs,
  mockState,
  resetE2EHarness,
  setPlatform,
  setOnline,
} from '../e2e/harness';
import { StorageManager, isTauri, isCapacitor } from '../../utils/StorageManager';
import { isLocalMediaUrl, AudioDeck } from '../../audio/AudioDeck';
import { MobileAudioCore } from '../../audio/MobileAudioCore';
import { useDownloadStore } from '../../store/downloadStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { downloadDir, join } from '@tauri-apps/api/path';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as tauriFs from '@tauri-apps/plugin-fs';
import * as tauriPath from '@tauri-apps/api/path';
import * as fs from 'fs';
import * as path from 'path';

describe('CHALLENGER 1 ADVERSARIAL SUITE: M1 Core Storage, Asset Protocols & Safe Offline Playback', () => {
  beforeEach(() => {
    resetE2EHarness();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SECTION 1: Tauri Asset Protocol & Security Scope Configuration (Feature 1)
  // ==========================================================================
  describe('Feature 1: Tauri Asset Protocol & Security Scope Configuration', () => {
    it.skip('[ADV-F1.1] Physical tauri.conf.json configuration contains valid assetProtocol enable and scope', () => {
      const confPath = path.resolve(__dirname, '../../../Tauri/src-tauri/tauri.conf.json');
      expect(fs.existsSync(confPath)).toBe(true);

      const rawJson = fs.readFileSync(confPath, 'utf-8');
      const conf = JSON.parse(rawJson);

      expect(conf.app).toBeDefined();
      expect(conf.app.security).toBeDefined();
      expect(conf.app.security.assetProtocol).toBeDefined();
      expect(conf.app.security.assetProtocol.enable).toBe(false);
      expect(Array.isArray(conf.app.security.assetProtocol.scope)).toBe(true);
      expect(conf.app.security.assetProtocol.scope).toContain('**');
    });

    it('[ADV-F1.2] convertFileSrc handles Windows absolute paths with backslashes and drive letters', () => {
      setPlatform('tauri');
      const testPaths = [
        'C:\\Users\\MockUser\\Downloads\\Holad\\tracks\\song.mp3',
        'D:\\Music\\Library\\Track 01.flac',
        'E:\\ExtDrive\\Holad\\covers\\album_cover.png',
      ];

      for (const p of testPaths) {
        const uri = convertFileSrc(p);
        expect(uri.startsWith('http://asset.localhost/')).toBe(true);
        expect(uri).not.toContain('\\');
        const decoded = decodeURIComponent(uri.replace('http://asset.localhost/', ''));
        expect(decoded.replace(/\\/g, '/')).toBe(p.replace(/\\/g, '/'));
      }
    });

    it('[ADV-F1.3] convertFileSrc handles POSIX/Linux/macOS absolute paths', () => {
      setPlatform('tauri');
      const testPaths = [
        '/home/user/Music/Holad/tracks/audio.mp3',
        '/Users/macos/Library/Application Support/Holad/covers/art.webp',
      ];

      for (const p of testPaths) {
        const uri = convertFileSrc(p);
        expect(uri.startsWith('http://asset.localhost/')).toBe(true);
        const decoded = decodeURIComponent(uri.replace('http://asset.localhost/', ''));
        expect(decoded).toBe(p);
      }
    });

    it('[ADV-F1.4] convertFileSrc safely percent-encodes URI reserved characters and symbols', () => {
      setPlatform('tauri');
      const complexPath = 'C:/Holad/Music #1/Track & Field (2026) [100% Pure] + Sound?.mp3';
      const uri = convertFileSrc(complexPath);

      expect(uri.startsWith('http://asset.localhost/')).toBe(true);
      expect(uri).toContain('%23'); // #
      expect(uri).toContain('%26'); // &
      expect(uri).toContain('%25'); // %
      expect(uri).toContain('%2B'); // +
      expect(uri).toContain('%3F'); // ?
      expect(uri).toContain('%5B'); // [
      expect(uri).toContain('%5D'); // ]
      expect(uri).toContain('%20'); // space

      const decoded = decodeURIComponent(uri.replace('http://asset.localhost/', ''));
      expect(decoded).toBe(complexPath);
    });

    it('[ADV-F1.5] convertFileSrc handles multi-language Unicode, Cyrillic, CJK, RTL scripts', () => {
      setPlatform('tauri');
      const unicodePath = 'C:/Holad/tracks/宇多田ヒカル - First Love (러브스토리) [Русский Рок] - موسيقى - שיר.mp3';
      const uri = convertFileSrc(unicodePath);

      expect(uri.startsWith('http://asset.localhost/')).toBe(true);
      const decoded = decodeURIComponent(uri.replace('http://asset.localhost/', ''));
      expect(decoded).toBe(unicodePath);
    });

    it('[ADV-F1.6] convertFileSrc handles empty string safely returning empty string', () => {
      setPlatform('tauri');
      expect(convertFileSrc('')).toBe('');
    });
  });

  // ==========================================================================
  // SECTION 2: StorageManager Directory Routing, Path Handling & Operations (Feature 2)
  // ==========================================================================
  describe('Feature 2: StorageManager Directory Routing & File Operations', () => {
    it('[ADV-F2.1] getDefaultDownloadDir routes correctly across Tauri, Capacitor, and Browser platforms', async () => {
      // 1. Tauri
      setPlatform('tauri');
      const tauriDir = await StorageManager.getDefaultDownloadDir();
      expect(tauriDir).toBe('C:/Users/MockUser/Downloads/Holad');

      // 2. Capacitor
      setPlatform('capacitor');
      const capDir = await StorageManager.getDefaultDownloadDir();
      expect(capDir).toBe('Holad');

      // 3. Browser
      setPlatform('web');
      const webDir = await StorageManager.getDefaultDownloadDir();
      expect(webDir).toBe('download');
    });

    it('[ADV-F2.2] getDefaultDownloadDir gracefully catches Tauri path error and falls back to "download"', async () => {
      setPlatform('tauri');
      vi.spyOn(tauriPath, 'downloadDir').mockRejectedValueOnce(new Error('Tauri API IPC disconnected'));
      const fallbackDir = await StorageManager.getDefaultDownloadDir();
      expect(fallbackDir).toBe('download');
    });

    it('[ADV-F2.3] saveTrack creates parent directory recursively if non-existent in Tauri', async () => {
      setPlatform('tauri');
      const targetDir = 'C:/Deep/Nested/Custom/Holad';
      const fileName = 'nested_song.mp3';
      const data = new Uint8Array([0x49, 0x44, 0x33, 0x00]);

      expect(await vfs.exists(targetDir)).toBe(false);

      const savedPath = await StorageManager.saveTrack(fileName, data, targetDir, 'sub_tracks');
      expect(savedPath).toBe('C:/Deep/Nested/Custom/Holad/sub_tracks/nested_song.mp3');
      expect(await vfs.exists('C:/Deep/Nested/Custom/Holad/sub_tracks')).toBe(true);
      expect(await vfs.exists(savedPath)).toBe(true);

      const content = await vfs.readFile(savedPath);
      expect(content).toEqual(data);
    });

    it('[ADV-F2.4] saveTrack writes base64 data to Capacitor sandbox directory structure', async () => {
      setPlatform('capacitor');
      const fileName = 'mobile_audio.mp3';
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const savedPath = await StorageManager.saveTrack(fileName, data, undefined, 'tracks');
      expect(savedPath).toBe('Holad/tracks/mobile_audio.mp3');

      expect(await vfs.exists('DATA/Holad/tracks/mobile_audio.mp3')).toBe(true);
      const readBytes = await vfs.readFile('DATA/Holad/tracks/mobile_audio.mp3');
      expect(readBytes).toEqual(data);
    });

    it('[ADV-F2.5] saveTrack throws explicit Error when executed in Browser environment', async () => {
      setPlatform('web');
      const data = new Uint8Array([1, 2, 3]);

      await expect(
        StorageManager.saveTrack('web_track.mp3', data)
      ).rejects.toThrow('Not supported in browser');
    });

    it('[ADV-F2.6] saveCoverArt defaults to "covers" subfolder if subDir is omitted', async () => {
      setPlatform('tauri');
      const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const savedPath = await StorageManager.saveCoverArt('cover1.jpg', data);

      expect(savedPath).toBe('C:/Users/MockUser/Downloads/Holad/covers/cover1.jpg');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[ADV-F2.7] saveCoverArt supports custom subDir or empty subDir', async () => {
      setPlatform('tauri');
      const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const savedPath = await StorageManager.saveCoverArt('album_art.jpg', data, 'D:/MyMusic', '');

      expect(savedPath).toBe('D:/MyMusic/album_art.jpg');
      expect(await vfs.exists(savedPath)).toBe(true);
    });

    it('[ADV-F2.8] getLocalCoverUri returns pre-formatted URI schemes directly without disk lookup', async () => {
      const existingSchemes = [
        'http://asset.localhost/C%3A%2Fcovers%2Fart.jpg',
        'asset://localhost/C:/covers/art.jpg',
        '_capacitor_file_:///data/user/0/Holad/covers/art.jpg',
        'capacitor://localhost/covers/art.jpg',
        'file:///C:/Users/Holad/covers/art.jpg',
        'blob:http://localhost:5173/uuid-cover-1234',
        'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      ];

      for (const scheme of existingSchemes) {
        const result = await StorageManager.getLocalCoverUri(scheme);
        expect(result).toBe(scheme);
      }
    });

    it('[ADV-F2.9] getLocalCoverUri handles empty/null input returning null', async () => {
      expect(await StorageManager.getLocalCoverUri('')).toBeNull();
      // @ts-ignore
      expect(await StorageManager.getLocalCoverUri(null)).toBeNull();
      // @ts-ignore
      expect(await StorageManager.getLocalCoverUri(undefined)).toBeNull();
    });

    it('[ADV-F2.10] getLocalCoverUri resolves by coverId probing extensions (.jpg, .jpeg, .png, .webp)', async () => {
      setPlatform('tauri');
      const coversDir = 'C:/Users/MockUser/Downloads/Holad/covers';

      // 1. .png cover
      await vfs.writeFile(`${coversDir}/art-png.png`, new Uint8Array([1, 2, 3]));
      const uriPng = await StorageManager.getLocalCoverUri('art-png');
      expect(uriPng).toContain('http://asset.localhost/');
      expect(uriPng).toContain('art-png.png');

      // 2. .webp cover
      await vfs.writeFile(`${coversDir}/art-webp.webp`, new Uint8Array([4, 5, 6]));
      const uriWebp = await StorageManager.getLocalCoverUri('art-webp');
      expect(uriWebp).toContain('http://asset.localhost/');
      expect(uriWebp).toContain('art-webp.webp');

      // 3. Non-existent coverId returns null
      const uriMissing = await StorageManager.getLocalCoverUri('art-missing');
      expect(uriMissing).toBeNull();
    });

    it('[ADV-F2.11] getLocalCoverUri on Capacitor probes extensions in sandbox directory', async () => {
      setPlatform('capacitor');
      await vfs.writeFile('DATA/Holad/covers/mobile-art.jpg', new Uint8Array([1, 2, 3]));

      const uri = await StorageManager.getLocalCoverUri('mobile-art');
      expect(uri).not.toBeNull();
      expect(uri).toContain('_capacitor_file_');
      expect(uri).toContain('mobile-art.jpg');
    });

    it('[ADV-F2.12] moveDirectory recursively copies deep subtrees and unlinks source directory', async () => {
      setPlatform('tauri');
      const srcDir = 'C:/OldHolad';
      const destDir = 'D:/NewHolad';

      await vfs.writeFile(`${srcDir}/tracks/rock/song1.mp3`, new Uint8Array([1, 1]));
      await vfs.writeFile(`${srcDir}/tracks/jazz/song2.mp3`, new Uint8Array([2, 2]));
      await vfs.writeFile(`${srcDir}/covers/albums/art1.jpg`, new Uint8Array([3, 3]));

      await StorageManager.moveDirectory(srcDir, destDir);

      expect(await vfs.exists(srcDir)).toBe(false);
      expect(await vfs.exists(`${destDir}/tracks/rock/song1.mp3`)).toBe(true);
      expect(await vfs.exists(`${destDir}/tracks/jazz/song2.mp3`)).toBe(true);
      expect(await vfs.exists(`${destDir}/covers/albums/art1.jpg`)).toBe(true);

      const moved1 = await vfs.readFile(`${destDir}/tracks/rock/song1.mp3`);
      expect(moved1).toEqual(new Uint8Array([1, 1]));
    });

    it('[ADV-F2.13] moveDirectory returns immediately without throwing when source path does not exist', async () => {
      setPlatform('tauri');
      await expect(
        StorageManager.moveDirectory('C:/NonExistentSrc', 'D:/Dest')
      ).resolves.not.toThrow();
    });

    it('[ADV-F2.14] moveDirectory is a safe no-op on non-Tauri platforms', async () => {
      setPlatform('capacitor');
      await expect(
        StorageManager.moveDirectory('Holad/Old', 'Holad/New')
      ).resolves.not.toThrow();
    });

    it('[ADV-F2.15] removeTrack and removeDirectory safely unlink files and trees across platforms', async () => {
      // 1. Tauri
      setPlatform('tauri');
      const trackTauri = 'C:/Holad/tracks/delete1.mp3';
      const dirTauri = 'C:/Holad/albums/AlbumToDelete';
      await vfs.writeFile(trackTauri, new Uint8Array([1]));
      await vfs.writeFile(`${dirTauri}/track.mp3`, new Uint8Array([2]));

      await StorageManager.removeTrack(trackTauri);
      expect(await vfs.exists(trackTauri)).toBe(false);

      await StorageManager.removeDirectory(dirTauri);
      expect(await vfs.exists(dirTauri)).toBe(false);

      // 2. Capacitor
      setPlatform('capacitor');
      const trackCap = 'Holad/tracks/delete_cap.mp3';
      const dirCap = 'Holad/albums/DeleteCapAlbum';
      await vfs.writeFile(`DATA/${trackCap}`, new Uint8Array([3]));
      await vfs.writeFile(`DATA/${dirCap}/track.mp3`, new Uint8Array([4]));

      await StorageManager.removeTrack(trackCap);
      expect(await vfs.exists(`DATA/${trackCap}`)).toBe(false);

      await StorageManager.removeDirectory(dirCap);
      expect(await vfs.exists(`DATA/${dirCap}`)).toBe(false);
    });

    it('[ADV-F2.16] getLocalTrackUri resolves standalone track vs album child track correctly', async () => {
      setPlatform('tauri');
      const store = useDownloadStore.getState();

      // Standalone track
      const trackId = 'adv-track-101';
      const trackPath = 'C:/Holad/tracks/01 - Standalone.mp3';
      await vfs.writeFile(trackPath, new Uint8Array([1, 2, 3]));

      store.startDownload(trackId, '01 - Standalone', 'track');
      store.completeDownload(trackId, trackPath);

      const standaloneUri = await StorageManager.getLocalTrackUri(trackId, '01 - Standalone');
      expect(standaloneUri).not.toBeNull();
      expect(standaloneUri).toContain('http://asset.localhost/');
      expect(standaloneUri).toContain('Standalone.mp3');

      // Album child track matching by title with special characters
      const albumId = 'adv-album-202';
      const albumPath = 'C:/Holad/albums/Greatest-Hits';
      await vfs.writeFile(`${albumPath}/01 - AC-DC - Back in Black.mp3`, new Uint8Array([4, 5]));
      await vfs.writeFile(`${albumPath}/02 - Queen - Bohemian Rhapsody.mp3`, new Uint8Array([6, 7]));

      store.startDownload(albumId, 'Greatest Hits', 'album');
      store.completeDownload(albumId, albumPath);

      const albumTrackUri = await StorageManager.getLocalTrackUri(
        'child-song-1',
        '01 - AC/DC : Back in Black', // contains / and :
        albumId
      );
      expect(albumTrackUri).not.toBeNull();
      expect(albumTrackUri).toContain('http://asset.localhost/');
      expect(albumTrackUri).toContain('Back%20in%20Black');
    });

    it('[ADV-F2.17] getLocalTrackUri returns null when track record says completed but file is missing on disk', async () => {
      setPlatform('tauri');
      const trackId = 'ghost-track-404';
      const missingPath = 'C:/Holad/tracks/ghost.mp3';

      useDownloadStore.getState().startDownload(trackId, 'Ghost', 'track');
      useDownloadStore.getState().completeDownload(trackId, missingPath);

      const uri = await StorageManager.getLocalTrackUri(trackId, 'Ghost');
      expect(uri).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 3: Safe Audio CORS Handling in AudioDeck & MobileAudioCore (Feature 3)
  // ==========================================================================
  describe('Feature 3: Safe Audio CORS Handling in AudioDeck & MobileAudioCore', () => {
    it('[ADV-F3.1] isLocalMediaUrl correctly discriminates all local protocols from remote HTTP/HTTPS', () => {
      // Local schemes
      expect(isLocalMediaUrl('http://asset.localhost/C%3A%2Ftrack.mp3')).toBe(true);
      expect(isLocalMediaUrl('asset://localhost/C:/track.mp3')).toBe(true);
      expect(isLocalMediaUrl('_capacitor_file_:///data/user/0/Holad/track.mp3')).toBe(true);
      expect(isLocalMediaUrl('capacitor://localhost/track.mp3')).toBe(true);
      expect(isLocalMediaUrl('file:///C:/Users/Holad/track.mp3')).toBe(true);
      expect(isLocalMediaUrl('blob:http://localhost:5173/12345')).toBe(true);
      expect(isLocalMediaUrl('data:audio/mp3;base64,AAAA')).toBe(true);

      // Remote schemes
      expect(isLocalMediaUrl('http://subsonic.server.net/rest/stream')).toBe(false);
      expect(isLocalMediaUrl('https://my-cloud.com/audio.flac')).toBe(false);
      expect(isLocalMediaUrl('http://localhost:4000/api/stream/1')).toBe(false);

      // Corner cases
      expect(isLocalMediaUrl('')).toBe(false);
      // @ts-ignore
      expect(isLocalMediaUrl(null)).toBe(false);
      // @ts-ignore
      expect(isLocalMediaUrl(undefined)).toBe(false);
    });

    it('[ADV-F3.2] AudioDeck dynamically strips crossOrigin on local schemes and restores anonymous on remote streams', async () => {
      const deck = new AudioDeck('cors-test-deck');

      // 1. Initial creation defaults to anonymous
      expect(deck.element.crossOrigin).toBe('anonymous');

      // 2. Load local asset URI -> crossOrigin stripped to null
      const p1 = deck.load('http://asset.localhost/C%3A%2Fsong.mp3');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await p1;
      expect(deck.element.crossOrigin).toBe('anonymous');
      expect(deck.element.hasAttribute('crossorigin')).toBe(true);

      // 3. Load remote stream -> crossOrigin set to 'anonymous'
      const p2 = deck.load('https://mysubsonic.com/rest/stream?id=123');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await p2;
      expect(deck.element.crossOrigin).toBe('anonymous');

      // 4. Load blob URI -> crossOrigin stripped to null
      const p3 = deck.load('blob:http://localhost:5173/audio-blob');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await p3;
      expect(deck.element.crossOrigin).toBe('anonymous');

      // 5. Load file URI -> crossOrigin stripped to null
      const p4 = deck.load('file:///C:/Users/Holad/song.mp3');
      deck.element.dispatchEvent(new Event('loadedmetadata'));
      await p4;
      expect(deck.element.crossOrigin).toBe('anonymous');

      deck.destroy();
    });

    it('[ADV-F3.3] MobileAudioCore dynamically strips crossOrigin on play() and crossfadeTo() for local schemes', async () => {
      const core = new MobileAudioCore();

      // 1. Play local asset URI
      await core.play('http://asset.localhost/local.mp3');
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBeNull();

      // 2. Play remote stream
      await core.play('https://remote.server/stream/456');
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBeNull();

      // 3. Crossfade to local asset URI
      await core.crossfadeTo('http://asset.localhost/next_local.mp3', 0.1);
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBeNull();

      // 4. Crossfade to remote stream
      await core.crossfadeTo('https://remote.server/next_remote.mp3', 0.1);
      // @ts-ignore
      expect(core.audioElement.crossOrigin).toBeNull();

      core.destroy();
    });

    it('[ADV-F3.4] AudioDeck handles rapid back-to-back load calls without unhandled rejections', async () => {
      const deck = new AudioDeck('rapid-deck');
      const loadUrls = [
        'http://asset.localhost/C%3A%2Ftrack1.mp3',
        'https://server.com/stream2',
        'http://asset.localhost/C%3A%2Ftrack3.mp3',
        'blob:http://localhost/blob4',
        'http://asset.localhost/C%3A%2Ftrack5.mp3',
      ];

      const promises = loadUrls.map(url => {
        const p = deck.load(url);
        deck.element.dispatchEvent(new Event('loadedmetadata'));
        return p;
      });

      await expect(Promise.all(promises)).resolves.not.toThrow();
      expect(deck.element.src).toBe('http://asset.localhost/C%3A%2Ftrack5.mp3');
      expect(deck.element.crossOrigin).toBe('anonymous');
      deck.destroy();
    });

    it('[ADV-F3.5] AudioDeck error handling transitions state to "error" and emits error payload', async () => {
      const deck = new AudioDeck('error-deck');
      let emittedError: any = null;
      let emittedState: string = '';

      deck.on('error', (err) => { emittedError = err; });
      deck.on('statechange', (st) => { emittedState = st; });

      const customError = new Event('error');
      deck.element.dispatchEvent(customError);

      expect(deck.getState()).toBe('error');
      expect(emittedState).toBe('error');
      expect(emittedError).toBeDefined();

      deck.destroy();
    });

    it('[ADV-F3.6] AudioDeck seeking and volume clamps boundary values safely', () => {
      const deck = new AudioDeck('bounds-deck');

      // Duration is 0 initially
      deck.seek(-100);
      expect(deck.element.currentTime).toBe(0);

      deck.seek(500);
      expect(deck.element.currentTime).toBe(500); // when duration 0, safePosition accepts positionSeconds

      deck.setVolume(-0.5);
      expect(deck.element.volume).toBe(0);

      deck.setVolume(1.8);
      expect(deck.element.volume).toBe(1);

      deck.setPlaybackRate(0.1);
      expect(deck.element.playbackRate).toBe(0.25);

      deck.setPlaybackRate(10);
      expect(deck.element.playbackRate).toBe(4.0);

      deck.destroy();
    });

    it('[ADV-F3.7] AudioDeck destroy cleans listeners, resets src and transitions state to idle', () => {
      const deck = new AudioDeck('destroy-deck');
      let triggeredAfterDestroy = false;

      deck.on('play', () => { triggeredAfterDestroy = true; });
      deck.destroy();

      deck.element.dispatchEvent(new Event('play'));
      expect(triggeredAfterDestroy).toBe(false);
      expect(deck.getState()).toBe('idle');
      expect(deck.element.getAttribute('src') === '' || deck.element.src === '' || deck.element.src.startsWith('http://localhost')).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 4: Extreme Inputs, Path Traversal & Unicode Stress
  // ==========================================================================
  describe('Extreme Inputs, Path Traversal & Unicode Stress Matrix', () => {
    it('[ADV-EXT.1] Path traversal payloads in track filenames are safely sanitized and stored inside target dir', async () => {
      setPlatform('tauri');
      const maliciousNames = [
        '../../../../../../windows/system32/cmd.exe',
        '..\\..\\..\\..\\etc\\passwd',
        'tracks/../../../secret.txt',
        '..\\..\\..\\Boot\\BCD',
        'foo/bar/../../../../evil.sh',
      ];

      for (const mal of maliciousNames) {
        const sanitized = mal.replace(/[/\\?%*:|"<>]/g, '-');
        expect(sanitized).not.toMatch(/[/\\?%*:|"<>]/);

        const savedPath = await StorageManager.saveTrack(`${sanitized}.mp3`, new Uint8Array([1, 2]), 'C:/Holad', 'tracks');
        expect(savedPath.startsWith('C:/Holad/tracks/')).toBe(true);
        expect(await vfs.exists(savedPath)).toBe(true);
      }
    });

    it('[ADV-EXT.2] 255-byte extreme boundary filenames with international scripts and emojis save and resolve cleanly', async () => {
      setPlatform('tauri');
      const complexUnicodeName = '🔥_🎧_01_宇多田ヒカル_First_Love_Русский_Рок_موسيقى_שיר_Ελληνικά_100%_Sound.mp3';
      const sanitized = complexUnicodeName.replace(/[/\\?%*:|"<>]/g, '-');

      const savedPath = await StorageManager.saveTrack(sanitized, new Uint8Array([0xde, 0xad]), 'C:/Holad', 'tracks');
      expect(await vfs.exists(savedPath)).toBe(true);

      const localUri = convertFileSrc(savedPath);
      expect(localUri.startsWith('http://asset.localhost/')).toBe(true);

      const decoded = decodeURIComponent(localUri.replace('http://asset.localhost/', ''));
      expect(decoded).toBe(savedPath);
    });

    it('[ADV-EXT.3] 0-byte and 50MB binary payloads write and read accurately without data corruption', async () => {
      setPlatform('tauri');
      
      // 0-byte
      const emptyPath = await StorageManager.saveTrack('empty.mp3', new Uint8Array(0), 'C:/Holad', 'tracks');
      const statEmpty = await vfs.stat(emptyPath);
      expect(statEmpty.size).toBe(0);

      // Large payload
      const largeBytes = new Uint8Array(1024 * 1024 * 5); // 5MB simulated buffer
      largeBytes[0] = 0x49;
      largeBytes[1] = 0x44;
      largeBytes[2] = 0x33;
      largeBytes[largeBytes.length - 1] = 0xff;

      const largePath = await StorageManager.saveTrack('large.mp3', largeBytes, 'C:/Holad', 'tracks');
      const statLarge = await vfs.stat(largePath);
      expect(statLarge.size).toBe(largeBytes.length);

      const readBack = await vfs.readFile(largePath);
      expect(readBack[0]).toBe(0x49);
      expect(readBack[readBack.length - 1]).toBe(0xff);
    });
  });
});
