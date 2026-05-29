const BASE_URL = 'https://www.okx.com';
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

export class OkxRestService {
  async fetchOkx(endpoint, params = {}, ttl = CACHE_TTL) {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
    const urlStr = url.toString();
    const cached = cachedFetch(urlStr, ttl);
    if (cached) return cached;
    const res = await fetch(urlStr);
    if (!res.ok) throw new Error(`OKX API error: ${res.status}`);
    const data = await res.json();
    if (data.code !== '0') throw new Error(data.msg || 'OKX error');
    setCache(urlStr, data.data);
    return data.data;
  }

  async getKlines(symbol = 'BTC-USDT', interval = '1H', limit = 300) {
    const intervalMap = {
      '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
      '1h': '1H', '2h': '2H', '4h': '4H', '6h': '6H', '12h': '12H',
      '1d': '1D', '3d': '3D', '1w': '1W', '1M': '1M',
    };
    const okxInterval = intervalMap[interval] || '1H';
    const okxSymbol = symbol.replace('USDT', '-USDT');
    const data = await this.fetchOkx('/api/v5/market/candles', {
      instId: okxSymbol,
      bar: okxInterval,
      limit: Math.min(limit, 300).toString(),
    });
    return data.map(k => ({
      time: parseInt(k[0]) / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).reverse();
  }

  async get24hTickers() {
    const data = await this.fetchOkx('/api/v5/market/tickers', { instType: 'SPOT' }, 3000);
    return data
      .filter(t => t.instId.endsWith('-USDT'))
      .map(t => ({
        symbol: t.instId.replace('-', ''),
        priceChange: parseFloat(t.last) - parseFloat(t.open24h),
        priceChangePercent: ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100,
        lastPrice: parseFloat(t.last),
        volume: parseFloat(t.vol24h),
        quoteVolume: parseFloat(t.volCcy24h),
        highPrice: parseFloat(t.high24h),
        lowPrice: parseFloat(t.low24h),
        count: 0,
      }));
  }

  async get24hTicker(symbol) {
    const okxSymbol = symbol.replace('USDT', '-USDT');
    const data = await this.fetchOkx('/api/v5/market/ticker', { instId: okxSymbol }, 3000);
    const t = data[0];
    return {
      symbol: t.instId.replace('-', ''),
      priceChange: parseFloat(t.last) - parseFloat(t.open24h),
      priceChangePercent: ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100,
      lastPrice: parseFloat(t.last),
      volume: parseFloat(t.vol24h),
      quoteVolume: parseFloat(t.volCcy24h),
      highPrice: parseFloat(t.high24h),
      lowPrice: parseFloat(t.low24h),
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
