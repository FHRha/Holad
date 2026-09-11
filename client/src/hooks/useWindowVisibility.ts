import { useState, useEffect } from 'react';
import { isTauri, isCapacitor } from '../utils/StorageManager';

let globalIsWindowVisible = true;
const visibilityListeners = new Set<(visible: boolean) => void>();

export function getIsWindowVisible(): boolean {
  return globalIsWindowVisible;
}

export function setGlobalWindowVisible(visible: boolean): void {
  if (globalIsWindowVisible !== visible) {
    globalIsWindowVisible = visible;
    visibilityListeners.forEach((listener) => listener(visible));
  }
}

export function subscribeWindowVisibility(listener: (visible: boolean) => void): () => void {
  visibilityListeners.add(listener);
  return () => {
    visibilityListeners.delete(listener);
  };
}

/**
 * Hook to track whether the application window is visible and active.
 * Integrates with native Tauri window events (minimized / hidden to tray),
 * Capacitor app state change events (background / screen locked),
 * and web visibility API (document.hidden / blur / focus / pause / resume).
 */
export function useWindowVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(globalIsWindowVisible);

  useEffect(() => {
    const handler = (v: boolean) => setIsVisible(v);
    const unsubscribe = subscribeWindowVisibility(handler);

    // 1. Web Page Visibility API
    const handleVisibilityChange = () => {
      setGlobalWindowVisible(!document.hidden);
    };

    const handleFocus = () => {
      setGlobalWindowVisible(true);
    };

    const handleBlur = () => {
      if (document.hidden) {
        setGlobalWindowVisible(false);
      }
    };

    const handlePause = () => {
      setGlobalWindowVisible(false);
    };

    const handleResume = () => {
      setGlobalWindowVisible(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('pause', handlePause);
    document.addEventListener('resume', handleResume);

    // 2. Native Capacitor mobile lifecycle (screen locked / app sent to background)
    let unlistenCapacitor: (() => void) | null = null;
    if (isCapacitor()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          setGlobalWindowVisible(Boolean(isActive));
        }).then((handle) => {
          unlistenCapacitor = () => {
            if (handle && typeof handle.remove === 'function') {
              handle.remove();
            }
          };
        }).catch(() => {});
      }).catch(() => {});
    }

    // 3. Native Tauri events (WM_SIZE minimize/restore and tray hide/show)
    let unlistenTauri: (() => void) | null = null;
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<boolean>('window-visibility-change', (event) => {
          setGlobalWindowVisible(event.payload);
        }).then((unlisten) => {
          unlistenTauri = unlisten;
        }).catch(() => {});
      }).catch(() => {});

      // Check current minimized state on mount
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().isMinimized().then((minimized) => {
          if (minimized) {
            setGlobalWindowVisible(false);
          }
        }).catch(() => {});
      }).catch(() => {});
    }

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('pause', handlePause);
      document.removeEventListener('resume', handleResume);
      if (unlistenCapacitor) {
        unlistenCapacitor();
      }
      if (unlistenTauri) {
        unlistenTauri();
      }
    };
  }, []);

  return isVisible;
}
