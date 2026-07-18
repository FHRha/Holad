export * from './subsonic-core';
export * from './subsonic/tracks';
export * from './subsonic/albums';
export * from './subsonic/social';
export * from './subsonic/playlists';

import { buildUrl, getBaseUrl, getAuthParams } from './subsonic-core';
import { useAuthStore } from '../store/authStore';

export const getDownloadUrl = (id: string) => {
  return `${getBaseUrl()}/rest/download?id=${id}&${getAuthParams()}`;
};

export const getStreamUrl = (id: string) => {
  const { isAuthenticated, url } = useAuthStore.getState();
  const proxyUrl = import.meta.env.VITE_SERVER_URL || import.meta.env.BASE_URL.replace(/\/$/, '');
  if (!isAuthenticated) {
    return `${proxyUrl}/api/stream/${id}`;
  }
  const params = getAuthParams();
  const targetServerUrl = url ? url.replace(/\/$/, '') : '';
  return `${proxyUrl}/api/stream/${id}?serverUrl=${encodeURIComponent(targetServerUrl)}&${params}`;
};

// Moved to social.ts

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
