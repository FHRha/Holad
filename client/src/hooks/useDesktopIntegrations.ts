import { useEffect } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { isTauriDesktop } from '../utils/platform';
import { usePlayerStore } from '../store/playerStore';

function handleDeepLinkUrl(rawUrl: string, navigate: NavigateFunction): void {
  if (!rawUrl || typeof rawUrl !== 'string') return;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'holad:') return;

    const host = parsed.hostname;
    const pathname = parsed.pathname.replace(/^\/+/, '');
    const route = host ? `/${host}${pathname ? `/${pathname}` : ''}` : `/${pathname}`;
    const target = `${route}${parsed.search || ''}`;

    if (target && target !== '/') {
      navigate(target);
    }
  } catch {
    // Ignore malformed deep link URLs
  }
}

function handleGlobalShortcut(shortcut: string): void {
  const state = usePlayerStore.getState();
  switch (shortcut) {
    case 'MediaPlayPause':
      state.setIsPlaying(!state.isPlaying);
      break;
    case 'MediaNextTrack':
      state.nextTrack();
      break;
    case 'MediaPreviousTrack':
      state.prevTrack();
      break;
  }
}

/**
 * Registers desktop-only Tauri integrations (deep links and global media shortcuts).
 * Gracefully no-ops if the corresponding Tauri plugins are not registered on the backend.
 */
export function useDesktopIntegrations(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriDesktop()) return;

    let isDisposed = false;
    const unlistenFns: Array<() => void> = [];
    const registeredShortcuts: string[] = [];

    const setup = async () => {
      try {
        const [{ invoke, Channel }, { listen }] = await Promise.all([
          import('@tauri-apps/api/core'),
          import('@tauri-apps/api/event'),
        ]);

        // 1. Deep links
        try {
          const initialUrls = await invoke<string[] | null>('plugin:deep-link|get_current');
          if (!isDisposed && Array.isArray(initialUrls) && initialUrls.length > 0) {
            handleDeepLinkUrl(initialUrls[0], navigate);
          }
        } catch {
          // Deep-link plugin not enabled on backend
        }

        try {
          const unlistenDeepLink = await listen<string | string[]>('deep-link://new-url', (event) => {
            const payload = event.payload;
            const firstUrl = Array.isArray(payload) ? payload[0] : payload;
            if (typeof firstUrl === 'string') {
              handleDeepLinkUrl(firstUrl, navigate);
            }
          });
          if (isDisposed) {
            unlistenDeepLink();
          } else {
            unlistenFns.push(unlistenDeepLink);
          }
        } catch {
          // Event listener registration failed
        }

        // 2. Global shortcuts (media keys)
        const shortcutsToRegister = ['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack'];
        try {
          const shortcutChannel = new Channel<{ shortcut: string; id: number; state: 'Pressed' | 'Released' }>();
          shortcutChannel.onmessage = (event) => {
            if (event?.state === 'Pressed' && event.shortcut) {
              handleGlobalShortcut(event.shortcut);
            }
          };

          for (const shortcut of shortcutsToRegister) {
            try {
              await invoke('plugin:global-shortcut|register', {
                shortcuts: [shortcut],
                handler: shortcutChannel,
              });
              if (!isDisposed) {
                registeredShortcuts.push(shortcut);
              } else {
                await invoke('plugin:global-shortcut|unregister', { shortcuts: [shortcut] }).catch(() => {});
              }
            } catch {
              // Shortcut already registered or global-shortcut plugin not enabled
            }
          }
        } catch {
          // Global-shortcut plugin not enabled on backend
        }
      } catch {
        // Ignore Tauri API import errors outside Tauri runtime
      }
    };

    void setup();

    return () => {
      isDisposed = true;
      unlistenFns.forEach((fn) => {
        try { fn(); } catch {}
      });
      if (registeredShortcuts.length > 0) {
        const shortcutsToUnregister = [...registeredShortcuts];
        import('@tauri-apps/api/core')
          .then(({ invoke }) => {
            invoke('plugin:global-shortcut|unregister', { shortcuts: shortcutsToUnregister }).catch(() => {});
          })
          .catch(() => {});
      }
    };
  }, [navigate]);
}
