const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const INTERVAL_MAP = {
  '1m': '1', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '4h': '240', '1d': '1', '1w': '7',
};

const cache = new Map();
const CACHE_TTL = 60000;

function cachedFetch(url, ttl = CACHE_TTL) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < ttl) return cached.data;
  return null;
}

function setCache(url, data) {
  cache.set(url, { data, time: Date.now() });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].time - b[1].time);
    oldest.slice(0, 50).forEach(([k]) => cache.delete(k));
  }
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const cached = cachedFetch(url);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = await res.json();
    setCache(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Dynamic coin list from CoinGecko, cached 60s
async function fetchCoinList() {
  const data = await fetchWithTimeout(
    `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=250&page=1&sparkline=false`,
    10000
  );
  if (!Array.isArray(data)) return [];
  return data;
}

const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD', 'USD1', 'USDD', 'FRAX', 'LUSD', 'GHO', 'CRVUSD']);

function buildSymbolMap(coins) {
  const map = {};
  const exchangeInfo = [];
  for (const c of coins) {
    const base = (c.symbol || '').toUpperCase();
    if (STABLECOINS.has(base)) continue;
    const sym = base + 'USDT';
    if (!map[sym]) {
      map[sym] = c.id;
      exchangeInfo.push({
        symbol: sym,
        baseAsset: base,
        quoteAsset: 'USDT',
        pricePrecision: 2,
        quantityPrecision: 5,
      });
    }
  }
  return { idMap: map, exchangeInfo };
}

export class BinanceRestService {
  async fetchBinance(endpoint, params = {}) {
    throw new Error('Direct Binance API unavailable from this region; using alternative data source');
  }

  async getExchangeInfo() {
    const coins = await fetchCoinList();
    const { exchangeInfo } = buildSymbolMap(coins);
    return exchangeInfo;
  }

  async getKlines(symbol = 'BTCUSDT', interval = '1h', limit = 500) {
    const coins = await fetchCoinList();
    const { idMap } = buildSymbolMap(coins);
    const id = idMap[symbol];
    if (!id) throw new Error(`Unsupported symbol: ${symbol}`);

    const daysMap = { '1m': 1, '5m': 1, '15m': 1, '30m': 1, '1h': 10, '4h': 30, '1d': 90, '1w': 365 };
    const d = daysMap[interval] || 7;

    const chart = await fetchWithTimeout(
      `${COINGECKO_BASE}/coins/${id}/market_chart?vs_currency=usd&days=${d}`, 10000
    );
    if (!chart || !chart.prices) throw new Error(`No market_chart data for ${symbol}`);

    const bucketMs = { '1m': 60000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 };
    const bm = bucketMs[interval] || 3600000;

    const volumes = (chart.total_volumes || []).reduce((m, [t, v]) => {
      const bucket = Math.floor(t / bm) * bm;
      m.set(bucket, (m.get(bucket) || 0) + v);
      return m;
    }, new Map());

    const buckets = {};
    for (const [ts, price] of chart.prices) {
      const bucket = Math.floor(ts / bm) * bm;
      if (!buckets[bucket]) {
        buckets[bucket] = { time: bucket / 1000, open: price, high: price, low: price, close: price, volume: 0 };
      } else {
        buckets[bucket].high = Math.max(buckets[bucket].high, price);
        buckets[bucket].low = Math.min(buckets[bucket].low, price);
        buckets[bucket].close = price;
      }
    }

    for (const [bucket, vol] of volumes) {
      if (buckets[bucket]) buckets[bucket].volume = vol;
    }

    let result = Object.values(buckets).sort((a, b) => a.time - b.time);
    return result.slice(-Math.min(limit, result.length));
  }

  async get24hTickers() {
    const coins = await fetchCoinList();
    const { idMap } = buildSymbolMap(coins);

    return (coins || []).map(c => {
      const sym = (c.symbol || '').toUpperCase() + 'USDT';
      return {
        symbol: sym,
        priceChange: c.price_change_24h || 0,
        priceChangePercent: c.price_change_percentage_24h || 0,
        lastPrice: c.current_price || 0,
        volume: c.total_volume || 0,
        quoteVolume: (c.total_volume || 0) * (c.current_price || 0),
        highPrice: c.high_24h || 0,
        lowPrice: c.low_24h || 0,
        count: 0,
      };
    });
  }

  async get24hTicker(symbol) {
    const tickers = await this.get24hTickers();
    return tickers.find(t => t.symbol === symbol) || { symbol, lastPrice: 0, priceChange: 0, priceChangePercent: 0, volume: 0, highPrice: 0, lowPrice: 0 };
  }

  async searchSymbols(query) {
    if (!query || query.length < 1) return [];
    const q = query.toUpperCase();
    const coins = await fetchCoinList();
    const { exchangeInfo } = buildSymbolMap(coins);
    return exchangeInfo
      .filter(s => s.symbol.includes(q) || s.baseAsset.includes(q))
      .slice(0, 20);
  }
}
