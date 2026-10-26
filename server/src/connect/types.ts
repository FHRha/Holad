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
