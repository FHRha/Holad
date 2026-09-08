import { create } from 'zustand';
import { getHoladServerUrl } from '../utils/serverConfig';
import { useAuthStore } from './authStore';
import { useHoladStore } from './holadStore';
import { useSocialStore } from './socialStore';
import { isTauri, isCapacitor } from '../utils/StorageManager';

interface DemoState {
  isDemoMode: boolean;
  isCheckingDemo: boolean;
  isPoolExhausted: boolean;
  retryAfter: number;
  sessionId: string | null;
  slotId: number | null;
  guestUserId: string | null;
  heartbeatIntervalId: any | null;
  setDemoMode: (isDemo: boolean) => void;
  setPoolExhausted: (exhausted: boolean, retryAfter?: number) => void;
  setSession: (sessionId: string, guestUserId: string, slotId?: number) => void;
  checkDemoSession: () => Promise<{ isDemo: boolean; success: boolean }>;
  startHeartbeat: () => void;
  stopHeartbeat: () => void;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemoMode: false,
  isCheckingDemo: false,
  isPoolExhausted: false,
  retryAfter: 60,
  sessionId: null,
  slotId: null,
  guestUserId: null,
  heartbeatIntervalId: null,

  setDemoMode: (isDemoMode) => set({ isDemoMode }),
  setPoolExhausted: (isPoolExhausted, retryAfter = 60) => set({ isPoolExhausted, retryAfter }),
  setSession: (sessionId, guestUserId, slotId) => set({ sessionId, guestUserId, slotId: slotId ?? null }),

  checkDemoSession: async () => {
    // Only web client supports demo mode (desktop/mobile always use direct login)
    if (isTauri() || isCapacitor()) {
      set({ isCheckingDemo: false });
      return { isDemo: false, success: false };
    }

    set({ isCheckingDemo: true });
    try {
      // Clear legacy localStorage key to prevent leaking across browser windows
      try { localStorage.removeItem('holad_demo_session_id'); } catch (_) {}

      const serverUrl = getHoladServerUrl();
      const existingSessionId = get().sessionId || sessionStorage.getItem('holad_demo_session_id') || '';
      const res = await fetch(`${serverUrl}/api/demo/session?sessionId=${encodeURIComponent(existingSessionId)}`);

      if (!res.ok) {
        if (res.status === 429 || res.status === 503) {
          const data = await res.json().catch(() => ({ retryAfter: 60 }));
          try { sessionStorage.removeItem('holad_demo_session_id'); } catch (_) {}
          useHoladStore.getState().disconnect();
          useAuthStore.getState().logout();
          set({
            isDemoMode: true,
            isPoolExhausted: true,
            retryAfter: data.retryAfter || 60,
            sessionId: null,
            slotId: null,
            guestUserId: null
          });
          return { isDemo: true, success: false };
        }
        return { isDemo: false, success: false };
      }

      const data = await res.json();
      if (!data.demoMode) {
        set({ isDemoMode: false, isPoolExhausted: false });
        return { isDemo: false, success: false };
      }

      if (data.available && data.account) {
        set({
          isDemoMode: true,
          isPoolExhausted: false,
          sessionId: data.sessionId,
          slotId: data.slotId ?? null,
          guestUserId: data.guestUserId,
        });

        if (data.sessionId) {
          try { sessionStorage.setItem('holad_demo_session_id', data.sessionId); } catch (_) {}
        }

        // Seamless transparent login into useAuthStore
        const { setCredentials, setAuthenticated } = useAuthStore.getState();
        setCredentials(data.account.url, data.account.user, data.account.token, data.account.salt);
        setAuthenticated(true);

        // Connect Holad Connect and Social to isolated guest room
        if (data.guestUserId) {
          useHoladStore.getState().connect(data.guestUserId);
          useSocialStore.getState().initSocial();
        }

        // Start keep-alive heartbeat
        get().startHeartbeat();

        return { isDemo: true, success: true };
      }

      return { isDemo: true, success: false };
    } catch (e) {
      console.warn('[DEMO] Failed to check demo session:', e);
      return { isDemo: false, success: false };
    } finally {
      set({ isCheckingDemo: false });
    }
  },

  startHeartbeat: () => {
    get().stopHeartbeat();
    const interval = setInterval(async () => {
      const sessionId = get().sessionId;
      if (!sessionId) return;
      try {
        const serverUrl = getHoladServerUrl();
        await fetch(`${serverUrl}/api/demo/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        });
      } catch (e) {
        // Silent error handling for background heartbeats
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    set({ heartbeatIntervalId: interval });
  },

  stopHeartbeat: () => {
    const existing = get().heartbeatIntervalId;
    if (existing) {
      clearInterval(existing);
      set({ heartbeatIntervalId: null });
    }
  }
}));
