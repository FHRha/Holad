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
  pass?: string;
  token?: string;
  salt?: string;
}

export interface HistoryRecord {
  id?: number;
  song_id: string;
  title: string;
  artist?: string;
  album?: string;
  album_id?: string;
  artist_id?: string;
  duration?: number;
  cover_art?: string;
  played_at: number; // Unix timestamp in ms
}

export interface CachedTrack {
  id: string;
  user_id?: string | null;
  title: string;
  artist?: string | null;
  artist_id?: string | null;
  album?: string | null;
  album_id?: string | null;
  duration?: number;
  track_number?: number | null;
  disc_number?: number;
  year?: number | null;
  genre?: string | null;
  cover_art?: string | null;
  bit_rate?: number | null;
  suffix?: string | null;
  created_at?: number | null;
}

export interface CachedAlbum {
  id: string;
  user_id?: string | null;
  name: string;
  artist?: string | null;
  artist_id?: string | null;
  cover_art?: string | null;
  song_count?: number;
  duration?: number;
  year?: number | null;
  genre?: string | null;
  created_at?: number | null;
}

export interface CachedArtist {
  id: string;
  user_id?: string | null;
  name: string;
  album_count?: number;
  cover_art?: string | null;
  starred?: number;
}

export interface LibrarySyncState {
  id: string;
  user_id?: string | null;
  status: 'idle' | 'syncing' | 'completed' | 'error' | string;
  progress?: number;
  total_tracks?: number;
  total_albums?: number;
  total_artists?: number;
  last_sync_time?: number;
  error?: string | null;
}

export interface LibraryQueryOptions {
  offset?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc' | 'ASC' | 'DESC';
  search?: string;
  artistId?: string;
  albumId?: string;
  genre?: string;
  userId?: string;
}

