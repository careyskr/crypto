import { useEffect, useState, useCallback, useRef } from 'react';

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
  highest_price: number | null;
  lowest_price: number | null;
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

function calcLiquidationPrice(entryPrice: number, leverage: number, side: string) {
  if (leverage <= 0) return null;
  if (side === 'long') return entryPrice * (1 - 1 / leverage + 0.005);
  return entryPrice * (1 + 1 / leverage - 0.005);
}

function calcDuration(openedAt: string) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function calcPnL(side: string, entryPrice: number, currentPrice: number, quantity: number, leverage: number) {
  const diff = side === 'long' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
  return diff * quantity * leverage;
}

function calcTpProgress(side: string, entryPrice: number, currentPrice: number, tp1: number) {
  if (!tp1 || entryPrice === currentPrice) return 0;
  if (side === 'long') {
    if (currentPrice <= entryPrice) return 0;
    return Math.min(100, ((currentPrice - entryPrice) / (tp1 - entryPrice)) * 100);
  }
  if (currentPrice >= entryPrice) return 0;
  return Math.min(100, ((entryPrice - currentPrice) / (entryPrice - tp1)) * 100);
}

function calcSlDistance(side: string, entryPrice: number, currentPrice: number, stopLoss: number | null) {
  if (!stopLoss || entryPrice === 0) return null;
  if (side === 'long') return ((currentPrice - stopLoss) / entryPrice) * 100;
  return ((stopLoss - currentPrice) / entryPrice) * 100;
}

const priceCache = new Map<string, number>();
let binanceWs: WebSocket | null = null;
const priceListeners = new Set<(symbol: string, price: number) => void>();
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectPriceWs() {
  if (binanceWs?.readyState === WebSocket.OPEN) return;
  binanceWs?.close();
  binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
  binanceWs.onmessage = (event) => {
    try {
      const arr = JSON.parse(event.data);
      for (const d of arr) {
        if (d.s && d.c) {
          const price = parseFloat(d.c);
          priceCache.set(d.s, price);
          priceListeners.forEach(cb => cb(d.s, price));
        }
      }
    } catch {}
  };
  binanceWs.onclose = () => {
    binanceWs = null;
    wsReconnectTimer = setTimeout(connectPriceWs, 3000);
  };
  binanceWs.onerror = () => binanceWs?.close();
}

export function usePaperPositions() {
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const positionsRef = useRef<LivePosition[]>([]);
  const pendingRef = useRef<PendingOrder[]>([]);
  const fetchIdRef = useRef(0);

  const closeTrade = useCallback(async (id: number, price: number) => {
    await fetch(`/api/paper/trade/${id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exitPrice: price, reason: 'manual' }),
    });
    refreshPositions();
  }, []);

  const modifyTrade = useCallback(async (id: number, updates: Record<string, any>) => {
    const res = await fetch(`/api/paper/trade/${id}/modify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    refreshPositions();
    return res.json();
  }, []);

  const partialClose = useCallback(async (id: number, percentage: number) => {
    const res = await fetch(`/api/paper/trade/${id}/partial-close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentage }),
    });
    refreshPositions();
    return res.json();
  }, []);

  const cancelOrder = useCallback(async (id: number) => {
    await fetch(`/api/paper/orders/${id}/cancel`, { method: 'POST' });
    refreshPendingOrders();
  }, []);

  const modifyPendingOrder = useCallback(async (id: number, updates: Record<string, any>) => {
    await fetch(`/api/paper/orders/${id}/modify`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    refreshPendingOrders();
  }, []);

  const refreshPositions = useCallback(async () => {
    const id = ++fetchIdRef.current;
    try {
      const res = await fetch('/api/paper/trades/open');
      if (!res.ok) return;
      const data = await res.json();
      if (id === fetchIdRef.current && Array.isArray(data)) {
        positionsRef.current = data;
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
        pendingRef.current = data;
        setPendingOrders(data);
      }
    } catch {}
  }, []);

  // Initial fetch
  useEffect(() => {
    refreshPositions();
    refreshPendingOrders();
    connectPriceWs();
    return () => {
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    };
  }, [refreshPositions, refreshPendingOrders]);

  // Poll for position updates every 3 seconds
  useEffect(() => {
    const interval = setInterval(refreshPositions, 3000);
    return () => clearInterval(interval);
  }, [refreshPositions]);

  // Poll for pending orders every 5 seconds
  useEffect(() => {
    const interval = setInterval(refreshPendingOrders, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingOrders]);

  // Live price-based position enrichment
  useEffect(() => {
    const handler = (symbol: string, currentPrice: number) => {
      positionsRef.current = positionsRef.current.map(t => {
        if (t.symbol !== symbol && !t.symbol.includes(symbol.replace('USDT', ''))) return t;

        const price = priceCache.get(t.symbol) || currentPrice;
        const upnl = +calcPnL(t.side, t.entry_price, price, t.quantity, t.leverage).toFixed(2);
        const margin = (t.entry_price * t.quantity) / t.leverage;
        const upnlPercent = margin > 0 ? +((upnl / margin) * 100).toFixed(2) : 0;

        return {
          ...t,
          current_price: price,
          unrealized_pnl: upnl,
          unrealized_pnl_percent: upnlPercent,
          liquidation_price: calcLiquidationPrice(t.entry_price, t.leverage, t.side),
          duration: calcDuration(t.opened_at),
          tp_progress: t.take_profit_1
            ? +calcTpProgress(t.side, t.entry_price, price, t.take_profit_1).toFixed(1)
            : 0,
          sl_distance: t.stop_loss != null
            ? +(calcSlDistance(t.side, t.entry_price, price, t.stop_loss) ?? 0).toFixed(2)
            : null,
          margin: +margin.toFixed(2),
        } as LivePosition;
      });
      setPositions([...positionsRef.current]);
    };

    priceListeners.add(handler);
    return () => { priceListeners.delete(handler); };
  }, []);

  // Client-side SL/TP check
  useEffect(() => {
    const check = async () => {
      const current = positionsRef.current;
      for (const t of current) {
        const price = priceCache.get(t.symbol);
        if (!price) continue;

        // Check liquidation
        const liqPrice = calcLiquidationPrice(t.entry_price, t.leverage, t.side);
        if (liqPrice) {
          if (t.side === 'long' && price <= liqPrice) {
            await closeTrade(t.id, liqPrice);
            continue;
          }
          if (t.side === 'short' && price >= liqPrice) {
            await closeTrade(t.id, liqPrice);
            continue;
          }
        }

        // Check stop loss
        if (t.stop_loss) {
          if (t.side === 'long' && price <= t.stop_loss) {
            await closeTrade(t.id, t.stop_loss);
            continue;
          }
          if (t.side === 'short' && price >= t.stop_loss) {
            await closeTrade(t.id, t.stop_loss);
            continue;
          }
        }

        // Check take profits
        for (const tp of [t.take_profit_3, t.take_profit_2, t.take_profit_1]) {
          if (!tp) continue;
          if (t.side === 'long' && price >= tp) {
            await closeTrade(t.id, tp);
            break;
          }
          if (t.side === 'short' && price <= tp) {
            await closeTrade(t.id, tp);
            break;
          }
        }
      }
    };
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [closeTrade]);

  return { positions, pendingOrders, refreshPositions, refreshPendingOrders, closeTrade, modifyTrade, partialClose, cancelOrder, modifyPendingOrder };
}