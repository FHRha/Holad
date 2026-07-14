export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId?: string;
  coverArt: string;
  duration: number;
  userRating?: number;
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
}
