import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('bizzhouse_token')
    : null;

  if (!socket) {
    socket = io(`${SOCKET_URL}/inbox`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Socket] Connected to inbox');
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
    });
  } else if (token && (socket.auth as { token?: string } | undefined)?.token !== token) {
    socket.auth = { token };
    socket.disconnect().connect();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
