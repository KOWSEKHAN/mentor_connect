import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';
import { disconnectSocket, connectSocket } from '../socket';

const AuthContext = createContext();

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const restore = async () => {
      const token = getStoredToken();
      if (!token) {
        setUser(null);
        setReady(true);
        return;
      }

      // Optimistic restore: show cached user immediately to avoid flicker/logouts
      // on transient network issues. We will still verify via `/api/auth/me`.
      try {
        const cached = localStorage.getItem(USER_KEY);
        if (cached) setUser(JSON.parse(cached));
      } catch {
        // Ignore cached parse errors.
      }

      try {
        const res = await api.get('/api/auth/me');
        setUser(res.data.user);
        connectSocket();
      } catch (err) {
        // Only invalidate the session on explicit auth failure.
        if (err?.response?.status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          localStorage.removeItem('mc_user');
          setUser(null);
          disconnectSocket();
        }
      }
      setReady(true);
    };
    restore();
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      disconnectSocket();
      setReady(true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mc:unauthorized', onUnauthorized);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mc:unauthorized', onUnauthorized);
      }
    };
  }, []);

  const login = (userObj, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userObj));
    setUser(userObj);
    connectSocket();
  };

  const updateUser = (next) => {
    setUser((prev) => {
      if (!prev) return prev;
      const patch = typeof next === 'function' ? next(prev) : next;
      const merged = { ...prev, ...(patch || {}) };
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
      return merged;
    });
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('mc_user');
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
