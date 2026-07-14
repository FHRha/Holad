import { buildUrl, fetchWithRetry } from '../subsonic-core';

export const fetchRandomTracks = async (size = 20) => {
  const url = buildUrl('getRandomSongs', { size: size.toString() });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.randomSongs?.song || [];
};

export const getSong = async (id: string) => {
  const url = buildUrl('getSong', { id });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.song;
};

export const searchTracks = async (query = '', count = 500) => {
  const url = buildUrl('search3', { query, songCount: count.toString() });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3?.song || [];
};

export const searchAll = async (query = '', count = 10) => {
  const url = buildUrl('search3', { query, songCount: count.toString(), albumCount: count.toString(), artistCount: count.toString() });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3 || { song: [], album: [], artist: [] };
};

export const getGenres = async () => {
  const url = buildUrl('getGenres');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.genres?.genre || [];
};

export const getSongsByGenre = async (genre: string, count = 50) => {
  const url = buildUrl('getSongsByGenre', { genre, count: count.toString() });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.songsByGenre?.song || [];
};

export const getStarred = async () => {
  const url = buildUrl('getStarred');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.starred?.song || [];
};
