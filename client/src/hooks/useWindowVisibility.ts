import { useState, useEffect } from 'react';
import { isTauri } from '../utils/StorageManager';

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
 * Integrates with native Tauri window events (minimized / hidden to tray)
 * and web visibility API (document.hidden / blur / focus).
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

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // 2. Native Tauri events (WM_SIZE minimize/restore and tray hide/show)
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
      if (unlistenTauri) {
        unlistenTauri();
      }
    };
  }, []);

  return isVisible;
}
