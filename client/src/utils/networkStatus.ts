import { isCapacitor } from './StorageManager';

type NetworkListener = (online: boolean) => void;

class NetworkStatusManager {
  private online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private forcedOffline: boolean = false;
  private listeners: Set<NetworkListener> = new Set();
  private isTesting: boolean = false;
  private pingFailures: number = 0;

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
    } else {
      // Desktop / Web: Poll server lightly to detect true offline status
      // because window 'offline' events can be unreliable on some desktop WebViews.
      setInterval(async () => {
        if (!this.isTesting) {
          try {
            const authStore = (await import('../store/authStore')).useAuthStore.getState();
            if (authStore.isAuthenticated && authStore.url) {
              const core = await import('../api/subsonic-core');
              const pingUrl = core.buildUrl('ping');
              
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 2000);
              
              try {
                await fetch(pingUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                // If we get a response, even an HTTP error, we are technically online.
                this.pingFailures = 0;
                this.setOnline(true);
              // oxlint-disable-next-line
              } catch (e) {
                clearTimeout(timeoutId);
                this.pingFailures++;
                if (this.pingFailures >= 2) {
                  this.setOnline(false);
                }
              }
            }
          // oxlint-disable-next-line
          } catch (e) {
            // ignore
          }
        }
      }, 5000); // Check every 5s
    }
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

  public setOnline(status: boolean): void {
    if (this.online !== status) {
      this.online = status;
      this.notifyListeners();
    }
  }

  public setTestingStatus(status: boolean): void {
    this.isTesting = true;
    this.forcedOffline = false;
    this.online = status;
    this.notifyListeners();
  }

  public resetTestingStatus(): void {
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
