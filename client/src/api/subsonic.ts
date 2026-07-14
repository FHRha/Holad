import md5 from 'md5';
import { useAuthStore } from '../store/authStore';

const getBaseUrl = () => {
  const { isAuthenticated, url } = useAuthStore.getState();
  if (!isAuthenticated) {
    const proxyUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
    return `${proxyUrl}/api/subsonic`;
  }
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

let cachedAuthStr = '';
let cachedAuthUser = '';
let cachedAuthPass = '';

const getAuthParams = () => {
  const { user, pass, isAuthenticated } = useAuthStore.getState();
  if (!isAuthenticated) return '';
  
  if (cachedAuthStr && cachedAuthUser === user && cachedAuthPass === pass) {
    return cachedAuthStr;
  }
  
  const salt = Math.random().toString(36).substring(2, 15);
  const token = md5(pass + salt);
  cachedAuthUser = user;
  cachedAuthPass = pass;
  cachedAuthStr = `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
  return cachedAuthStr;
};

const buildUrl = (endpoint: string, params: Record<string, string> = {}) => {
  const baseUrl = getBaseUrl();
  const auth = getAuthParams();
  const query = new URLSearchParams(params).toString();
  
  if (!useAuthStore.getState().isAuthenticated) {
    return `${baseUrl}/${endpoint}?${query}`;
  }
  
  const queryString = query ? `${query}&${auth}` : auth;
  return `${baseUrl}/rest/${endpoint}?${queryString}`;
};

export const fetchAlbums = async () => {
  const url = buildUrl('getAlbumList2', { type: 'newest', size: '500' });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.albumList2?.album || [];
};

export const fetchRandomTracks = async (size = 20) => {
  const url = buildUrl('getRandomSongs', { size: size.toString() });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.randomSongs?.song || [];
};

export const getAlbum = async (id: string) => {
  const url = buildUrl('getAlbum', { id });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.album?.song || [];
};

export const getAlbumFull = async (id: string) => {
  const url = buildUrl('getAlbum', { id });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.album;
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

export const getCoverArtUrl = (id: string, size: number = 300) => {
  const url = buildUrl('getCoverArt', { id, size: size.toString() });
  return url;
};

export const getDownloadUrl = (id: string) => {
  return `${getBaseUrl()}/rest/download?id=${id}&${getAuthParams()}`;
};

export const getStreamUrl = (id: string) => {
  const { isAuthenticated, url } = useAuthStore.getState();
  const proxyUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
  if (!isAuthenticated) {
    return `${proxyUrl}/api/stream/${id}`;
  }
  const params = getAuthParams();
  const targetServerUrl = url ? url.replace(/\/$/, '') : '';
  return `${proxyUrl}/api/stream/${id}?serverUrl=${encodeURIComponent(targetServerUrl)}&${params}`;
};

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

export const setItemRating = async (id: string, rating: number) => {
  const url = buildUrl('setRating', { id, rating: rating.toString() });
  await fetch(url);
};

export const fetchStarred = async () => {
  const url = buildUrl('getStarred');
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.starred || { song: [], album: [] };
};

export const getPlayQueue = async () => {
  const url = buildUrl('getPlayQueue');
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.playQueue;
};

export const savePlayQueue = async (trackIds: string[], currentId: string, positionMillis: number) => {
  // buildUrl might encode params automatically if we use URLSearchParams, but trackIds has duplicate keys "id"
  // so we manually construct it if needed.
  let url = buildUrl('savePlayQueue', { current: currentId, position: positionMillis.toString() });
  // append ids
  const idParams = trackIds.map(id => `id=${id}`).join('&');
  url += `&${idParams}`;
  await fetch(url);
};

export const pingServer = async () => {
  const url = buildUrl('ping');
  const res = await fetch(url);
  const data = await res.json();
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('Ping failed');
  }
  return true;
};

export const getArtists = async () => {
  // getIndexes returns ALL artists (including track-only artists) instead of just album artists
  const url = buildUrl('getIndexes');
  const res = await fetch(url);
  const data = await res.json();
  const index = data['subsonic-response']?.indexes?.index || [];
  const artists: any[] = [];
  index.forEach((group: any) => {
    if (group.artist) {
      artists.push(...group.artist);
    }
  });
  return artists; // array of { id, name, ... }
};

export const getArtist = async (id: string) => {
  const url = buildUrl('getArtist', { id });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.artist;
};

export const getTopSongs = async (artist: string, count: number = 1000): Promise<any[]> => {
  const url = buildUrl('getTopSongs', { artist, count: count.toString() });
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data['subsonic-response']?.topSongs?.song || [];
  } catch (error) {
    console.error("Error fetching top songs", error);
    return [];
  }
};

export const getSimilarSongs = async (id: string, count: number = 50): Promise<any[]> => {
  const url = buildUrl('getSimilarSongs2', { id, count: count.toString() });
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data['subsonic-response']?.similarSongs2?.song || [];
  } catch (error) {
    console.error("Error fetching similar songs", error);
    return [];
  }
};

export const getLyrics = async (artist: string, title: string): Promise<string | null> => {
  const url = buildUrl('getLyrics', { artist, title });
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data['subsonic-response']?.lyrics?.value || null;
  } catch (error) {
    console.error("Error fetching lyrics", error);
    return null;
  }
};

export const getLyricsBySongId = async (id: string): Promise<any> => {
  const url = buildUrl('getLyricsBySongId', { id });
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data['subsonic-response']?.lyricsList?.structuredLyrics?.[0]?.line || null;
  } catch (error) {
    console.error("Error fetching structured lyrics", error);
    return null;
  }
};

export const getArtistInfo = async (id: string) => {
  const url = buildUrl('getArtistInfo2', { id });
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.artistInfo2;
};
