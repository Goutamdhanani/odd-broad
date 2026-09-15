'use client';

import { create } from 'zustand';
import { authApi } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'shop_owner';
  shopId: string | null;
}

interface Shop {
  id: string;
  businessName: string;
  status: string;
  walletBalancePaise: number;
  category?: string;
}

interface AuthState {
  user: User | null;
  shop: Shop | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setAuth: (user: User, shop: Shop | null, token: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  shop: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: (user, shop, token) => {
    localStorage.setItem('bizzhouse_token', token);
    localStorage.setItem('bizzhouse_user', JSON.stringify({ user, shop }));
    set({ user, shop, token, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    disconnectSocket();
    localStorage.removeItem('bizzhouse_token');
    localStorage.removeItem('bizzhouse_user');
    set({ user: null, shop: null, token: null, isAuthenticated: false, isLoading: false });
    window.location.href = '/login';
  },

  loadFromStorage: () => {
    const token = localStorage.getItem('bizzhouse_token');
    const stored = localStorage.getItem('bizzhouse_user');
    if (token && stored) {
      try {
        const { user, shop } = JSON.parse(stored);
        set({ user, shop, token, isAuthenticated: true, isLoading: false });
      } catch {
        set({ isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  refreshProfile: async () => {
    try {
      const { data } = await authApi.getProfile();
      set({
        user: {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
          shopId: data.shopId,
        },
        shop: data.shop,
      });
    } catch {
      // silently fail
    }
  },
}));
