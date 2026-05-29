const BASE_URL = 'https://api.exchange.coinbase.com';
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

export class CoinbaseRestService {
  async fetchCoinbase(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;
    const res = await fetch(urlStr, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`Coinbase API error: ${res.status}`);
    const data = await res.json();
    setCache(urlStr, data);
    return data;
  }

  async getKlines(symbol = 'BTC-USD', interval = '1h', limit = 300) {
    const intervalMap = {
      '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600,
      '1d': 86400,
    };
    const granularity = intervalMap[interval] || 3600;
    const end = Math.floor(Date.now() / 1000);
    const start = end - (limit * granularity);
    const cbSymbol = symbol.replace('USDT', '-USD');
    const data = await this.fetchCoinbase(`/products/${cbSymbol}/candles`, {
      start, end, granularity,
    }, 3000);
    if (!Array.isArray(data)) return [];
    return data.map(k => ({
      time: k[0],
      low: parseFloat(k[1]),
      high: parseFloat(k[2]),
      open: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).sort((a, b) => a.time - b.time);
  }

  async get24hTickers() {
    const data = await this.fetchCoinbase('/products', {}, 3000);
    const products = data
      .filter(p => p.quote_currency === 'USD' && p.status === 'online')
      .slice(0, 100);
    const tickers = await Promise.allSettled(
      products.slice(0, 50).map(p => this.fetchCoinbase(`/products/${p.id}/ticker`, {}, 3000))
    );
    const results = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const sym = p.id.replace('-USD', 'USDT');
      if (tickers[i]?.status === 'fulfilled' && tickers[i].value) {
        const t = tickers[i].value;
        const stats = await this.fetchCoinbase(`/products/${p.id}/stats`, {}, 60000).catch(() => null);
        results.push({
          symbol: sym,
          priceChange: 0,
          priceChangePercent: 0,
          lastPrice: parseFloat(t.price),
          volume: stats ? parseFloat(stats.volume) : 0,
          quoteVolume: stats ? parseFloat(stats.volume) * parseFloat(t.price) : 0,
          highPrice: stats ? parseFloat(stats.high) : 0,
          lowPrice: stats ? parseFloat(stats.low) : 0,
          count: 0,
        });
      }
    }
    return results;
  }

  async get24hTicker(symbol) {
    const cbSymbol = symbol.replace('USDT', '-USD');
    const [ticker, stats] = await Promise.all([
      this.fetchCoinbase(`/products/${cbSymbol}/ticker`, {}, 3000),
      this.fetchCoinbase(`/products/${cbSymbol}/stats`, {}, 60000).catch(() => null),
    ]);
    return {
      symbol,
      priceChange: 0,
      priceChangePercent: 0,
      lastPrice: parseFloat(ticker.price),
      volume: stats ? parseFloat(stats.volume) : 0,
      quoteVolume: stats ? parseFloat(stats.volume) * parseFloat(ticker.price) : 0,
      highPrice: stats ? parseFloat(stats.high) : 0,
      lowPrice: stats ? parseFloat(stats.low) : 0,
      count: 0,
    };
  }

  async searchSymbols(query) {
    if (!query || query.length < 1) return [];
    const data = await this.fetchCoinbase('/products', {}, 60000);
    const q = query.toUpperCase().replace('USDT', '-USD');
    return data
      .filter(p => p.quote_currency === 'USD' && p.status === 'online' && p.id.includes(q))
      .slice(0, 20)
      .map(p => ({
        symbol: p.id.replace('-USD', 'USDT'),
        baseAsset: p.base_currency,
        quoteAsset: 'USDT',
        pricePrecision: p.base_increment ? p.base_increment.toString().split('.')[1]?.length || 8 : 2,
        quantityPrecision: p.quote_increment ? p.quote_increment.toString().split('.')[1]?.length || 8 : 8,
      }));
  }
}
