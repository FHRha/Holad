import type { Track } from '../types';
import { getCoverArtUrl } from '../api/subsonic';

export function mapSubsonicTrack(t: any): Track {
  return {
    id: t.id,
    title: t.title || t.name || '',
    artist: t.artist || '',
    album: t.album || '',
    albumId: t.albumId,
    artistId: t.artistId,
    coverArt: getCoverArtUrl(t.coverArt || t.albumId || t.id, 300),
    duration: t.duration || 0,
    userRating: t.userRating,
    bitRate: t.bitRate,
    suffix: t.suffix,
    track: t.track,
    trackNumber: t.trackNumber ?? t.track,
    fileName: t.fileName,
    path: t.path,
    fingerprint: t.fingerprint,
    isUnavailable: t.isUnavailable,
  };
}

export function mapSubsonicTracks(list: any[]): Track[] {
  if (!Array.isArray(list)) return [];
  return list.map(mapSubsonicTrack);
}

export default mapSubsonicTrack;
