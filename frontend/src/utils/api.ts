const BINANCE_BASE = '/api/binance';
const EXCHANGE_BASE = '/api/exchanges';

// Binance-specific (for backward compat and WebSocket)
export async function fetchKlines(symbol: string, interval: string, limit = 500) {
  const res = await fetch(`${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch klines');
  return res.json();
}

export async function fetchTickers() {
  const res = await fetch(`${BINANCE_BASE}/tickers`);
  if (!res.ok) throw new Error('Failed to fetch tickers');
  return res.json();
}

export async function fetchTicker(symbol: string) {
  const res = await fetch(`${BINANCE_BASE}/ticker/${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch ticker');
  return res.json();
}

export async function searchSymbols(query: string) {
  const res = await fetch(`${BINANCE_BASE}/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search symbols');
  return res.json();
}

// Multi-exchange APIs
export async function fetchExchangeKlines(exchange: string, symbol: string, interval: string, limit = 500) {
  const res = await fetch(`${EXCHANGE_BASE}/klines?exchange=${exchange}&symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch klines');
  return res.json();
}

export async function fetchExchangeTickers(exchange: string) {
  const res = await fetch(`${EXCHANGE_BASE}/tickers?exchange=${exchange}`);
  if (!res.ok) throw new Error('Failed to fetch tickers');
  return res.json();
}

export async function fetchExchangeTicker(exchange: string, symbol: string) {
  const res = await fetch(`${EXCHANGE_BASE}/ticker/${symbol}?exchange=${exchange}`);
  if (!res.ok) throw new Error('Failed to fetch ticker');
  return res.json();
}

export async function searchExchangeSymbols(exchange: string, query: string) {
  const res = await fetch(`${EXCHANGE_BASE}/search?exchange=${exchange}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search');
  return res.json();
}

export async function fetchPriceComparison(symbol: string) {
  const res = await fetch(`${EXCHANGE_BASE}/compare/${symbol}`);
  if (!res.ok) throw new Error('Failed to compare prices');
  return res.json();
}
