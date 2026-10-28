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
  socketId: string;
}

export interface HoladRoom {
  activeDeviceId: string | null;
  devices: HoladDevice[];
  cachedState: any | null;
  lastPausedAt?: number | null;
  snapshot: PlaybackSnapshot;
  leaseExpiresAt: number | null;
}

export interface SocketHoladData {
  roomId: string;
  deviceId: string;
}

export interface HoladAuthData {
  user: string;
  salt: string;
  token: string;
  url: string;
}

export interface HoladJoinRoomPayload {
  roomId: string;
  deviceId: string;
  deviceName: string;
  auth?: HoladAuthData;
  demoSessionId?: string;
}

export interface HoladDevicesPayload {
  devices: HoladDevice[];
  activeDeviceId: string | null;
}

export interface HoladRemoteCommand {
  type: string;
  payload?: any;
  fromUserId?: string;
  fromDeviceId?: string;
  [key: string]: any;
}

export interface HoladLeavePayload {
  roomId?: string;
  deviceId?: string;
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

export interface HoladPingPayload {
  t0?: number;
}

export interface HoladPongPayload {
  t0?: number;
  serverTime: number;
}

export interface HoladAuthErrorPayload {
  code: string;
  message: string;
}

export interface NavidromeAccountLike {
  url: string;
  user: string;
  pass?: string;
  token?: string;
  salt?: string;
}

export interface ConnectSocketHandlerOptions {
  demoManager?: {
    isEnabled: () => boolean;
    getSession: (id: string) => any;
    getSessionByGuestUserId: (userId: string) => any;
    findSession?: (id: string) => any;
  };
  getNavidromeAccounts?: () => NavidromeAccountLike[];
  setNavidromeAccounts?: (accounts: NavidromeAccountLike[]) => void;
  getNavidromeCandidates?: (authUrl?: string, dbUrl?: string) => string[];
  isTargetServerAllowed?: (urlString: string) => boolean;
  registerUserPresence?: (socket: any, userId: string, username: string, tag: string) => void;
}
