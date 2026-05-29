import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface LivePosition {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  current_price: number;
  quantity: number;
  leverage: number;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  take_profit_3: number | null;
  trailing_stop: number | null;
  trailing_stop_activated: boolean;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  liquidation_price: number | null;
  duration: string;
  tp_progress: number;
  sl_distance: number | null;
  margin: number;
  opened_at: string;
  suggestions: Array<{ type: string; text: string }>;
}

export interface PendingOrder {
  id: number;
  symbol: string;
  side: 'long' | 'short';
  type: 'limit' | 'stop';
  entry_price: number;
  quantity: number;
  leverage: number;
  stop_loss: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  take_profit_3: number | null;
  current_price: number;
  status: 'pending';
  opened_at: string;
  margin: number;
}

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

export function usePaperPositions() {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const socketRef = useRef(getSocket());
  const fetchIdRef = useRef(0);

  const refreshPositions = useCallback(async () => {
    const id = ++fetchIdRef.current;
    try {
      const res = await fetch('/api/paper/trades/open');
      if (!res.ok) return;
      const data = await res.json();
      if (id === fetchIdRef.current && Array.isArray(data)) {
        setPositions(data);
      }
    } catch {}
  }, []);

  const refreshPendingOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/paper/orders/pending');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setPendingOrders(data);
      }
    } catch {}
  }, []);

  // Initial fetch via REST so positions show immediately
  useEffect(() => {
    refreshPositions();
    refreshPendingOrders();
  }, [refreshPositions, refreshPendingOrders]);

  useEffect(() => {
    const s = socketRef.current;
    s.emit('subscribe-paper-positions');

    const handler = (data: LivePosition[]) => {
      setPositions(data);
    };
    const pendingHandler = (data: PendingOrder[]) => {
      setPendingOrders(data);
    };
    const executedHandler = () => {
      refreshPositions();
      refreshPendingOrders();
    };
    s.on('paper-positions-update', handler);
    s.on('paper-pending-orders-update', pendingHandler);
    s.on('paper-orders-executed', executedHandler);

    return () => {
      s.emit('unsubscribe-paper-positions');
      s.off('paper-positions-update', handler);
      s.off('paper-pending-orders-update', pendingHandler);
      s.off('paper-orders-executed', executedHandler);
    };
  }, [refreshPositions, refreshPendingOrders]);

  const closeTrade = useCallback(async (id: number, price: number) => {
    await fetch(`/api/paper/trade/${id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exitPrice: price, reason: 'manual' }),
    });
    refreshPositions();
  }, [refreshPositions]);

  const modifyTrade = useCallback(async (id: number, updates: Record<string, any>) => {
    const res = await fetch(`/api/paper/trade/${id}/modify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    refreshPositions();
    return res.json();
  }, [refreshPositions]);

  const partialClose = useCallback(async (id: number, percentage: number) => {
    const res = await fetch(`/api/paper/trade/${id}/partial-close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentage }),
    });
    refreshPositions();
    return res.json();
  }, [refreshPositions]);

  const cancelOrder = useCallback(async (id: number) => {
    await fetch(`/api/paper/orders/${id}/cancel`, { method: 'POST' });
    refreshPendingOrders();
  }, [refreshPendingOrders]);

  const modifyPendingOrder = useCallback(async (id: number, updates: Record<string, any>) => {
    await fetch(`/api/paper/orders/${id}/modify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    refreshPendingOrders();
  }, [refreshPendingOrders]);

  return { positions, pendingOrders, refreshPositions, refreshPendingOrders, closeTrade, modifyTrade, partialClose, cancelOrder, modifyPendingOrder };
}