import type { Track } from '../types';
import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from '../store/authStore';
import { getCoverArtUrl } from './subsonic/albums';

export interface LibraryTracksParams {
  offset?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  artistId?: string;
  albumId?: string;
  genre?: string;
  userId?: string;
}

export interface LibraryAlbumsParams {
  offset?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  artistId?: string;
  genre?: string;
  userId?: string;
}

export interface LibraryArtistsParams {
  offset?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  userId?: string;
}

export interface LibraryTracksResponse {
  tracks: Track[];
  total: number;
  offset: number;
  limit: number;
}

export interface LibraryAlbumsResponse {
  albums: any[];
  total: number;
  offset: number;
  limit: number;
}

export interface LibraryArtistsResponse {
  artists: any[];
  total: number;
  offset: number;
  limit: number;
}

export interface LibrarySyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'error' | string;
  progress: number;
  total_tracks: number;
  total_albums: number;
  total_artists: number;
  last_sync_time: number;
  is_syncing: boolean;
  error: string | null;
}

export interface LibrarySyncResult {
  success: boolean;
  status: number;
  message: string;
  retryAfter?: number;
}

function getAuthHeaders(): Record<string, string> {
  const { user, token, salt, url } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (user) headers['x-user'] = user;
  if (token) headers['x-token'] = token;
  if (salt) headers['x-salt'] = salt;
  if (url) headers['x-url'] = url;
  return headers;
}

function mapCachedTrack(t: any): Track {
  return {
    id: t.id,
    title: t.title || '',
    artist: t.artist || '',
    album: t.album || '',
    albumId: t.album_id || undefined,
    artistId: t.artist_id || undefined,
    coverArt: getCoverArtUrl(t.cover_art || t.album_id || t.id, 300),
    duration: t.duration || 0,
    track: t.track_number ?? undefined,
    trackNumber: t.track_number ?? undefined,
    bitRate: t.bit_rate ?? undefined,
    suffix: t.suffix ?? undefined,
  };
}

function mapCachedAlbum(a: any) {
  return {
    id: a.id,
    name: a.name,
    title: a.name,
    artist: a.artist || 'Unknown Artist',
    artistId: a.artist_id || undefined,
    coverArt: a.cover_art || a.id,
    songCount: a.song_count || 0,
    duration: a.duration || 0,
    year: a.year ?? undefined,
    genre: a.genre ?? undefined,
  };
}

function mapCachedArtist(a: any) {
  return {
    id: a.id,
    name: a.name,
    albumCount: a.album_count || 0,
    coverArt: a.cover_art || a.id,
    starred: Boolean(a.starred),
  };
}

export async function fetchLibraryTracks(
  params: LibraryTracksParams = {}
): Promise<LibraryTracksResponse> {
  const baseUrl = getHoladServerUrl();
  const query = new URLSearchParams();

  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.search) query.set('search', params.search);
  if (params.artistId) query.set('artistId', params.artistId);
  if (params.albumId) query.set('albumId', params.albumId);
  if (params.genre) query.set('genre', params.genre);
  if (params.userId) query.set('userId', params.userId);

  const queryString = query.toString();
  const url = `${baseUrl}/api/library/tracks${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch library tracks: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];

  return {
    tracks: rawTracks.map(mapCachedTrack),
    total: typeof data.total === 'number' ? data.total : rawTracks.length,
    offset: typeof data.offset === 'number' ? data.offset : (params.offset || 0),
    limit: typeof data.limit === 'number' ? data.limit : (params.limit || 100),
  };
}

export async function fetchLibraryAlbums(
  params: LibraryAlbumsParams = {}
): Promise<LibraryAlbumsResponse> {
  const baseUrl = getHoladServerUrl();
  const query = new URLSearchParams();

  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.search) query.set('search', params.search);
  if (params.artistId) query.set('artistId', params.artistId);
  if (params.genre) query.set('genre', params.genre);
  if (params.userId) query.set('userId', params.userId);

  const queryString = query.toString();
  const url = `${baseUrl}/api/library/albums${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch library albums: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawAlbums = Array.isArray(data.albums) ? data.albums : [];

  return {
    albums: rawAlbums.map(mapCachedAlbum),
    total: typeof data.total === 'number' ? data.total : rawAlbums.length,
    offset: typeof data.offset === 'number' ? data.offset : (params.offset || 0),
    limit: typeof data.limit === 'number' ? data.limit : (params.limit || 50),
  };
}

export async function fetchLibraryArtists(
  params: LibraryArtistsParams = {}
): Promise<LibraryArtistsResponse> {
  const baseUrl = getHoladServerUrl();
  const query = new URLSearchParams();

  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.sort) query.set('sort', params.sort);
  if (params.order) query.set('order', params.order);
  if (params.search) query.set('search', params.search);
  if (params.userId) query.set('userId', params.userId);

  const queryString = query.toString();
  const url = `${baseUrl}/api/library/artists${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch library artists: HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawArtists = Array.isArray(data.artists) ? data.artists : [];

  return {
    artists: rawArtists.map(mapCachedArtist),
    total: typeof data.total === 'number' ? data.total : rawArtists.length,
    offset: typeof data.offset === 'number' ? data.offset : (params.offset || 0),
    limit: typeof data.limit === 'number' ? data.limit : (params.limit || 100),
  };
}

export async function getLibrarySyncStatus(userId?: string): Promise<LibrarySyncStatus> {
  const baseUrl = getHoladServerUrl();
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const url = `${baseUrl}/api/library/status${query}`;

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to get sync status: HTTP ${res.status}`);
  }

  return (await res.json()) as LibrarySyncStatus;
}

export async function triggerLibrarySync(userId?: string): Promise<LibrarySyncResult> {
  const baseUrl = getHoladServerUrl();
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const url = `${baseUrl}/api/library/sync${query}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 409) {
    return {
      success: false,
      status: 409,
      message: data.message || 'Синхронизация уже выполняется',
    };
  }

  if (res.status === 429) {
    return {
      success: false,
      status: 429,
      message: data.message || 'Превышен лимит запросов синхронизации',
      retryAfter: data.retryAfter || 30,
    };
  }

  if (!res.ok && res.status !== 202) {
    throw new Error(data.message || `Ошибка синхронизации: HTTP ${res.status}`);
  }

  return {
    success: true,
    status: res.status,
    message: data.message || 'Синхронизация запущена',
  };
}
