/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import api, { markLoginSuccess } from '../api/client';

type AuthUser = {
  id: number | string;
  name: string;
  email: string;
  role: string;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, role: string) => Promise<void>;
  logout: () => void;
  changePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  const rawUser = localStorage.getItem('bmfarm.user');
  if (!rawUser) {
    return null;
  }
  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    localStorage.removeItem('bmfarm.user');
    return null;
  }
}

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    // JWT = header.payload.signature, decodifica o payload (base64)
    const payload = JSON.parse(atob(token.split('.')[1]));
    // exp é em segundos
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      // Token expirado — limpa
      localStorage.removeItem('bmfarm.token');
      localStorage.removeItem('bmfarm.user');
      return false;
    }
    return true;
  } catch {
    // Token malformado — limpa
    localStorage.removeItem('bmfarm.token');
    localStorage.removeItem('bmfarm.user');
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('bmfarm.token');
    return isTokenValid(stored) ? stored : null;
  });
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem('bmfarm.token');
    return isTokenValid(stored) ? readStoredUser() : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    const nextToken = data.token;
    const nextUser = data.user;
    if (!nextToken) throw new Error('Servidor não retornou token. Tente novamente.');
    localStorage.setItem('bmfarm.token', nextToken);
    localStorage.setItem('bmfarm.user', JSON.stringify(nextUser));
    markLoginSuccess();
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, role: string) => {
    await api.post('/auth/register', { email, password, name, role });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('bmfarm.token');
    localStorage.removeItem('bmfarm.user');
    setToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    if (!user) throw new Error('Não autenticado.');
    await api.patch(`/auth/users?id=${user.id}`, { password: newPassword });
  }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    token, user, isAuthenticated: Boolean(token),
    login, register, logout, changePassword,
  }), [login, logout, token, user, register, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}