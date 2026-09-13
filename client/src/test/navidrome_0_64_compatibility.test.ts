import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTopSongs } from '../api/subsonic';
import { useDownloadStore, isItemDownloaded } from '../store/downloadStore';
import { findDownloadedTrackMatch, generateTrackFingerprint } from '../utils/trackFingerprint';
import { StorageManager } from '../utils/StorageManager';

describe('Navidrome 0.64.0 Compatibility Suite', () => {
  beforeEach(() => {
    (window as any).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue(true),
      convertFileSrc: (filePath: string) => `http://asset.localhost/${filePath}`
    };
    useDownloadStore.setState({ downloads: {} });
    vi.restoreAllMocks();
  });

  describe('1. OpenSubsonic topSongsByArtistId (#5853)', () => {
    it('passes both id and artist parameter when artistId is provided', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            'subsonic-response': {
              status: 'ok',
              topSongs: { song: [{ id: 'song-1', title: 'Creep' }] }
            }
          })
        } as any);
      });

      const songs = await getTopSongs('Radiohead', 50, 'artist-canonical-128bit-base62');
      expect(songs).toHaveLength(1);
      expect(songs[0].title).toBe('Creep');

      // Verify captured URL has id and artist
      const parsedUrl = new URL(capturedUrl, 'http://localhost');
      expect(parsedUrl.searchParams.get('artist')).toBe('Radiohead');
      expect(parsedUrl.searchParams.get('id')).toBe('artist-canonical-128bit-base62');
      expect(parsedUrl.searchParams.get('count')).toBe('50');
    });

    it('falls back to artist parameter only when artistId is omitted for backward compatibility', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation((url: string) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            'subsonic-response': {
              status: 'ok',
              topSongs: { song: [] }
            }
          })
        } as any);
      });

      await getTopSongs('Thom Yorke', 20);
      const parsedUrl = new URL(capturedUrl, 'http://localhost');
      expect(parsedUrl.searchParams.get('artist')).toBe('Thom Yorke');
      expect(parsedUrl.searchParams.get('id')).toBeNull();
      expect(parsedUrl.searchParams.get('count')).toBe('20');
    });
  });

  describe('2. Fingerprint & Metadata Matching (findDownloadedTrackMatch)', () => {
    const legacyTrackItem = {
      id: 'd41d8cd98f00b204e9800998ecf8427e', // Legacy 32-hex MD5
      name: 'Karma Police',
      title: 'Karma Police',
      artist: 'Radiohead',
      album: 'OK Computer',
      albumId: 'c4ca4238a0b923820dcc509a6f75849b',
      duration: 261,
      path: 'C:/Music/Radiohead/OK Computer/06 Karma Police.mp3',
      status: 'completed' as const,
      progress: 100,
      timestamp: 1600000000,
      type: 'track' as const,
      fingerprint: generateTrackFingerprint({
        title: 'Karma Police',
        artist: 'Radiohead',
        album: 'OK Computer',
        duration: 261,
        path: 'C:/Music/Radiohead/OK Computer/06 Karma Police.mp3'
      })
    };

    it('matches downloaded item by precalculated fingerprint despite completely different Base62 ID', () => {
      const downloads = { [legacyTrackItem.id]: legacyTrackItem };
      const newMigratedTrack = {
        id: '4aZ9kL1mN2oP3qR4sT5uV6', // 22-char canonical Base62 ID
        title: 'Karma Police',
        artist: 'Radiohead',
        album: 'OK Computer',
        duration: 261,
        path: 'C:/Music/Radiohead/OK Computer/06 Karma Police.mp3'
      };

      const match = findDownloadedTrackMatch(downloads, newMigratedTrack);
      expect(match).not.toBeNull();
      expect(match?.id).toBe('d41d8cd98f00b204e9800998ecf8427e');
      expect(match?.path).toBe('C:/Music/Radiohead/OK Computer/06 Karma Police.mp3');
    });

    it('matches by semantic confidence (title + artist + duration within 2s) when path differs', () => {
      const downloads = { [legacyTrackItem.id]: legacyTrackItem };
      const newMigratedTrack = {
        id: '4aZ9kL1mN2oP3qR4sT5uV6',
        title: 'Karma Police',
        artist: 'Radiohead',
        album: 'OK Computer',
        duration: 262, // 1 second difference
        path: '/var/navidrome/music/Radiohead/OK Computer/Karma Police.flac' // Server path differs
      };

      const match = findDownloadedTrackMatch(downloads, newMigratedTrack);
      expect(match).not.toBeNull();
      expect(match?.id).toBe(legacyTrackItem.id);
    });

    it('does not false-positive match a different song by the same artist', () => {
      const downloads = { [legacyTrackItem.id]: legacyTrackItem };
      const differentTrack = {
        id: '7bX8yW9vU0tS1rQ2pP3oN4',
        title: 'Paranoid Android',
        artist: 'Radiohead',
        album: 'OK Computer',
        duration: 383
      };

      const match = findDownloadedTrackMatch(downloads, differentTrack);
      expect(match).toBeNull();
    });
  });

  describe('3. isItemDownloaded and Auto-healing Aliasing', () => {
    it('returns true and auto-aliases download under new Base62 ID', () => {
      const legacyId = 'legacy-hex-id-001';
      const newId = 'base62-canonical-id-002';

      useDownloadStore.setState({
        downloads: {
          [legacyId]: {
            id: legacyId,
            name: 'No Surprises',
            title: 'No Surprises',
            artist: 'Radiohead',
            album: 'OK Computer',
            albumId: 'legacy-album-001',
            duration: 228,
            path: 'C:/Music/No Surprises.mp3',
            status: 'completed',
            progress: 100,
            timestamp: 1600000000,
            type: 'track'
          }
        }
      });

      const storeBefore = useDownloadStore.getState();
      expect(storeBefore.downloads[newId]).toBeUndefined();

      // Check download status with new track object
      const isDownloaded = isItemDownloaded(
        storeBefore.downloads,
        newId,
        'new-album-id',
        {
          id: newId,
          title: 'No Surprises',
          artist: 'Radiohead',
          album: 'OK Computer',
          duration: 228
        }
      );

      expect(isDownloaded).toBe(true);

      // Verify auto-healing alias was created in store
      const storeAfter = useDownloadStore.getState();
      expect(storeAfter.downloads[newId]).toBeDefined();
      expect(storeAfter.downloads[newId].status).toBe('completed');
      expect(storeAfter.downloads[newId].path).toBe('C:/Music/No Surprises.mp3');
      expect(storeAfter.downloads[newId].aliasedFrom).toBe(legacyId);
    });

    it('recognizes completed album downloads across ID migrations', () => {
      const legacyAlbumId = 'legacy-album-hex-33';
      const newAlbumId = 'canonical-album-base62-44';

      useDownloadStore.setState({
        downloads: {
          [legacyAlbumId]: {
            id: legacyAlbumId,
            name: 'In Rainbows',
            title: 'In Rainbows',
            artist: 'Radiohead',
            album: 'In Rainbows',
            path: 'C:/Music/In Rainbows',
            status: 'completed',
            progress: 100,
            timestamp: 1600000000,
            type: 'album'
          }
        }
      });

      const store = useDownloadStore.getState();
      const isDownloaded = isItemDownloaded(
        store.downloads,
        newAlbumId,
        newAlbumId,
        {
          id: newAlbumId,
          name: 'In Rainbows',
          title: 'In Rainbows',
          artist: 'Radiohead'
        }
      );

      expect(isDownloaded).toBe(true);
      expect(useDownloadStore.getState().downloads[newAlbumId]).toBeDefined();
    });
  });

  describe('4. StorageManager Local Track URI Resolution', () => {
    it('resolves local audio URI for new Base62 ID from legacy download', async () => {
      const legacyId = 'legacy-track-md5';
      const newId = 'new-track-base62';
      const localFilePath = 'C:/Users/User/Music/Holad/tracks/Exit Music.mp3';

      useDownloadStore.setState({
        downloads: {
          [legacyId]: {
            id: legacyId,
            name: 'Exit Music (For a Film)',
            title: 'Exit Music (For a Film)',
            artist: 'Radiohead',
            album: 'OK Computer',
            duration: 265,
            path: localFilePath,
            status: 'completed',
            progress: 100,
            timestamp: 1600000000,
            type: 'track'
          }
        }
      });

      const trackObj = {
        id: newId,
        title: 'Exit Music (For a Film)',
        artist: 'Radiohead',
        album: 'OK Computer',
        duration: 265
      };

      const resolvedUri = await StorageManager.getLocalTrackUri(
        newId,
        trackObj.title,
        undefined,
        trackObj
      );

      expect(resolvedUri).toBeTruthy();
    });
  });
});
