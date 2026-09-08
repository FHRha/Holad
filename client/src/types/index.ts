export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  artistId?: string;
  coverArt: string;
  duration: number;
  userRating?: number;
  bitRate?: number;
  suffix?: string;
  track?: number | string;
  trackNumber?: number | string;
  path?: string;
  fileName?: string;
  lyrics?: string;
  lyricsHash?: string;
  fingerprint?: string;
  isUnavailable?: boolean;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

export type JamRole = 'host' | 'cohost' | 'listener' | null;

export interface JamParticipant {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'listener';
  userId?: string;
  tag?: string;
}
