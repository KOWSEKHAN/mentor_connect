import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || 'http://localhost:5000',
});

// Set default auth header if token already exists (session restore).
try {
  const existingToken = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (existingToken) {
    api.defaults.headers.common.Authorization = `Bearer ${existingToken}`;
  }
} catch {
  // ignore
}

api.interceptors.request.use((config) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('mc_user');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mc:unauthorized'));
      }
    }
    return Promise.reject(err);
  }
);

export default api;
