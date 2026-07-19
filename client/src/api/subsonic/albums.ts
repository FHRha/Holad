import { buildUrl, fetchWithRetry } from '../subsonic-core';

export const fetchAlbums = async () => {
  const url = buildUrl('getAlbumList2', { type: 'newest', size: '500' });
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

export const getCoverArtUrl = (id: string, size: number = 300) => {
  if (id.startsWith('http') || id.startsWith('data:') || id.startsWith('blob:') || id.startsWith('asset://') || id.startsWith('https://')) {
    return id;
  }
  return buildUrl('getCoverArt', { id, size: size.toString() });
};
