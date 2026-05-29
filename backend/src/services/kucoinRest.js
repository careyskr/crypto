const BASE_URL = 'https://api.kucoin.com';
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
    const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1]. time);
    oldest.slice(0, 50).forEach(([key]) => cache.delete(key));
  }
}

export class KucoinRestService {
  async fetchKucoin(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;
    const res = await fetch(urlStr);
    if (!res.ok) throw new Error(`KuCoin API error: ${res.status}`);
    const data = await res.json();
    if (data.code !== '200000') throw new Error(data.msg || 'KuCoin error');
    setCache(urlStr, data.data);
    return data.data;
  }

  async getKlines(symbol = 'BTC-USDT', interval = '1h', limit = 500) {
    const intervalMap = {
      '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
      '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '8h': '8h', '12h': '12h',
      '1d': '1day', '3d': '3day', '1w': '1week', '1M': '1month',
    };
    const kucoinInterval = intervalMap[interval] || '1h';
    const kucoinSymbol = symbol.replace('USDT', '-USDT');
    const endAt = Math.floor(Date.now() / 1000);
    const startAt = endAt - (limit * this.intervalSeconds(interval));

    const data = await this.fetchKucoin('/api/v1/market/candles', {
      type: kucoinInterval,
      symbol: kucoinSymbol,
      startAt: startAt.toString(),
      endAt: endAt.toString(),
    });

    if (!Array.isArray(data)) return [];

    return data.map(k => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      close: parseFloat(k[2]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).sort((a, b) => a.time - b.time);
  }

  intervalSeconds(interval) {
    const map = {
      '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
      '1h': 3600, '2h': 7200, '4h': 14400, '6h': 21600, '8h': 28800, '12h': 43200,
      '1d': 86400, '3d': 259200, '1w': 604800,
    };
    return map[interval] || 3600;
  }

  async get24hTickers() {
    const data = await this.fetchKucoin('/api/v1/market/allTickers', {}, 3000);
    return data.ticker
      .filter(t => t.symbol.endsWith('-USDT'))
      .map(t => ({
        symbol: t.symbol.replace('-', ''),
        priceChange: parseFloat(t.changePrice),
        priceChangePercent: parseFloat(t.changeRate) * 100,
        lastPrice: parseFloat(t.last),
        volume: parseFloat(t.vol),
        quoteVolume: parseFloat(t.volValue),
        highPrice: parseFloat(t.high),
        lowPrice: parseFloat(t.low),
        count: 0,
      }));
  }

  async get24hTicker(symbol) {
    const kucoinSymbol = symbol.replace('USDT', '-USDT');
    const data = await this.fetchKucoin(`/api/v1/market/stats`, { symbol: kucoinSymbol }, 3000);
    return {
      symbol: symbol,
      priceChange: parseFloat(data.changePrice),
      priceChangePercent: parseFloat(data.changeRate) * 100,
      lastPrice: parseFloat(data.last),
      volume: parseFloat(data.vol),
      quoteVolume: parseFloat(data.volValue),
      highPrice: parseFloat(data.high),
      lowPrice: parseFloat(data.low),
      count: 0,
    };
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
