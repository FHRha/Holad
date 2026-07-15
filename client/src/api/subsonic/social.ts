import { buildUrl, fetchWithRetry } from '../subsonic-core';

export const starItem = async (id: string, isAlbum = false) => {
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = buildUrl('star', { [paramName]: id });
  await fetchWithRetry(url);
};

export const unstarItem = async (id: string, isAlbum = false) => {
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = buildUrl('unstar', { [paramName]: id });
  await fetchWithRetry(url);
};

export const fetchStarred = async () => {
  const url = buildUrl('getStarred2');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.starred2 || { song: [], album: [] };
};

export const setItemRating = async (id: string, rating: number) => {
  const url = buildUrl('setRating', { id, rating: rating.toString() });
  await fetchWithRetry(url);
};

export const createShare = async (trackIds: string[], description: string = 'StreamNavi Share', expiresMs: number = 24 * 60 * 60 * 1000) => {
  let url = buildUrl('createShare', { description, expires: (Date.now() + expiresMs).toString() });
  const idParams = trackIds.map(id => `id=${id}`).join('&');
  url += `&${idParams}`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  const shares = data['subsonic-response']?.shares?.share;
  if (shares && shares.length > 0) {
    return shares[0]; // returns { id, url, description, username, expires, entry[] }
  }
  return null;
};
