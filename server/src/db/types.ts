export interface UserPreferences {
  theme?: string;
  accent_color?: string;
  custom_colors?: string;
  language?: string;
  profiles?: string;
  updated_at?: number;
}

export interface PlaybackStateRecord {
  song_id?: string | null;
  current_song_id?: string | null;
  position?: number;
  volume?: number;
  is_playing?: boolean | number;
  queue?: any[] | string;
  queue_version?: string;
  current_index?: number;
  is_shuffled?: boolean | number;
  repeat_mode?: string;
  updated_at?: number;
}

export type PlaybackState = PlaybackStateRecord;

export interface IntegrationItem {
  integration_name: string;
  token?: string | null;
  enabled?: boolean | number;
  updated_at?: number;
}

export interface CustomPlaylistRecord {
  id: string;
  name: string;
  description: string;
  trackIds: string[];
  tracks: any[];
  userId?: string;
}

export interface ExclusionMeta {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number | string;
  duration?: number;
  fileName?: string;
  path?: string;
  lyrics?: string;
  lyricsHash?: string;
  fingerprint?: string;
}

export interface DetailedExclusion {
  entityId: string;
  entityType: 'track' | 'album';
  fingerprint: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  duration: number | null;
  fileName: string | null;
  lyricsHash: string | null;
  updatedAt: string | null;
}

export interface UserRecord {
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  last_seen: string | null;
}

export interface FriendRecord {
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  created_at: string;
}

export interface PendingRequest {
  id: number;
  user_id: string;
  username: string;
  tag: string;
  avatar_url: string | null;
  created_at: string;
}

export interface NavidromeAccountRecord {
  url: string;
  user: string;
  pass?: string | undefined;
  token?: string | undefined;
  salt?: string | undefined;
}

export interface HistoryRecord {
  id?: number | undefined;
  song_id: string;
  title: string;
  artist?: string | undefined;
  album?: string | undefined;
  album_id?: string | undefined;
  artist_id?: string | undefined;
  duration?: number | undefined;
  cover_art?: string | undefined;
  played_at: number; // Unix timestamp in ms
}

export interface CachedTrack {
  id: string;
  user_id?: string | null | undefined;
  title: string;
  artist?: string | null | undefined;
  artist_id?: string | null | undefined;
  album?: string | null | undefined;
  album_id?: string | null | undefined;
  duration?: number | undefined;
  track_number?: number | null | undefined;
  disc_number?: number | undefined;
  year?: number | null | undefined;
  genre?: string | null | undefined;
  cover_art?: string | null | undefined;
  bit_rate?: number | null | undefined;
  suffix?: string | null | undefined;
  created_at?: number | null | undefined;
}

export interface CachedAlbum {
  id: string;
  user_id?: string | null | undefined;
  name: string;
  artist?: string | null | undefined;
  artist_id?: string | null | undefined;
  cover_art?: string | null | undefined;
  song_count?: number | undefined;
  duration?: number | undefined;
  year?: number | null | undefined;
  genre?: string | null | undefined;
  created_at?: number | null | undefined;
}

export interface CachedArtist {
  id: string;
  user_id?: string | null | undefined;
  name: string;
  album_count?: number | undefined;
  cover_art?: string | null | undefined;
  starred?: number | undefined;
}

export interface LibrarySyncState {
  id: string;
  user_id?: string | null | undefined;
  status: 'idle' | 'syncing' | 'completed' | 'error' | string;
  progress?: number | undefined;
  total_tracks?: number | undefined;
  total_albums?: number | undefined;
  total_artists?: number | undefined;
  last_sync_time?: number | undefined;
  error?: string | null | undefined;
}

export interface LibraryQueryOptions {
  offset?: number | undefined;
  limit?: number | undefined;
  sort?: string | undefined;
  order?: 'asc' | 'desc' | 'ASC' | 'DESC' | undefined;
  search?: string | undefined;
  artistId?: string | undefined;
  albumId?: string | undefined;
  genre?: string | undefined;
  userId?: string | undefined;
}

