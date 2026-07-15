import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  url: string;
  user: string;
  token: string;
  salt: string;
  isAuthenticated: boolean;
  setCredentials: (url: string, user: string, token: string, salt: string) => void;
  logout: () => void;
  setAuthenticated: (status: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      url: '',
      user: '',
      token: '',
      salt: '',
      isAuthenticated: false,
      setCredentials: (url, user, token, salt) => set({ url, user, token, salt }),
      logout: () => set({ url: '', user: '', token: '', salt: '', isAuthenticated: false }),
      setAuthenticated: (status) => set({ isAuthenticated: status }),
    }),
    {
      name: 'auth-storage',
      // We no longer store plaintext password, but we persist token and salt
      partialize: (state) => ({ url: state.url, user: state.user, token: state.token, salt: state.salt, isAuthenticated: state.isAuthenticated }),
    }
  )
);
