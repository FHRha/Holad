import { buildUrl } from '../subsonic-core';

export const fetchRandomTracks = async (size = 20) => {
  const url = buildUrl('getRandomSongs', { size: size.toString() });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.randomSongs?.song || [];
};

export const getSong = async (id: string) => {
  const url = buildUrl('getSong', { id });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.song;
};

export const searchTracks = async (query = '', count = 500) => {
  const url = buildUrl('search3', { query, songCount: count.toString() });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3?.song || [];
};

export const searchAll = async (query = '', count = 10) => {
  const url = buildUrl('search3', { query, songCount: count.toString(), albumCount: count.toString(), artistCount: count.toString() });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3 || { song: [], album: [], artist: [] };
};
