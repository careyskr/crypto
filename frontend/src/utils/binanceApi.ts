const BINANCE_API = 'https://api.binance.com/api/v3';

async function fetchBinance(path: string) {
  const res = await fetch(`${BINANCE_API}${path}`);
  if (!res.ok) throw new Error(`Binance API ${res.status}`);
  return res.json();
}

function toNum(v: any): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return isNaN(n) ? 0 : n;
}

export interface Ticker {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  lastPrice: number;
  volume: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
  count: number;
}

export async function getTickers(): Promise<Ticker[]> {
  const data = await fetchBinance('/ticker/24hr');
  return (data as any[]).map(d => ({
    symbol: d.symbol,
    priceChange: toNum(d.priceChange),
    priceChangePercent: toNum(d.priceChangePercent),
    lastPrice: toNum(d.lastPrice),
    volume: toNum(d.volume),
    quoteVolume: toNum(d.quoteVolume),
    highPrice: toNum(d.highPrice),
    lowPrice: toNum(d.lowPrice),
    count: d.count,
  }));
}

export async function getTicker(symbol: string): Promise<Ticker> {
  const d = await fetchBinance(`/ticker/24hr?symbol=${symbol}`);
  return {
    symbol: d.symbol,
    priceChange: toNum(d.priceChange),
    priceChangePercent: toNum(d.priceChangePercent),
    lastPrice: toNum(d.lastPrice),
    volume: toNum(d.volume),
    quoteVolume: toNum(d.quoteVolume),
    highPrice: toNum(d.highPrice),
    lowPrice: toNum(d.lowPrice),
    count: d.count,
  };
}

export interface Kline {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
  const data = await fetchBinance(`/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return (data as any[]).map(d => ({
    time: Math.floor(d[0] / 1000),
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
  }));
}

export interface ExchangeSymbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
}

export async function searchSymbols(query: string): Promise<ExchangeSymbol[]> {
  const q = query.toUpperCase();
  const data = await fetchBinance('/exchangeInfo');
  const symbols: ExchangeSymbol[] = data.symbols
    .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => ({ symbol: s.symbol, baseAsset: s.baseAsset, quoteAsset: s.quoteAsset }));
  return symbols.filter(s => s.symbol.includes(q) || s.baseAsset.includes(q)).slice(0, 20);
}
