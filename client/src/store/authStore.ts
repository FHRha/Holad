import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  url: string;
  user: string;
  pass: string; // Storing plain text password as required by Subsonic API for generating MD5 per request
  isAuthenticated: boolean;
  setCredentials: (url: string, user: string, pass: string) => void;
  logout: () => void;
  setAuthenticated: (status: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      url: '',
      user: '',
      pass: '',
      isAuthenticated: false,
      setCredentials: (url, user, pass) => set({ url, user, pass }),
      logout: () => set({ url: '', user: '', pass: '', isAuthenticated: false }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
