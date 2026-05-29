const BASE_URL = 'https://api.binance.com';
const cache = new Map();
const CACHE_TTL = 5000; // 5 seconds

function cachedFetch(url, ttl = CACHE_TTL) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < ttl) {
    return cached.data;
  }
  return null;
}

function setCache(url, data) {
  cache.set(url, { data, time: Date.now() });
  // Cleanup old entries
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
    oldest.slice(0, 50).forEach(([key]) => cache.delete(key));
  }
}

export class BinanceRestService {
  async fetchBinance(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;

    const res = await fetch(urlStr);
    if (!res.ok) {
      throw new Error(`Binance API error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    setCache(urlStr, data);
    return data;
  }

  async getExchangeInfo() {
    const data = await this.fetchBinance('/api/v3/exchangeInfo', {}, 60000);
    return data.symbols
      .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
      .map(s => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        pricePrecision: s.pricePrecision,
        quantityPrecision: s.quantityPrecision,
      }));
  }

  async getKlines(symbol = 'BTCUSDT', interval = '1h', limit = 500) {
    const data = await this.fetchBinance('/api/v3/klines', { symbol, interval, limit });
    return data.map(k => ({
      time: k[0] / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6] / 1000,
      quoteVolume: parseFloat(k[7]),
      trades: k[8],
    }));
  }

  async get24hTickers() {
    const data = await this.fetchBinance('/api/v3/ticker/24hr', {}, 3000);
    return data
      .filter(t => t.symbol.endsWith('USDT'))
      .map(t => ({
        symbol: t.symbol,
        priceChange: parseFloat(t.priceChange),
        priceChangePercent: parseFloat(t.priceChangePercent),
        lastPrice: parseFloat(t.lastPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
        highPrice: parseFloat(t.highPrice),
        lowPrice: parseFloat(t.lowPrice),
        count: parseInt(t.count),
      }));
  }

  async get24hTicker(symbol) {
    const data = await this.fetchBinance('/api/v3/ticker/24hr', { symbol }, 3000);
    return {
      symbol: data.symbol,
      priceChange: parseFloat(data.priceChange),
      priceChangePercent: parseFloat(data.priceChangePercent),
      lastPrice: parseFloat(data.lastPrice),
      volume: parseFloat(data.volume),
      quoteVolume: parseFloat(data.quoteVolume),
      highPrice: parseFloat(data.highPrice),
      lowPrice: parseFloat(data.lowPrice),
      count: parseInt(data.count),
    };
  }

  async searchSymbols(query) {
    if (!query || query.length < 1) return [];
    const symbols = await this.getExchangeInfo();
    const q = query.toUpperCase();
    return symbols
      .filter(s => s.symbol.includes(q) || s.baseAsset.includes(q))
      .slice(0, 20);
  }
}
