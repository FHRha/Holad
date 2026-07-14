import md5 from 'md5';
import { useAuthStore } from '../store/authStore';

const getBaseUrl = () => {
  const url = useAuthStore.getState().url;
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const getAuthParams = () => {
  const { user, pass } = useAuthStore.getState();
  const salt = Math.random().toString(36).substring(2, 15);
  const token = md5(pass + salt);
  return `u=${encodeURIComponent(user)}&t=${token}&s=${salt}&v=1.16.1&c=StreamNavi&f=json`;
};

export const fetchAlbums = async () => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getAlbumList2?type=newest&size=500&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.albumList2?.album || [];
};

export const fetchRandomTracks = async (size = 20) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getRandomSongs?size=${size}&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.randomSongs?.song || [];
};

export const getAlbum = async (id: string) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getAlbum?id=${id}&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.album?.song || [];
};

export const getAlbumFull = async (id: string) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getAlbum?id=${id}&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.album;
};

export const getSong = async (id: string) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getSong?id=${id}&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.song;
};

export const searchTracks = async (query = '', count = 500) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/search3?query=${encodeURIComponent(query)}&songCount=${count}&${params}`;
  
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3?.song || [];
};

export const searchAll = async (query = '', count = 10) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/search3?query=${encodeURIComponent(query)}&songCount=${count}&albumCount=${count}&artistCount=${count}&${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.searchResult3 || { song: [], album: [], artist: [] };
};

export const getCoverArtUrl = (id: string, size = 300) => {
  return `${getBaseUrl()}/rest/getCoverArt?id=${id}&size=${size}&${getAuthParams()}`;
};

export const getDownloadUrl = (id: string) => {
  return `${getBaseUrl()}/rest/download?id=${id}&${getAuthParams()}`;
};

export const getStreamUrl = (id: string) => {
  // We use the backend proxy for streaming to hide credentials from listeners,
  // or we can use the direct URL for the host. 
  // Let's use the proxy for everyone for consistency.
  // We assume the backend is running on the same origin under /api
  return `/api/stream/${id}`;
};

export const starItem = async (id: string, isAlbum = false) => {
  const params = getAuthParams();
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = `${getBaseUrl()}/rest/star?${paramName}=${id}&${params}`;
  await fetch(url);
};

export const unstarItem = async (id: string, isAlbum = false) => {
  const params = getAuthParams();
  const paramName = isAlbum ? 'albumId' : 'id';
  const url = `${getBaseUrl()}/rest/unstar?${paramName}=${id}&${params}`;
  await fetch(url);
};

export const setItemRating = async (id: string, rating: number) => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/setRating?id=${id}&rating=${rating}&${params}`;
  await fetch(url);
};

export const fetchStarred = async () => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getStarred?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.starred || { song: [], album: [] };
};

export const getPlayQueue = async () => {
  const params = getAuthParams();
  const url = `${getBaseUrl()}/rest/getPlayQueue?${params}`;
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.playQueue;
};

export const savePlayQueue = async (trackIds: string[], currentId: string, positionMillis: number) => {
  const params = getAuthParams();
  const idParams = trackIds.map(id => `id=${id}`).join('&');
  
  // To avoid URI too long errors for huge queues, we might need POST, but standard API uses GET
  const url = `${getBaseUrl()}/rest/savePlayQueue?${idParams}&current=${currentId}&position=${positionMillis}&${params}`;
  await fetch(url);
};

export const pingServer = async () => {
  const url = `${getBaseUrl()}/rest/ping?${getAuthParams()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data['subsonic-response']?.status !== 'ok') {
    throw new Error('Ping failed');
  }
  return true;
};

export const getArtists = async () => {
  // getIndexes returns ALL artists (including track-only artists) instead of just album artists
  const url = `${getBaseUrl()}/rest/getIndexes?${getAuthParams()}`;
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
  const url = `${getBaseUrl()}/rest/getArtist?id=${id}&${getAuthParams()}`;
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.artist;
};

export const getTopSongs = async (artist: string, count: number = 1000): Promise<any[]> => {
  const url = `${getBaseUrl()}/rest/getTopSongs?artist=${encodeURIComponent(artist)}&count=${count}&${getAuthParams()}`;
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
  const url = `${getBaseUrl()}/rest/getSimilarSongs2?id=${id}&count=${count}&${getAuthParams()}`;
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
  const url = `${getBaseUrl()}/rest/getLyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&${getAuthParams()}`;
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
  const url = `${getBaseUrl()}/rest/getLyricsBySongId?id=${id}&${getAuthParams()}`;
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
  const url = `${getBaseUrl()}/rest/getArtistInfo2?id=${id}&${getAuthParams()}`;
  const res = await fetch(url);
  const data = await res.json();
  return data['subsonic-response']?.artistInfo2;
};
