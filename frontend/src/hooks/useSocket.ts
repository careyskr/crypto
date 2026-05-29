import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Ticker } from '../types';

type TickerCallback = (data: Ticker & { exchange?: string }) => void;
type KlineCallback = (data: any) => void;

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    const url = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
    socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
  }
  return socket;
}

export function useSocket() {
  const socketRef = useRef(getSocket());

  useEffect(() => {
    const s = socketRef.current;
    s.on('connect', () => console.log('Socket connected'));
    s.on('disconnect', () => console.log('Socket disconnected'));
    return () => {
      s.off('connect');
      s.off('disconnect');
    };
  }, []);

  const subscribeTicker = useCallback((symbol: string, callback: TickerCallback, exchange = 'binance') => {
    const s = socketRef.current;
    s.emit('subscribe', { exchange, symbol });
    s.on('ticker', callback);
    return () => {
      s.emit('unsubscribe', { exchange, symbol });
      s.off('ticker', callback);
    };
  }, []);

  return { subscribeTicker };
}
