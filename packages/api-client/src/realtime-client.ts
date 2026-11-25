import { REALTIME_NAMESPACES, type AppSurface } from '@portal/types';
import { io, type Socket } from 'socket.io-client';

export function createRealtimeSocket(surface: AppSurface, baseOrigin: string): Socket {
  const namespace =
    surface === 'portal' ? REALTIME_NAMESPACES.PORTAL : REALTIME_NAMESPACES.ADMIN;

  return io(`${baseOrigin}${namespace}`, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
  });
}
