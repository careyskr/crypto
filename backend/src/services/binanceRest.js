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

// Fallback list of known Binance USDT pairs (large, actively traded)
const FALLBACK_BINANCE_SYMBOLS = new Set([
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','TRXUSDT','LINKUSDT',
  'DOTUSDT','MATICUSDT','NEARUSDT','UNIUSDT','PEPEUSDT','ATOMUSDT','FILUSDT','APTUSDT','LTCUSDT','ARBUSDT',
  'AAVEUSDT','OPUSDT','INJUSDT','FETUSDT','ALGOUSDT','FTMUSDT','SANDUSDT','MANAUSDT','AXSUSDT','EGLDUSDT',
  'THETAUSDT','ICPUSDT','GRTUSDT','RUNEUSDT','CRVUSDT','GALAUSDT','CHZUSDT','ENJUSDT','XTZUSDT','EOSUSDT',
  'FLOWUSDT','KAVAUSDT','BATUSDT','ZILUSDT','DYDXUSDT','ANKRUSDT','IOSTUSDT','SKLUSDT','LRCUSDT','1INCHUSDT',
  'BANDUSDT','STORJUSDT','OMGUSDT','CTSIUSDT','CELOUSDT','ROSEUSDT','ALPHAUSDT','STMXUSDT','TVKUSDT','BLZUSDT',
  'SUSHIUSDT','YFIUSDT','SNXUSDT','COMPUSDT','MKRUSDT','UMAUSDT','BALUSDT','KNCUSDT','ZRXUSDT','RENUSDT',
  'LINAUSDT','ARUSDT','AUDIOUSDT','HOTUSDT','RVNUSDT','SCUSDT','DGBUSDT','WAVESUSDT','NEOUSDT','VETUSDT',
  'IOTAUSDT','ONTUSDT','QTUMUSDT','LSKUSDT','DASHUSDT','XEMUSDT','ZECUSDT','XMRUSDT','ETCUSDT','WBNBUSDT',
  'SHIBUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT','TIAUSDT','SEIUSDT','SUIUSDT','JTOUSDT','PYTHUSDT','STRKUSDT',
  'ENAUSDT','ETHFIUSDT','AEVOUSDT','REZUSDT','NOTUSDT','IOUSDT','ZROUSDT','BBUSDT','LISTAUSDT','FTNUSDT',
  'SAGAUSDT','TAOUSDT','OMNIUSDT','DEGENUSDT','TNSRUSDT','WUSDT','PENDLEUSDT','ALTUSDT','METISUSDT','BLASTUSDT',
  'ZKUSDT','TONUSDT','HMSTRUSDT','DOGSUSDT','CATIUSDT','NEIROUSDT','GOATUSDT','SLERFUSDT','BOMEUSDT','MEWUSDT',
  'POPCATUSDT','MOGUSDT','PONKEUSDT','MYROUSDT','WENUSDT','DYMUSDT','NMTUSDT','ACALAUSDT','GLMRUSDT','MOVRUSDT',
  'CFXUSDT','KAIAUSDT','MNTUSDT','POLUSDT','COREUSDT','BEAMUSDT','RENDERUSDT','IMXUSDT','JASMYUSDT','WLDUSDT',
  'FLOKIUSDT','ORDIUSDT','SATSIUSDT','RATSUSDT','1000SATSUSDT','ACHUSDT','NFPUSDT','ACEUSDT','XAIUSDT','MANTAUSDT',
  'PIXELUSDT','PORTALUSDT','ETHWUSDT','LDOUSDT','RPLUSDT','SSVUSDT','FXSUSDT','AGIXUSDT','OCEANUSDT','NMRUSDT',
  'POLYXUSDT','VANRYUSDT','RLCUSDT','TRBUSDT','OGNUSDT','CVCUSDT','GTCUSDT','ANTUSDT','BELUSDT','DUSKUSDT',
  'AIUSDT','ARKMUSDT','NFPUSDT','ACIOUSDT','IDUSDT','SYNUSDT','MAVUSDT','PHAUSDT','AMBUSDT','IQUSDT',
  'VELOUSDT','RADUSDT','PROMUSDT','LITUSDT','API3USDT','SXPUSDT','REIUSDT','BADGERUSDT','BOBAUSDT','IMXUSDT',
  'KSMUSDT','ZENUSDT','STXUSDT','MINAUSDT','ENSUSDT','HNTUSDT','GNOUSDT','CKBUSDT','CHRUSDT','CELRUSDT',
  'ALICEUSDT','BICOUSDT','CLVUSDT','REQUSDT','VITEUSDT','FUNUSDT','LOOMUSDT','BTRSTUSDT','COTIUSDT','TRIBEUSDT',
  'MDTUSDT','WAXPUSDT','TLMUSDT','QNTUSDT','KMDUSDT','SYSUSDT','ARDRUSDT','XVSUSDT','ALPACAUSDT','EPSUSDT',
  'FIOUSDT','DOCKUSDT','AVAUSDT','ATMUSDT','DIAUSDT','FISUSDT','MLNUSDT','DENTUSDT','DREPUSDT','RAIUSDT',
  'RIFUSDT','RENBTCUSDT','PNTUSDT','BZRXUSDT','CREAMUSDT','KP3RUSDT','TRUUSDT','ORNUSDT','UTKUSDT','C98USDT',
  'ERNUSDT','IDEXUSDT','POLSUSDT','SUPERUSDT','AKROUSDT','COCOSUSDT','MTLUSDT','TOMOUSDT','KAIUSDT','FTTUSDT',
  'SRMUSDT','MAPSUSDT','MEDIAUSDT','OXYUSDT','FIDAUSDT','RAYUSDT','COPEUSDT','MERUSDT','LIKEUSDT','LATTEUSDT',
  'SBRUSDT','SLIMUSDT','TULIPUSDT','WOOUSDT','UNFIUSDT','BONDUSDT','FORTHUSDT','NUUSDT','KEEPUSDT','MASKUSDT',
  'DODOUSDT','BAKEUSDT','BURGERUSDT','SWINGBYUSDT','CAKEUSDT','TWTUSDT','XPRUSDT','VIDTUSDT','STPTUSDT','DGUSDT',
  'AUCTIONUSDT','PROSUSDT','QUICKUSDT','ALPINEUSDT','PORTOUSDT','SANTOSUSDT','LAZIUSDT','PSGUSDT','CITYUSDT','ACMUSDT',
  'ATMUSDT','JUVUSDT','NAPUSDT','FORUSDT','ASRUSDT','BARUSDT','INTERUSDT','AFCUSDT','ARGUSDT','ROMAUSDT',
  'CROUSDT','HEGICUSDT','PEOPLEUSDT','OOKIUSDT','GALUSDT','RAREUSDT','DEXEUSDT','YGGUSDT','MAGICUSDT','LQTYUSDT',
  'CREAMUSDT','CVPUSDT','BETAUSDT','LEVERUSDT','PONDUSDT','VOXELUSDT','HIGHUSDT','GSTUSDT','GMTUSDT','MBOXUSDT',
  'RACAUSDT','ERNUSDT','CEEKUSDT','TLMUSDT','DARUSDT','RNDRUSDT','HFTUSDT','MULTIUSDT','OAXUSDT','PLAUSDT',
  'POWRUSDT','QKCUSDT','RAMPUSDT','SHFTUSDT','SNTUSDT','STRAXUSDT','TROYUSDT','VIBUSDT','WANUSDT','WINUSDT',
  'WNXMUSDT','XECUSDT','YFIIUSDT','ZCXUSDT','ZENUSDT','ZILUSDT','ZRXUSDT','TRBUSDT','TFUELUSDT','NKNUSDT',
  'NULSUSDT','OCEANUSDT','OGNUSDT','OMUSDT','ONEUSDT','ONGUSDT','ORNUSDT','OSTUSDT','PHBUSDT','PIVXUSDT',
  'POLYUSDT','PSTAKEUSDT','QNTUSDT','RADUSDT','RAREUSDT','RENUSDT','REPUSDT','REQUSDT','RLCUSDT','ROSEUSDT',
  'RUNEUSDT','SFPUSDT','SKLUSDT','SLPUSDT','SNXUSDT','SOLVEUSDT','SPELLUSDT','SRMUSDT','SteemUSDT','STGUSDT',
  'STMXUSDT','STORJUSDT','STPTUSDT','STRAXUSDT','STXUSDT','SUNUSDT','SUPERUSDT','SUSHIUSDT','SWRVUSDT','SXPUSDT',
]);

