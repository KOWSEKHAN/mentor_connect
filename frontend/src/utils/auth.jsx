// src/utils/auth.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api'; // axios instance

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // load from localStorage initially
    const rawUser = localStorage.getItem('mc_user');
    const token = localStorage.getItem('token');
    if (rawUser && token) {
      try {
        const u = JSON.parse(rawUser);
        setUser(u);
      } catch (err) {
        localStorage.removeItem('mc_user');
        localStorage.removeItem('token');
      }
    }
    setReady(true);
  }, []);

  const login = (userObj, token) => {
    // store minimal user + token
    localStorage.setItem('mc_user', JSON.stringify(userObj));
    localStorage.setItem('token', token);
    setUser(userObj);
  };

  const logout = () => {
    localStorage.removeItem('mc_user');
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
