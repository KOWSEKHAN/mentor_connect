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
      try {
        const res = await api.get('/api/auth/me');
        setUser(res.data.user);
        connectSocket();
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setUser(null);
      }
      setReady(true);
    };
    restore();
  }, []);

  const login = (userObj, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userObj));
    setUser(userObj);
    connectSocket();
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('mc_user');
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
