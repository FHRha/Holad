import { buildUrl } from '../subsonic-core';

export const starItem = async (id: string, isAlbum = false) => {
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = buildUrl('star', { [paramName]: id });
  await fetch(url);
};

export const unstarItem = async (id: string, isAlbum = false) => {
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = buildUrl('unstar', { [paramName]: id });
  await fetch(url);
};

export const fetchStarred = async () => {
  const url = buildUrl('getStarred2');
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.starred2 || { song: [], album: [] };
};

export const setItemRating = async (id: string, rating: number) => {
  const url = buildUrl('setRating', { id, rating: rating.toString() });
  await fetch(url);
};
