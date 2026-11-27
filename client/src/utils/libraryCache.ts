import { getScanStatus } from '../api/subsonic/index';
import { useHoladStore } from '../store/holadStore';

export const LIBRARY_UPDATED_EVENT = 'holad:library-updated';
const SCAN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

let cacheEpoch = 0;
let lastScanCheckTime = 0;
let lastKnownScanCount: number | null = null;
let autoRefreshInitialized = false;
let boundSocket: any = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Returns the current library cache invalidation epoch.
 */
export function getLibraryCacheEpoch(): number {
  return cacheEpoch;
}

/**
 * Increments the cache epoch and notifies mounted library views to refresh in the background.
 */
export function invalidateLibraryCaches(): number {
  cacheEpoch += 1;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(LIBRARY_UPDATED_EVENT, { detail: { epoch: cacheEpoch } })
    );
  }
  return cacheEpoch;
}

/**
 * Subscribes to library invalidation events ('holad:library-updated').
 */
export function subscribeLibraryInvalidation(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = () => {
    callback();
  };
  window.addEventListener(LIBRARY_UPDATED_EVENT, handler);
  return () => {
    window.removeEventListener(LIBRARY_UPDATED_EVENT, handler);
  };
}

/**
 * Gently polls Subsonic getScanStatus if > 5 minutes passed since the last check
 * and invalidates library caches if the server's track count changed.
 */
export async function checkLibraryScanUpdate(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && lastScanCheckTime > 0 && now - lastScanCheckTime < SCAN_CHECK_INTERVAL_MS) {
    return false;
  }
  lastScanCheckTime = now;

  try {
    const status = await getScanStatus();
    if (status && typeof status.count === 'number') {
      if (lastKnownScanCount !== null && status.count !== lastKnownScanCount) {
        lastKnownScanCount = status.count;
        invalidateLibraryCaches();
        return true;
      }
      lastKnownScanCount = status.count;
    }
  } catch {
    // Ignore errors (offline, unauthenticated, or unsupported endpoint)
  }
  return false;
}

/**
 * Resets internal check state (used in unit tests).
 */
export function resetLibraryCacheState(): void {
  cacheEpoch = 0;
  lastScanCheckTime = 0;
  lastKnownScanCount = null;
}

/**
 * Initializes singleton Socket.IO ('holad_libraryUpdated') and visibility/online listeners.
 */
export function initLibraryAutoRefresh(): void {
  if (autoRefreshInitialized || typeof window === 'undefined') return;
  autoRefreshInitialized = true;

  const handleLibraryUpdatedSocket = () => {
    invalidateLibraryCaches();
  };

  const attachToSocket = (socket: any) => {
    if (boundSocket === socket) return;
    if (boundSocket && typeof boundSocket.off === 'function') {
      boundSocket.off('holad_libraryUpdated', handleLibraryUpdatedSocket);
    }
    boundSocket = socket || null;
    if (boundSocket && typeof boundSocket.on === 'function') {
      boundSocket.on('holad_libraryUpdated', handleLibraryUpdatedSocket);
    }
  };

  try {
    attachToSocket(useHoladStore.getState().socket);
    useHoladStore.subscribe((state) => {
      attachToSocket(state.socket);
    });
  } catch {
    // Store may not be active in isolated tests
  }

  const handleResumeCheck = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void checkLibraryScanUpdate(false);
  };

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', handleResumeCheck);
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('online', handleResumeCheck);
  }

  periodicTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void checkLibraryScanUpdate(false);
  }, SCAN_CHECK_INTERVAL_MS);
  if (typeof (periodicTimer as any)?.unref === 'function') {
    (periodicTimer as any).unref();
  }
}
