import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

let socketInstance = null;

function createSocket() {
  if (socketInstance) return socketInstance;
  socketInstance = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    withCredentials: true,
  });
  socketInstance.on('connect_error', (err) => {
    console.log('Socket error:', err?.message || String(err))
    socketInstance.disconnect()
  })
  return socketInstance;
}

const socket = createSocket();

export function getSocket() {
  return createSocket();
}

export function connectSocket() {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('token') : null;
  if (!token) return;
  const s = createSocket();
  if (s.connected) return;
  s.auth = { token };
  s.io.reconnection(true);
  s.connect();
}

export function disconnectSocket() {
  const s = createSocket();
  s.io.reconnection(false);
  if (s.connected) s.disconnect();
}

export { socket };
export default socket;
