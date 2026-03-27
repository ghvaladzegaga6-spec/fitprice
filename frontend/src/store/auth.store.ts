import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.login(email, password);
          localStorage.setItem('fitprice_token', data.accessToken);
          set({ user: data.user, token: data.accessToken });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email, password, name) => {
        set({ isLoading: true });
        try {
          const { data } = await authApi.register(email, password, name);
          localStorage.setItem('fitprice_token', data.accessToken);
          set({ user: data.user, token: data.accessToken });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch {}
        localStorage.removeItem('fitprice_token');
        set({ user: null, token: null });
      },

      fetchMe: async () => {
        try {
          const { data } = await authApi.me();
          set({ user: data.user });
        } catch {
          set({ user: null, token: null });
        }
      },
    }),
    {
      name: 'fitprice-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
