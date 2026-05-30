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

    const days = { '1m': 1, '5m': 1, '15m': 1, '30m': 2, '1h': 7, '4h': 30, '1d': 90, '1w': 365 };
    const d = days[interval] || 7;

    const data = await fetchWithTimeout(
      `${COINGECKO_BASE}/coins/${id}/ohlc?vs_currency=usd&days=${d}`,
      8000
    );

    return (data || []).map(k => ({
      time: k[0] / 1000,
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: 0,
      closeTime: k[0] / 1000,
      quoteVolume: 0,
      trades: 0,
    }));
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
