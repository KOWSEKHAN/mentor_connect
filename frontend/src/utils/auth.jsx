import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import api from './api';
import { disconnectSocket, connectSocket } from '../socket';

const AuthContext = createContext();

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

function getStoredToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('mc_user');
    return sessionStorage.getItem(TOKEN_KEY);
  }
  return null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const restore = async () => {
      const token = getStoredToken();
      console.log('Auth init:', { token: !!token, user, ready });

      if (!token) {
        setUser(null);
        setReady(true);
        return;
      }

      try {
        const res = await api.get('/api/auth/me');
        setUser(res.data.user);
      } catch (err) {
        // Force clean startup: never keep a token that fails backend validation.
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem('role');
        // Keep auth state deterministic: no verified user => unauthenticated UI.
        setUser(null);
      } finally {
        setReady(true);
      }
    };
    restore();
  }, []);

  useEffect(() => {
    console.log('Auth state:', { user: user?._id || user?.id || null, ready });
  }, [user, ready]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
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

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        setUser(null);
        disconnectSocket();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const tokenForSocket = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
    if (user) {
      console.log('Token being used:', tokenForSocket ? `${tokenForSocket.slice(0, 16)}...` : null);
      connectSocket();
    }
    else disconnectSocket();
  }, [user, ready]);

  const login = (userObj, token) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(userObj));
    if (userObj?.role) {
      sessionStorage.setItem('role', userObj.role);
    }
    setUser(userObj);
  };

  const updateUser = (next) => {
    setUser((prev) => {
      if (!prev) return prev;
      const patch = typeof next === 'function' ? next(prev) : next;
      const merged = { ...prev, ...(patch || {}) };
      sessionStorage.setItem(USER_KEY, JSON.stringify(merged));
      if (merged.role) sessionStorage.setItem('role', merged.role);
      return merged;
    });
  };

  const logout = () => {
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
