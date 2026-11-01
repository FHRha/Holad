import { isCapacitor } from './StorageManager';

type NetworkListener = (online: boolean) => void;

class NetworkStatusManager {
  private online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private forcedOffline: boolean = false;
  private listeners: Set<NetworkListener> = new Set();
  private isTesting: boolean = false;
  private pingFailures: number = 0;
  private healthCheckTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isTesting) {
          this.setOnline(true);
        }
      });
      window.addEventListener('offline', () => {
        if (!this.isTesting) {
          this.setOnline(false);
        }
      });
    }

    if (isCapacitor()) {
      import('@capacitor/network').then(({ Network }) => {
        Network.getStatus().then((status) => {
          if (!this.isTesting) {
            this.setOnline(status.connected);
          }
        });
        Network.addListener('networkStatusChange', (status) => {
          if (!this.isTesting) {
            this.setOnline(status.connected);
          }
        });
      }).catch(err => {
        console.error('Failed to initialize @capacitor/network', err);
      });
    }
  }

  public async checkConnection(): Promise<boolean> {
    if (this.isTesting) return this.online;
    try {
      const authStore = (await import('../store/authStore')).useAuthStore.getState();
      if (authStore.isAuthenticated && authStore.url) {
        const core = await import('../api/subsonic-core');
        const pingUrl = core.buildUrl('ping');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        
        try {
          await fetch(pingUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          this.pingFailures = 0;
          this.setOnline(true);
          return true;
        } catch {
          clearTimeout(timeoutId);
          this.pingFailures++;
          if (this.pingFailures >= 2) {
            this.setOnline(false);
          }
          return false;
        }
      }
    } catch {
      // ignore
    }
    return this.online;
  }

  public isOnline(): boolean {
    if (this.forcedOffline) return false;
    return this.online;
  }

  public isOffline(): boolean {
    return !this.isOnline();
  }

  public isForcedOffline(): boolean {
    return this.forcedOffline;
  }

  public setForcedOffline(forced: boolean): void {
    if (forced) {
      this.stopHealthCheck();
    }
    if (this.forcedOffline !== forced) {
      this.forcedOffline = forced;
      this.notifyListeners();
    }
  }

  public toggleOffline(): void {
    if (this.forcedOffline) {
      this.setForcedOffline(false);
    } else if (this.isOffline()) {
      this.setForcedOffline(false);
      this.setOnline(true);
    } else {
      this.setForcedOffline(true);
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer || this.isTesting || this.forcedOffline) return;
    this.healthCheckTimer = setInterval(async () => {
      if (this.forcedOffline || this.isTesting) {
        this.stopHealthCheck();
        return;
      }
      const isAlive = await this.checkConnection();
      if (isAlive) {
        this.stopHealthCheck();
        import('../hooks/useWindowVisibility').then(m => m.checkAndRestoreSockets()).catch(() => {});
      }
    }, 10000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  public setOnline(status: boolean): void {
    if (status) {
      this.stopHealthCheck();
    } else if (!this.forcedOffline && !this.isTesting) {
      this.startHealthCheck();
    }
    if (this.online !== status) {
      this.online = status;
      this.notifyListeners();
    }
  }

  public setTestingStatus(status: boolean): void {
    this.stopHealthCheck();
    this.isTesting = true;
    this.forcedOffline = false;
    this.online = status;
    this.notifyListeners();
  }

  public resetTestingStatus(): void {
    this.stopHealthCheck();
    this.isTesting = false;
    this.forcedOffline = false;
    this.online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.notifyListeners();
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const currentOnline = this.isOnline();
    this.listeners.forEach((listener) => {
      try {
        listener(currentOnline);
      } catch (e) {
        console.error('Error in network listener:', e);
      }
    });
  }
}

export const networkManager = new NetworkStatusManager();
export const isOnline = () => networkManager.isOnline();
export const isOffline = () => networkManager.isOffline();
export const isForcedOffline = () => networkManager.isForcedOffline();
export const setForcedOffline = (forced: boolean) => networkManager.setForcedOffline(forced);
export const toggleOfflineMode = () => networkManager.toggleOffline();
export const addNetworkListener = (cb: NetworkListener) => networkManager.subscribe(cb);
export const setNetworkStatusForTesting = (online: boolean) => networkManager.setTestingStatus(online);
export const resetNetworkStatusForTesting = () => networkManager.resetTestingStatus();
export const checkNetworkConnection = () => networkManager.checkConnection();
export const verifyNetworkPing = () => networkManager.checkConnection();