// Fetch Binance valid trading pairs - try multiple endpoints
const BINANCE_REST = 'https://api.binance.com';
const BINANCE_MIRRORS = ['https://api1.binance.com', 'https://api2.binance.com', 'https://api3.binance.com'];

async function fetchBinanceSymbols() {
  const urls = [BINANCE_REST, ...BINANCE_MIRRORS];
  for (const base of urls) {
    try {
      const data = await fetchWithTimeout(`${base}/api/v3/exchangeInfo`, 5000);
      if (data && data.symbols) {
        const symbols = data.symbols
          .filter(s => s.status === 'TRADING' && s.quoteAsset === 'USDT')
          .map(s => s.symbol);
        if (symbols.length > 0) return new Set(symbols);
      }
    } catch {}
  }
  return null;
}

let binanceSymbolsCache = null;
let binanceSymbolsTime = 0;
const BINANCE_SYMBOLS_TTL = 300000; // 5 min

async function getBinanceSymbols() {
  if (binanceSymbolsCache && Date.now() - binanceSymbolsTime < BINANCE_SYMBOLS_TTL) {
    return binanceSymbolsCache;
  }
  const symbols = await fetchBinanceSymbols();
  if (symbols) {
    binanceSymbolsCache = symbols;
    binanceSymbolsTime = Date.now();
  }
  return symbols || FALLBACK_BINANCE_SYMBOLS;
}

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

  async fetchBinance24hTickers() {
    const urls = [BINANCE_REST, ...BINANCE_MIRRORS];
    for (const base of urls) {
      try {
        const data = await fetchWithTimeout(`${base}/api/v3/ticker/24hr`, 10000);
        if (Array.isArray(data) && data.length > 0) {
          return data
            .filter(t => t.symbol.endsWith('USDT'))
            .map(t => ({
              symbol: t.symbol,
              priceChange: parseFloat(t.priceChange) || 0,
              priceChangePercent: parseFloat(t.priceChangePercent) || 0,
              lastPrice: parseFloat(t.lastPrice) || 0,
              volume: parseFloat(t.volume) || 0,
              quoteVolume: parseFloat(t.quoteVolume) || 0,
              highPrice: parseFloat(t.highPrice) || 0,
              lowPrice: parseFloat(t.lowPrice) || 0,
              count: t.count || 0,
            }));
        }
      } catch {}
    }
    return null;
  }

  async get24hTickers() {
    const tickers = await this.fetchBinance24hTickers();
    if (tickers) return tickers;
    return [];
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
