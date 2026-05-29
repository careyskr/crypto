const BASE_URL = 'https://api.kraken.com/0';
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

const USDT_PAIRS = {
  'USDT': 'USDT',
};

export class KrakenRestService {
  async fetchKraken(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;
    const res = await fetch(urlStr);
    if (!res.ok) throw new Error(`Kraken API error: ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length > 0) throw new Error(data.error.join(', '));
    setCache(urlStr, data.result);
    return data.result;
  }

  toKrakenPair(symbol) {
    const base = symbol.replace('USDT', '');
    return `${base}USDT`;
  }

  fromKrakenPair(pair) {
    const base = pair.replace('USDT', '');
    return `${base}USDT`;
  }

  async getKlines(symbol = 'BTCUSDT', interval = '60', limit = 500) {
    const intervalMap = {
      '1m': 1, '5m': 5, '15m': 15, '30m': 30,
      '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
    };
    const krakenInterval = intervalMap[interval] || 60;
    const pair = this.toKrakenPair(symbol);
    const data = await this.fetchKraken('/public/OHLC', {
      pair, interval: krakenInterval,
    }, 3000);
    const ohlc = data[pair] || data[Object.keys(data)[0]];
    if (!Array.isArray(ohlc)) return [];
    return ohlc.slice(-limit).map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[6]),
    }));
  }

  async get24hTickers() {
    const data = await this.fetchKraken('/public/Ticker', {}, 3000);
    const results = [];
    for (const [pair, info] of Object.entries(data)) {
      if (pair.endsWith('USDT')) {
        results.push({
          symbol: this.fromKrakenPair(pair),
          priceChange: parseFloat(info.c[0]) - parseFloat(info.o[0]),
          priceChangePercent: parseFloat(info.o[0]) > 0
            ? ((parseFloat(info.c[0]) - parseFloat(info.o[0])) / parseFloat(info.o[0])) * 100 : 0,
          lastPrice: parseFloat(info.c[0]),
          volume: parseFloat(info.v[1]),
          quoteVolume: parseFloat(info.v[1]) * parseFloat(info.c[0]),
          highPrice: parseFloat(info.h[1]),
          lowPrice: parseFloat(info.l[1]),
          count: parseInt(info.t[1]) || 0,
        });
      }
    }
    return results.slice(0, 100);
  }

  async get24hTicker(symbol) {
    const tickers = await this.get24hTickers();
    const found = tickers.find(t => t.symbol === symbol);
    if (!found) throw new Error(`Symbol ${symbol} not found on Kraken`);
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
        quantityPrecision: 8,
      }));
  }
}
