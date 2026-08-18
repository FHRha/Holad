type NetworkListener = (online: boolean) => void;

class NetworkStatusManager {
  private online: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private forcedOffline: boolean = false;
  private listeners: Set<NetworkListener> = new Set();
  private isTesting: boolean = false;

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
