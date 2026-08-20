import { vi } from 'vitest';
import { useDownloadStore } from '../../store/downloadStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useAudioStore } from '../../store/audioStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';

// ============================================================================
// 1. In-Memory Virtual Filesystem (VFS) and Mock State Definitions
// ============================================================================

export interface VFSStat {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  mtime: number;
}

export interface VFSDirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  size?: number;
}

export interface MockSongItem {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId: string;
  duration: number;
  size?: number;
  coverArt?: string;
  path?: string;
  track?: number;
  year?: number;
  genre?: string;
}

export interface MockAlbumItem {
  id: string;
  name: string;
  title?: string;
  album?: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount: number;
  duration?: number;
  song: MockSongItem[];
}

const { vfs: vfsInstance, mockState: mockStateInstance } = vi.hoisted(() => {
  class VirtualFileSystem {
    private files = new Map<string, { data: Uint8Array; mtime: number }>();
    private directories = new Set<string>();

    constructor() {
      this.directories.add('');
      this.directories.add('/');
      this.directories.add('C:');
      this.directories.add('C:/');
      this.directories.add('Holad');
    }

    public normalize(pathStr: string): string {
      if (!pathStr) return '';
      let p = pathStr.replace(/\\/g, '/');
      // Collapse multiple slashes
      p = p.replace(/\/+/g, '/');
      // Trim trailing slash unless it's root
      if (p.length > 1 && p.endsWith('/')) {
        p = p.slice(0, -1);
      }
      return p;
    }

    public async writeFile(pathStr: string, data: Uint8Array | ArrayBuffer | string): Promise<void> {
      const norm = this.normalize(pathStr);
      let bytes: Uint8Array;
      if (typeof data === 'string') {
        // Check if data is base64
        if (/^[A-Za-z0-9+/=]+$/.test(data) && data.length % 4 === 0 && !data.includes(' ')) {
          try {
            const binary = atob(data);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
          } catch {
            bytes = new TextEncoder().encode(data);
          }
        } else {
          bytes = new TextEncoder().encode(data);
        }
      } else if (data instanceof ArrayBuffer) {
        bytes = new Uint8Array(data);
      } else {
        bytes = data;
      }

      // Ensure parent directories exist
      const parts = norm.split('/');
      parts.pop(); // Remove filename
      let currentDir = '';
      for (const part of parts) {
        if (!part) continue;
        currentDir = currentDir ? `${currentDir}/${part}` : part;
        this.directories.add(currentDir);
      }

      this.files.set(norm, { data: bytes, mtime: Date.now() });
    }

    public async mkdir(pathStr: string, options?: { recursive?: boolean }): Promise<void> {
      const norm = this.normalize(pathStr);
      if (!norm) return;

      if (options?.recursive) {
        const parts = norm.split('/');
        let current = '';
        for (const part of parts) {
          if (!part) continue;
          current = current ? `${current}/${part}` : part;
          this.directories.add(current);
        }
      } else {
        this.directories.add(norm);
      }
    }

    public async exists(pathStr: string): Promise<boolean> {
      const norm = this.normalize(pathStr);
      return this.files.has(norm) || this.directories.has(norm);
    }

    public async readFile(pathStr: string): Promise<Uint8Array> {
      const norm = this.normalize(pathStr);
      const file = this.files.get(norm);
      if (!file) {
        throw new Error(`File not found: ${pathStr}`);
      }
      return file.data;
    }

    public async stat(pathStr: string): Promise<VFSStat> {
      const norm = this.normalize(pathStr);
      if (this.files.has(norm)) {
        const f = this.files.get(norm)!;
        return {
          size: f.data.length,
          isFile: true,
          isDirectory: false,
          mtime: f.mtime,
        };
      }
      if (this.directories.has(norm)) {
        return {
          size: 0,
          isFile: false,
          isDirectory: true,
          mtime: Date.now(),
        };
      }
      throw new Error(`Path does not exist: ${pathStr}`);
    }

    public async readDir(pathStr: string): Promise<VFSDirEntry[]> {
      const norm = this.normalize(pathStr);
      const prefix = norm ? (norm.endsWith('/') ? norm : `${norm}/`) : '';
      const prefixLen = prefix.length;
      const entries = new Map<string, VFSDirEntry>();

      // Check files
      for (const filePath of this.files.keys()) {
        if (filePath.startsWith(prefix) && filePath !== norm) {
          const rest = filePath.slice(prefixLen);
          const slashIdx = rest.indexOf('/');
          if (slashIdx === -1) {
            // Direct child file
            entries.set(rest, {
              name: rest,
              isFile: true,
              isDirectory: false,
              size: this.files.get(filePath)?.data.length || 0,
            });
          } else {
            // Subdirectory
            const dirName = rest.slice(0, slashIdx);
            if (!entries.has(dirName)) {
              entries.set(dirName, {
                name: dirName,
                isFile: false,
                isDirectory: true,
              });
            }
          }
        }
      }

      // Check explicit directories
      for (const dirPath of this.directories) {
        if (dirPath.startsWith(prefix) && dirPath !== norm && dirPath !== '') {
          const rest = dirPath.slice(prefixLen);
          const slashIdx = rest.indexOf('/');
          const dirName = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
          if (dirName && !entries.has(dirName)) {
            entries.set(dirName, {
              name: dirName,
              isFile: false,
              isDirectory: true,
            });
          }
        }
      }

      return Array.from(entries.values());
    }

    public async remove(pathStr: string, options?: { recursive?: boolean }): Promise<void> {
      const norm = this.normalize(pathStr);
      this.files.delete(norm);
      this.directories.delete(norm);

      if (options?.recursive) {
        const prefix = norm.endsWith('/') ? norm : `${norm}/`;
        for (const f of Array.from(this.files.keys())) {
          if (f.startsWith(prefix)) {
            this.files.delete(f);
          }
        }
        for (const d of Array.from(this.directories)) {
          if (d.startsWith(prefix)) {
            this.directories.delete(d);
          }
        }
      }
    }

    public async copyFile(srcStr: string, destStr: string): Promise<void> {
      const srcNorm = this.normalize(srcStr);
      const destNorm = this.normalize(destStr);
      const file = this.files.get(srcNorm);
      if (!file) {
        throw new Error(`Source file not found: ${srcStr}`);
      }
      await this.writeFile(destNorm, new Uint8Array(file.data));
    }

    public getTotalSize(prefixStr?: string): number {
      let total = 0;
      const prefix = prefixStr ? this.normalize(prefixStr) : '';
      for (const [path, file] of this.files.entries()) {
        if (!prefix || path.startsWith(prefix)) {
          total += file.data.length;
        }
      }
      return total;
    }

    public getAllFiles(): string[] {
      return Array.from(this.files.keys());
    }

    public clear(): void {
      this.files.clear();
      this.directories.clear();
      this.directories.add('');
      this.directories.add('/');
      this.directories.add('C:');
      this.directories.add('C:/');
      this.directories.add('Holad');
    }
  }

  const vfsInstance = new VirtualFileSystem();

  const mockStateInstance = {
    platform: 'tauri' as 'tauri' | 'capacitor' | 'web',
    online: true,
    songs: new Map<string, MockSongItem>(),
    albums: new Map<string, MockAlbumItem>(),
    starredSongs: [] as MockSongItem[],
    starredAlbums: [] as MockAlbumItem[],
    networkFailures: new Set<string>(), // endpoints to fail
    simulatedAudioBytes: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // ID3 header
    simulatedImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]), // JPEG header
  };

  return {
    vfs: vfsInstance,
    mockState: mockStateInstance,
  };
});

