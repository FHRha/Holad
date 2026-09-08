import { buildUrl, fetchWithRetry, getAuthParams } from '../subsonic-core';
import { getHoladServerUrl } from '../../utils/serverConfig';
import { useAuthStore } from '../../store/authStore';
import { isCapacitor } from '../../utils/StorageManager';

export const fetchAlbums = async (offset = 0, size = 50) => {
  const url = buildUrl('getAlbumList2', { type: 'newest', size: size.toString(), offset: offset.toString() });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.albumList2?.album || [];
};

export const fetchFrequentAlbums = async () => {
  const url = buildUrl('getAlbumList2', { type: 'frequent', size: '500' });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.albumList2?.album || [];
};

export const fetchRecentAlbums = async () => {
  const url = buildUrl('getAlbumList2', { type: 'recent', size: '500' });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.albumList2?.album || [];
};

export const getAlbum = async (id: string) => {
  const url = buildUrl('getAlbum', { id });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.album?.song || [];
};

export const getAlbumFull = async (id: string) => {
  const url = buildUrl('getAlbum', { id });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.album;
};

export const getCoverArtUrl = (id?: string | null, size?: number): string => {
  if (!id || typeof id !== 'string' || id === 'undefined' || id === 'null' || !id.trim()) {
    return '';
  }

  if (id.startsWith('data:') || id.startsWith('blob:') || id.startsWith('asset://') || id.startsWith('capacitor://') || id.startsWith('file://')) {
    return id;
  }
  if ((id.startsWith('http://') || id.startsWith('https://')) && !id.includes('/api/cover/') && !id.includes('getCoverArt')) {
    return id;
  }

  let rawId = id;
  if (id.includes('/api/cover/')) {
    const match = id.match(/\/api\/cover\/([a-zA-Z0-9_\-\.]+)/);
    if (match && match[1]) rawId = match[1];
  } else if (id.includes('getCoverArt')) {
    try {
      const parsed = new URL(id, 'http://dummy.local');
      const idParam = parsed.searchParams.get('id');
      if (idParam && idParam !== 'undefined' && idParam !== 'null') rawId = idParam;
    } catch {
      // ignore
    }
  }

  if (!rawId || rawId === 'undefined' || rawId === 'null' || !rawId.trim()) {
    return '';
  }

  const proxyUrl = getHoladServerUrl();
  const { url, user, token, salt, isAuthenticated } = useAuthStore.getState();

  // Normalize size to standard buckets to maximize cache reuse and prevent Navidrome CPU thrashing
  let normalizedSize = 300;
  if (size && size <= 150) {
    normalizedSize = 120;
  } else if (size && size >= 500) {
    normalizedSize = 800;
  }

  // On mobile (Capacitor), fetch directly from Subsonic if authenticated
  if (isCapacitor() && isAuthenticated && url && user && token && salt) {
    const auth = getAuthParams();
    return `${url.replace(/\/$/, '')}/rest/getCoverArt?id=${encodeURIComponent(rawId)}&size=${normalizedSize}&${auth}`;
  }

  const params = new URLSearchParams();
  params.set('size', normalizedSize.toString());

  if (isAuthenticated && user && token && salt && url) {
    params.set('u', user);
    params.set('t', token);
    params.set('s', salt);
    params.set('serverUrl', url.replace(/\/$/, ''));
  }
  const queryStr = params.toString();
  return `${proxyUrl}/api/cover/${encodeURIComponent(rawId)}${queryStr ? `?${queryStr}` : ''}`;
};
