import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

let socketInstance = null;

function createSocket() {
  if (socketInstance) return socketInstance;
  socketInstance = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    withCredentials: true,
  });
  return socketInstance;
}

const socket = createSocket();

export function getSocket() {
  return createSocket();
}

export function connectSocket() {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return;
  const s = createSocket();
  s.auth = { token };
  s.io.reconnection(true);
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  const s = createSocket();
  s.io.reconnection(false);
  if (s.connected) s.disconnect();
}

export { socket };
export default socket;