export const vfs = vfsInstance;
export const mockState = mockStateInstance;

// ============================================================================
// 2. Tauri v2 Module Mocks
// ============================================================================

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: vi.fn(async (path: string, data: Uint8Array | ArrayBuffer | string) => {
    return vfs.writeFile(path, data);
  }),
  mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    return vfs.mkdir(path, options);
  }),
  exists: vi.fn(async (path: string) => {
    return vfs.exists(path);
  }),
  remove: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    return vfs.remove(path, options);
  }),
  readDir: vi.fn(async (path: string) => {
    return vfs.readDir(path);
  }),
  stat: vi.fn(async (path: string) => {
    return vfs.stat(path);
  }),
  copyFile: vi.fn(async (src: string, dest: string) => {
    return vfs.copyFile(src, dest);
  }),
}));

vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: vi.fn(async () => 'C:/Users/MockUser/Downloads'),
  executableDir: vi.fn(async () => 'C:/Program Files/Holad'),
  appDataDir: vi.fn(async () => 'C:/Users/MockUser/AppData/Roaming/Holad'),
  join: vi.fn(async (...paths: string[]) => {
    return paths
      .filter(Boolean)
      .map(p => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
      .filter(p => p.length > 0)
      .join('/');
  }),
  resolve: vi.fn(async (...paths: string[]) => {
    return paths
      .filter(Boolean)
      .map(p => p.replace(/\\/g, '/'))
      .join('/');
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: vi.fn((filePath: string, _protocol: string = 'asset') => {
    if (!filePath) return '';
    const normalized = filePath.replace(/\\/g, '/');
    return `http://asset.localhost/${encodeURIComponent(normalized)}`;
  }),
  invoke: vi.fn(async (_cmd: string, _args?: any) => {
    return null;
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async (_options?: any) => 'C:/Users/MockUser/Music/CustomDownloads'),
  save: vi.fn(async (_options?: any) => 'C:/Users/MockUser/Music/export.zip'),
  message: vi.fn(async (_msg: string) => {}),
  ask: vi.fn(async (_msg: string) => true),
  confirm: vi.fn(async (_msg: string) => true),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(async (_path: string) => {}),
}));

vi.mock('@tauri-apps/plugin-autostart', () => ({
  enable: vi.fn(async () => {}),
  disable: vi.fn(async () => {}),
  isEnabled: vi.fn(async () => true),
}));

// ============================================================================
// 3. Capacitor Module Mocks
// ============================================================================

export const Directory = {
  Data: 'DATA',
  Documents: 'DOCUMENTS',
  Cache: 'CACHE',
  External: 'EXTERNAL',
  ExternalStorage: 'EXTERNAL_STORAGE',
  Library: 'LIBRARY',
} as const;

vi.mock('@capacitor/filesystem', () => {
  const resolveCapPath = (path: string, directory?: string) => {
    const normPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (directory) {
      return `${directory}/${normPath}`;
    }
    return normPath;
  };

  return {
    Directory: {
      Data: 'DATA',
      Documents: 'DOCUMENTS',
      Cache: 'CACHE',
      External: 'EXTERNAL',
      ExternalStorage: 'EXTERNAL_STORAGE',
      Library: 'LIBRARY',
    },
    Filesystem: {
      writeFile: vi.fn(async (options: { path: string; data: string; directory?: string; recursive?: boolean }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        await vfs.writeFile(fullPath, options.data);
        return { uri: `_capacitor_file_://${fullPath}` };
      }),
      readFile: vi.fn(async (options: { path: string; directory?: string }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        const data = await vfs.readFile(fullPath);
        // Return base64 representation
        let binary = '';
        for (let i = 0; i < data.length; i++) {
          binary += String.fromCharCode(data[i]);
        }
        return { data: btoa(binary) };
      }),
      stat: vi.fn(async (options: { path: string; directory?: string }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        const s = await vfs.stat(fullPath);
        return {
          type: s.isDirectory ? 'directory' : 'file',
          size: s.size,
          mtime: s.mtime,
          uri: `_capacitor_file_://${fullPath}`,
        };
      }),
      mkdir: vi.fn(async (options: { path: string; directory?: string; recursive?: boolean }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        await vfs.mkdir(fullPath, { recursive: options.recursive ?? true });
      }),
      deleteFile: vi.fn(async (options: { path: string; directory?: string }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        await vfs.remove(fullPath);
      }),
      rmdir: vi.fn(async (options: { path: string; directory?: string; recursive?: boolean }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        await vfs.remove(fullPath, { recursive: options.recursive ?? true });
      }),
      readdir: vi.fn(async (options: { path: string; directory?: string }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        const entries = await vfs.readDir(fullPath);
        return {
          files: entries.map(e => ({
            name: e.name,
            type: e.isDirectory ? ('directory' as const) : ('file' as const),
            size: e.size || 0,
            mtime: Date.now(),
            uri: `_capacitor_file_://${fullPath}/${e.name}`,
          })),
        };
      }),
      getUri: vi.fn(async (options: { path: string; directory?: string }) => {
        const fullPath = resolveCapPath(options.path, options.directory);
        return { uri: fullPath };
      }),
    },
  };
});

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    convertFileSrc: vi.fn((filePath: string) => {
      if (!filePath) return '';
      const clean = filePath.replace(/^file:\/\//, '');
      return `_capacitor_file_://${clean.replace(/^\/+/, '')}`;
    }),
    isNativePlatform: vi.fn(() => mockState.platform === 'capacitor'),
    getPlatform: vi.fn(() => (mockState.platform === 'capacitor' ? 'android' : 'web')),
    isPluginAvailable: vi.fn(() => true),
  },
}));

