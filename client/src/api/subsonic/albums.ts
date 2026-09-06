import { buildUrl, fetchWithRetry } from '../subsonic-core';
import { getHoladServerUrl } from '../../utils/serverConfig';

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
  const sizeParam = size && size > 0 ? `?size=${size}` : '';
  return `${proxyUrl}/api/cover/${encodeURIComponent(rawId)}${sizeParam}`;
};
