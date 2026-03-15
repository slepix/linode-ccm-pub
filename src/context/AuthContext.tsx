import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, authApi } from '../api/auth';
import { setToken, getToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<{ requiresTotp: boolean }>;
  register: (email: string, password: string, full_name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((user) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string, totpCode?: string): Promise<{ requiresTotp: boolean }> => {
    const result = await authApi.login(email, password, totpCode);
    if (result.requires_totp) {
      return { requiresTotp: true };
    }
    setToken(result.token!);
    setUser(result.user!);
    return { requiresTotp: false };
  };

  const register = async (email: string, password: string, full_name: string) => {
    const { token, user } = await authApi.register(email, password, full_name);
    setToken(token);
    setUser(user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
    }
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