// ============================================================================
// 4. Subsonic API Mock & Chunked ReadableStream Simulator
// ============================================================================

export function registerMockSong(song: MockSongItem): void {
  mockState.songs.set(song.id, song);
}

export function registerMockAlbum(album: MockAlbumItem): void {
  mockState.albums.set(album.id, album);
  if (album.song) {
    for (const s of album.song) {
      mockState.songs.set(s.id, s);
    }
  }
}

export function registerStarredItems(songs: MockSongItem[], albums: MockAlbumItem[] = []): void {
  mockState.starredSongs = songs;
  mockState.starredAlbums = albums;
  for (const s of songs) mockState.songs.set(s.id, s);
  for (const a of albums) mockState.albums.set(a.id, a);
}

export function setSimulatedNetworkFailure(endpointKeyword: string, enable: boolean): void {
  if (enable) {
    mockState.networkFailures.add(endpointKeyword);
  } else {
    mockState.networkFailures.delete(endpointKeyword);
  }
}

/**
 * Creates a chunked ReadableStream of Uint8Array data that streams in N slices
 */
export function createChunkedStream(data: Uint8Array, numChunks: number = 3, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const chunkSize = Math.max(1, Math.ceil(data.length / numChunks));
  let offset = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal) {
        signal.addEventListener('abort', () => {
          try {
            controller.error(new DOMException('The operation was aborted', 'AbortError'));
          } catch {}
        });
      }
      function push() {
        if (signal?.aborted) {
          try {
            controller.error(new DOMException('The operation was aborted', 'AbortError'));
          } catch {}
          return;
        }
        if (offset >= data.length) {
          controller.close();
          return;
        }
        const nextOffset = Math.min(data.length, offset + chunkSize);
        const chunk = data.slice(offset, nextOffset);
        offset = nextOffset;
        controller.enqueue(chunk);
        // Microtask queue to allow progress events to fire asynchronously
        queueMicrotask(push);
      }
      push();
    },
  });
}

