import { buildUrl, fetchWithRetry } from '../subsonic-core';

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

export const getCoverArtUrl = (id: string, size?: number) => {
  if (id.startsWith('http') || id.startsWith('data:') || id.startsWith('blob:') || id.startsWith('asset://') || id.startsWith('https://')) {
    return id;
  }
  const params: Record<string, string> = { id };
  if (size && size > 0) {
    params.size = size.toString();
  }
  return buildUrl('getCoverArt', params);
};
