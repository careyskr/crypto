import { useEffect, useRef, useCallback } from 'react';
import type { Ticker } from '../types';

type TickerCallback = (data: Ticker & { exchange?: string }) => void;

const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'USDP', 'GUSD', 'PAX', 'USD', 'EUR', 'GBP', 'JPY', 'AUD']);
const INVALID_PAIRS = new Set(['USDTUSDT', 'USDCUSDT', 'BUSDUSDT', 'DAIUSDT', 'TUSDUSDT', 'FDUSDUSDT', 'USDPUSDT']);

function isValidSymbol(symbol: string): boolean {
  const sym = symbol.toUpperCase();
  if (INVALID_PAIRS.has(sym)) return false;
  const base = sym.replace(/USDT$|USDC$|BUSD$|FDUSD$|DAI$|TUSD$|EUR$|GBP$/i, '');
  if (!base || base.length < 2 || STABLECOINS.has(base)) return false;
  return true;
}

const listeners = new Map<string, Set<TickerCallback>>();
let ws: WebSocket | null = null;
let connectAttempts = 0;

function connectBinance() {
  if (ws?.readyState === WebSocket.OPEN) return;
  ws?.close();
  // Remove stale listeners for invalid symbols
  for (const sym of listeners.keys()) {
    if (!isValidSymbol(sym)) listeners.delete(sym);
  }
  const symbols = [...listeners.keys()];
  if (symbols.length === 0) return;
  const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
  ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  ws.onopen = () => { connectAttempts = 0; };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      const d = msg.data || msg;
      if (d.e === '24hrTicker') {
        const data = {
          symbol: d.s,
          lastPrice: parseFloat(d.c),
          priceChange: parseFloat(d.p),
          priceChangePercent: parseFloat(d.P),
          volume: parseFloat(d.v),
          quoteVolume: parseFloat(d.q),
          highPrice: parseFloat(d.h),
          lowPrice: parseFloat(d.l),
          count: parseInt(d.n) || 0,
          exchange: 'binance',
        };
        const cbs = listeners.get(d.s);
        if (cbs) cbs.forEach(cb => cb(data));
      }
    } catch {}
  };
  ws.onclose = () => {
    ws = null;
    if (listeners.size > 0) {
      connectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, connectAttempts), 30000);
      setTimeout(connectBinance, delay);
    }
  };
  ws.onerror = () => ws?.close();
}

function reconnect() {
  if (ws) { ws.close(); ws = null; }
  connectBinance();
}

export function useSocket() {
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      subscribedRef.current.forEach(sym => {
        const cbs = listeners.get(sym);
        if (cbs) {
          cbs.clear();
          listeners.delete(sym);
        }
      });
      if (listeners.size === 0 && ws) {
        ws.close();
        ws = null;
      }
    };
  }, []);

  const subscribeTicker = useCallback((symbol: string, callback: TickerCallback) => {
    const sym = symbol.toUpperCase();
    if (!isValidSymbol(sym)) return () => {};
    if (!listeners.has(sym)) listeners.set(sym, new Set());
    listeners.get(sym)!.add(callback);
    subscribedRef.current.add(sym);
    connectBinance();

    return () => {
      const cbs = listeners.get(sym);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) listeners.delete(sym);
      }
      subscribedRef.current.delete(sym);
      if (listeners.size === 0 && ws) {
        ws.close();
        ws = null;
      }
    };
  }, []);

  return { subscribeTicker };
}