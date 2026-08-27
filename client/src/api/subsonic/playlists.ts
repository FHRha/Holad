import { buildUrl, fetchWithRetry } from '../subsonic-core';

export const getPlaylists = async () => {
  const url = buildUrl('getPlaylists');
  const res = await fetchWithRetry(url);
  const data = await res.json();
  const p = data['subsonic-response']?.playlists?.playlist;
  return p ? (Array.isArray(p) ? p : [p]) : [];
};

export const getPlaylist = async (id: string) => {
  const url = buildUrl('getPlaylist', { id });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  const p = data['subsonic-response']?.playlist;
  if (p && p.entry && !Array.isArray(p.entry)) {
    p.entry = [p.entry];
  }
  return p;
};

export const createPlaylist = async (name: string, songId?: string) => {
  const params: Record<string, string> = { name };
  if (songId) params.songId = songId;
  const url = buildUrl('createPlaylist', params);
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.status === 'ok';
};

export const updatePlaylist = async (playlistId: string, songIdToAdd?: string, songIndexToRemove?: number, name?: string, comment?: string) => {
  const params: Record<string, string> = { playlistId };
  if (songIdToAdd) params.songIdToAdd = songIdToAdd;
  if (songIndexToRemove !== undefined) params.songIndexToRemove = songIndexToRemove.toString();
  if (name) params.name = name;
  if (comment !== undefined) params.comment = comment; // comment can be empty string
  const url = buildUrl('updatePlaylist', params);
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.status === 'ok';
};

export const updatePlaylistTracks = async (playlistId: string, songIdsToAdd: string[]) => {
  let url = buildUrl('updatePlaylist', { playlistId });
  songIdsToAdd.forEach(id => {
    url += `&songIdToAdd=${encodeURIComponent(id)}`;
  });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.status === 'ok';
};

export const deletePlaylist = async (id: string) => {
  const url = buildUrl('deletePlaylist', { id });
  const res = await fetchWithRetry(url);
  const data = await res.json();
  return data['subsonic-response']?.status === 'ok';
};
