import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket | null {
  const url = import.meta.env.VITE_API_URL || undefined;
  console.log('[socket] connectSocket called, already connected:', !!socket?.connected, 'url:', url);

  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) {
    console.log('[socket] No token in localStorage, skipping connection');
    return null;
  }

  console.log('[socket] Creating new socket connection to:', url);
  socket = io(url, {
    auth: (cb) => { cb({ token: localStorage.getItem('token') }); },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[socket] Connected:', socket?.id);
    if (import.meta.env.DEV || import.meta.env.VITE_E2E) {
      (window as any).__socket = socket;
    }
  });

  socket.on('connect_error', (err) => {
    console.error('[socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[socket] Disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