/**
 * Global fetch mock interceptor
 */
// oxlint-disable-next-line
const originalFetch = globalThis.fetch;

export function setupFetchMock(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    // Check if network is marked offline
    if (!mockState.online) {
      throw new TypeError('Failed to fetch: Network is offline');
    }

    // Check if URL matches simulated failure keywords
    for (const keyword of mockState.networkFailures) {
      if (urlStr.includes(keyword)) {
        return new Response('Simulated Network Failure', {
          status: 500,
          statusText: 'Internal Server Error',
        });
      }
    }

    const urlObj = new URL(urlStr, 'http://localhost:4040');
    const path = urlObj.pathname;
    const searchParams = urlObj.searchParams;

    // 1. Download Endpoint (/rest/download or stream)
    if (path.includes('download') || path.includes('/api/stream/')) {
      const songId = searchParams.get('id') || path.split('/').pop() || 'test-song';
      const song = mockState.songs.get(songId) || {
        id: songId,
        title: 'Simulated Track',
        artist: 'Simulated Artist',
        album: 'Simulated Album',
        albumId: 'sim-al-1',
        duration: 200,
      };

      const baseBytes = mockState.simulatedAudioBytes;
      // Build a 100KB payload with song info
      const totalSize = 1024 * 100;
      const audioData = new Uint8Array(totalSize);
      audioData.set(baseBytes, 0);
      for (let i = baseBytes.length; i < totalSize; i++) {
        audioData[i] = (i % 256);
      }

      const stream = createChunkedStream(audioData, 4, init?.signal);

      const headers = new Headers({
        'content-length': totalSize.toString(),
        'content-type': 'audio/mpeg',
        'content-disposition': `attachment; filename="${song.title.replace(/[/\\?%*:|"<>]/g, '-')}.mp3"`,
      });

      return new Response(stream, {
        status: 200,
        headers,
      });
    }

    // 2. Cover Art Endpoint (/rest/getCoverArt)
    if (path.includes('getCoverArt')) {
      const coverBytes = mockState.simulatedImageBytes;
      return new Response(coverBytes, {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': coverBytes.length.toString(),
        },
      });
    }

    // 3. Subsonic getSong Endpoint
    if (path.includes('getSong')) {
      const songId = searchParams.get('id') || 'track-1';
      const song = mockState.songs.get(songId) || {
        id: songId,
        title: 'Mock Track',
        artist: 'Mock Artist',
        album: 'Mock Album',
        albumId: 'album-1',
        duration: 180,
        coverArt: 'cover-1',
      };
      return new Response(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            song,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    // 4. Subsonic getAlbum Endpoint
    if (path.includes('getAlbum')) {
      const albumId = searchParams.get('id') || 'album-1';
      const album = mockState.albums.get(albumId) || {
        id: albumId,
        name: 'Mock Album',
        title: 'Mock Album',
        artist: 'Mock Artist',
        coverArt: 'cover-album-1',
        songCount: 2,
        song: [
          {
            id: `${albumId}-s1`,
            title: 'Album Song 1',
            artist: 'Mock Artist',
            album: 'Mock Album',
            albumId,
            duration: 190,
            coverArt: 'cover-album-1',
          },
          {
            id: `${albumId}-s2`,
            title: 'Album Song 2',
            artist: 'Mock Artist',
            album: 'Mock Album',
            albumId,
            duration: 210,
            coverArt: 'cover-album-1',
          },
        ],
      };
      return new Response(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            album,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    // 5. Subsonic getStarred Endpoint
    if (path.includes('getStarred')) {
      return new Response(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            starred: {
              song: mockState.starredSongs,
              album: mockState.starredAlbums,
            },
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    // 6. Ping endpoint
    if (path.includes('ping')) {
      return new Response(
        JSON.stringify({
          'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    // Default mock response
    return new Response(
      JSON.stringify({
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  });
}

// ============================================================================
// 5. Platform & Network State Switchers
// ============================================================================

export function setPlatform(platform: 'tauri' | 'capacitor' | 'web'): void {
  mockState.platform = platform;
  if (typeof window !== 'undefined') {
    if (platform === 'tauri') {
      (window as any).__TAURI_INTERNALS__ = { plugins: {} };
      delete (window as any).Capacitor;
    } else if (platform === 'capacitor') {
      delete (window as any).__TAURI_INTERNALS__;
      (window as any).Capacitor = {
        convertFileSrc: (path: string) => {
          if (!path) return '';
          const clean = path.replace(/^file:\/\//, '');
          return `_capacitor_file_://${clean.replace(/^\/+/, '')}`;
        },
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        isPluginAvailable: () => true,
      };
    } else {
      delete (window as any).__TAURI_INTERNALS__;
      delete (window as any).Capacitor;
    }
  }
}

export function setOnline(online: boolean): void {
  mockState.online = online;
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => online,
    });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  }
}

// ============================================================================
// 6. State Reset Utility & LocalStorage Mock
// ============================================================================

export function setupLocalStorageMock(): void {
  let store: Record<string, string> = {};
  const mockStorage: Storage = {
    get length() {
      return Object.keys(store).length;
    },
    key(index: number) {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    getItem(key: string) {
      return store[key] !== undefined ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });
  }
}

export function resetE2EHarness(): void {
  // 1. Reset VFS
  vfs.clear();

  // 2. Reset Mock State
  mockState.platform = 'tauri';
  mockState.online = true;
  mockState.songs.clear();
  mockState.albums.clear();
  mockState.starredSongs = [];
  mockState.starredAlbums = [];
  mockState.networkFailures.clear();

  // 3. Reset Platform and Network
  setPlatform('tauri');
  setOnline(true);

  // 4. Setup full LocalStorage Mock
  setupLocalStorageMock();

  // 5. Setup URL object mocks for jsdom
  let blobIdCounter = 1;
  URL.createObjectURL = vi.fn((_blob: Blob) => {
    return `blob:http://localhost/mock-blob-${blobIdCounter++}`;
  }) as any;
  URL.revokeObjectURL = vi.fn((_url: string) => {}) as any;

  // 6. Reset Zustand Stores
  useDownloadStore.setState({
    downloadDirectory: null,
    downloads: {},
  });

  useSettingsStore.setState({
    theme: 'dark',
    accentColor: 'green',
    customColors: ['', '', ''],
    language: 'ru',
    clickAction: 'play_now',
    startPage: '/Holad',
    isCrossfadeEnabled: true,
    crossfadeDuration: 3,
    crossfadeCurve: 'equalPower',
    isGaplessEnabled: false,
    isLoudnessNormalizationEnabled: true,
    preloadNextTrack: true,
    runOnStartup: true,
    startMinimized: true,
    closeToTray: true,
  });

  usePlayerStore.setState({
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    volume: 0.5,
    mobileVolume: 1.0,
    volumeMultiplier: 1.0,
    repeatMode: 'none',
    playbackRate: 1,
    isShuffle: false,
    isAutoDjEnabled: false,
    initialPosition: 0,
  });

  useAudioStore.setState({
    audioElement: null,
    progress: 0,
    buffered: 0,
    duration: 0,
    isSeeking: false,
  });

  useAuthStore.setState({
    url: 'http://localhost:4040',
    user: 'testuser',
    token: 'testtoken',
    salt: 'testsalt',
    isAuthenticated: true,
  });

  useUIStore.setState({
    searchQuery: '',
    isSearchOpen: false,
    activeFilter: null,
    searchResults: { song: [], album: [], artist: [] },
    isSearchLoading: false,
    isNowPlayingOpen: false,
    isSettingsOpen: false,
    leftSidebarWidth: 96,
    rightSidebarWidth: 320,
    pendingHistorySync: null,
  });

  // 7. Initialize default seed data
  setupDefaultFixtures();

  // 8. Ensure Fetch Mock is active
  setupFetchMock();
}

function setupDefaultFixtures(): void {
  const song1: MockSongItem = {
    id: 's-101',
    title: 'Solar Echoes',
    artist: 'Cosmic Drift',
    artistId: 'art-1',
    album: 'Galactic Horizon',
    albumId: 'alb-1',
    duration: 245,
    coverArt: 'cover-alb-1',
  };

  const song2: MockSongItem = {
    id: 's-102',
    title: 'Neon Starlight',
    artist: 'Cosmic Drift',
    artistId: 'art-1',
    album: 'Galactic Horizon',
    albumId: 'alb-1',
    duration: 198,
    coverArt: 'cover-alb-1',
  };

  const album1: MockAlbumItem = {
    id: 'alb-1',
    name: 'Galactic Horizon',
    title: 'Galactic Horizon',
    artist: 'Cosmic Drift',
    artistId: 'art-1',
    coverArt: 'cover-alb-1',
    songCount: 2,
    song: [song1, song2],
  };

  registerMockAlbum(album1);
  registerStarredItems([song1], [album1]);
}
