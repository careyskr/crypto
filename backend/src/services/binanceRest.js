const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const SYMBOL_MAP = {
  'BTCUSDT': 'bitcoin',
  'ETHUSDT': 'ethereum',
  'BNBUSDT': 'binancecoin',
  'SOLUSDT': 'solana',
  'XRPUSDT': 'ripple',
  'ADAUSDT': 'cardano',
  'DOGEUSDT': 'dogecoin',
  'AVAXUSDT': 'avalanche-2',
  'DOTUSDT': 'polkadot',
  'LINKUSDT': 'chainlink',
  'MATICUSDT': 'matic-network',
  'UNIUSDT': 'uniswap',
  'SHIBUSDT': 'shiba-inu',
  'LTCUSDT': 'litecoin',
  'ATOMUSDT': 'cosmos',
  'ETCUSDT': 'ethereum-classic',
  'XLMUSDT': 'stellar',
  'BCHUSDT': 'bitcoin-cash',
  'ALGOUSDT': 'algorand',
  'VETUSDT': 'vechain',
  'FILUSDT': 'filecoin',
  'TRXUSDT': 'tron',
  'APTUSDT': 'aptos',
  'ARBUSDT': 'arbitrum',
  'OPUSDT': 'optimism',
  'SUIUSDT': 'sui',
  'PEPEUSDT': 'pepe',
  'INJUSDT': 'injective-protocol',
  'TIAUSDT': 'celestia',
  'SEIUSDT': 'sei-network',
  'NEARUSDT': 'near',
  'SANDUSDT': 'the-sandbox',
  'MANAUSDT': 'decentraland',
  'AAVEUSDT': 'aave',
  'MKRUSDT': 'maker',
  'CRVUSDT': 'curve-dao-token',
  'COMPUSDT': 'compound-governance-token',
  'AXSUSDT': 'axie-infinity',
  'EGLDUSDT': 'elrond-erd-2',
  'FTMUSDT': 'fantom',
  'RUNEUSDT': 'thorchain',
  'KAVAUSDT': 'kava',
  'QTUMUSDT': 'qtum',
  'ZECUSDT': 'zcash',
  'DASHUSDT': 'dash',
  'XMRUSDT': 'monero',
  'HBARUSDT': 'hedera-hashgraph',
  'ICPUSDT': 'internet-computer',
  'FETUSDT': 'fetch-ai',
  'GRTUSDT': 'the-graph',
};

const INTERVAL_MAP = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': '1',
  '1w': '7',
};

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
    oldest.slice(0, 50).forEach(([k]) => cache.delete(k));
  }
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const cached = cachedFetch(url, 3000);
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

export class BinanceRestService {
  async fetchBinance(endpoint, params = {}) {
    throw new Error('Direct Binance API unavailable from this region; using alternative data source');
  }

  async getExchangeInfo() {
    return Object.entries(SYMBOL_MAP).map(([symbol, id]) => ({
      symbol, baseAsset: symbol.replace('USDT', ''), quoteAsset: 'USDT',
      pricePrecision: 2, quantityPrecision: 5,
    }));
  }

  async getKlines(symbol = 'BTCUSDT', interval = '1h', limit = 500) {
    const id = SYMBOL_MAP[symbol];
    if (!id) throw new Error(`Unsupported symbol: ${symbol}`);

    // CoinGecko market_chart returns price+volume data points:
    //   days=1  → ~288 points (5m granularity)
    //   days=7  → ~168 points (hourly)
    //   days=30 → ~720 points (hourly)
    //   days=90 → ~2160 points (hourly)
    // We construct OHLC candles by bucketing these data points.

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
    const data = await fetchWithTimeout(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=volume_desc&per_page=100&page=1&sparkline=false`,
      10000
    );

    const reverseMap = {};
    for (const [sym, id] of Object.entries(SYMBOL_MAP)) {
      reverseMap[id] = sym;
    }

    return (data || []).filter(c => reverseMap[c.id]).map(c => ({
      symbol: reverseMap[c.id],
      priceChange: c.price_change_24h || 0,
      priceChangePercent: c.price_change_percentage_24h || 0,
      lastPrice: c.current_price || 0,
      volume: c.total_volume || 0,
      quoteVolume: (c.total_volume || 0) * (c.current_price || 0),
      highPrice: c.high_24h || 0,
      lowPrice: c.low_24h || 0,
      count: 0,
    }));
  }

  async get24hTicker(symbol) {
    const tickers = await this.get24hTickers();
    return tickers.find(t => t.symbol === symbol) || { symbol, lastPrice: 0, priceChange: 0, priceChangePercent: 0, volume: 0, highPrice: 0, lowPrice: 0 };
  }

  async searchSymbols(query) {
    if (!query || query.length < 1) return [];
    const q = query.toUpperCase();
    return Object.keys(SYMBOL_MAP)
      .filter(s => s.includes(q) || s.replace('USDT', '').includes(q))
      .slice(0, 20)
      .map(s => ({ symbol: s, baseAsset: s.replace('USDT', ''), quoteAsset: 'USDT', pricePrecision: 2, quantityPrecision: 5 }));
  }
}
