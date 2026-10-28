export interface TrackCompact {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  coverArt?: string;
}

export interface PlaybackSnapshot {
  roomId: string;
  activeDeviceId: string | null; // Назначается ТОЛЬКО сервером
  trackId: string | null;
  currentIndex: number;
  queue: TrackCompact[];
  positionMs: number; // Базовая точка времени в ms
  timestamp: number; // Серверный Date.now() в момент фиксации
  isPlaying: boolean;
  playbackRate: number; // 0.5, 1.0, 1.25, 1.5, 2.0
  version: number; // Монотонный счетчик изменений для защиты от гонок
}

export interface HoladDevice {
  id: string;
  name: string;
  socketId?: string;
}

export interface HoladPingPayload {
  t0?: number;
}

export interface HoladPongPayload {
  t0?: number;
  serverTime: number;
}

export interface HoladHeartbeatPayload {
  roomId?: string;
  deviceId?: string;
  positionMs: number;
  isPlaying?: boolean;
  playbackRate?: number;
}

export interface HoladTransferPlaybackPayload {
  targetDeviceId: string;
  roomId?: string;
}

export interface HoladAuthErrorPayload {
  code: string;
  message: string;
}
