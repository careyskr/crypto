const BASE_URL = 'https://api.bybit.com';
const cache = new Map();
const CACHE_TTL = 5000;

function cachedFetch(url, ttl = CACHE_TTL) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < ttl) return cached.data;
  return null;
}
function setCache(url, data) {
  cache.set(url, { data, time: Date.now() });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
    oldest.slice(0, 50).forEach(([key]) => cache.delete(key));
  }
}

export class BybitRestService {
  async fetchBybit(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;
    const res = await fetch(urlStr);
    if (!res.ok) throw new Error(`Bybit API error: ${res.status}`);
    const data = await res.json();
    if (data.retCode !== 0) throw new Error(data.retMsg || 'Bybit error');
    setCache(urlStr, data.result);
    return data.result;
  }

  async getKlines(symbol = 'BTCUSDT', interval = '60', limit = 500) {
    // Bybit interval: 1,3,5,15,30,60,120,240,360,720,D,W,M
    const intervalMap = {
      '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
      '1h': '60', '2h': '120', '4h': '240', '6h': '360', '8h': '480', '12h': '720',
      '1d': 'D', '3d': 'D', '1w': 'W', '1M': 'M',
    };
    const bybitInterval = intervalMap[interval] || '60';
    const data = await this.fetchBybit('/v5/market/kline', {
      category: 'spot',
      symbol,
      interval: bybitInterval,
      limit: Math.min(limit, 1000),
    });
    return data.list.reverse().map(k => ({
      time: parseInt(k[0]) / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  async get24hTickers() {
    const data = await this.fetchBybit('/v5/market/tickers', { category: 'spot' }, 3000);
    return data.list
      .filter(t => t.symbol.endsWith('USDT'))
      .map(t => ({
        symbol: t.symbol,
        priceChange: parseFloat(t.price24h) - parseFloat(t.prevPrice24h),
        priceChangePercent: parseFloat(t.price24hPcnt) * 100,
        lastPrice: parseFloat(t.lastPrice),
        volume: parseFloat(t.volume24h),
        quoteVolume: parseFloat(t.turnover24h),
        highPrice: parseFloat(t.highPrice24h),
        lowPrice: parseFloat(t.lowPrice24h),
        count: 0,
      }));
  }

  async get24hTicker(symbol) {
    const tickers = await this.get24hTickers();
    const found = tickers.find(t => t.symbol === symbol);
    if (!found) throw new Error(`Symbol ${symbol} not found on Bybit`);
    return found;
  }

  async searchSymbols(query) {
    if (!query || query.length < 1) return [];
    const tickers = await this.get24hTickers();
    const q = query.toUpperCase();
    return tickers
      .filter(t => t.symbol.includes(q))
      .slice(0, 20)
      .map(t => ({
        symbol: t.symbol,
        baseAsset: t.symbol.replace('USDT', ''),
        quoteAsset: 'USDT',
        pricePrecision: 2,
        quantityPrecision: 4,
      }));
  }
}
