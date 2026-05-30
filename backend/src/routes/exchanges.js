import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { BybitRestService } from '../services/bybitRest.js';
import { OkxRestService } from '../services/okxRest.js';
import { KucoinRestService } from '../services/kucoinRest.js';
import { CoinbaseRestService } from '../services/coinbaseRest.js';
import { KrakenRestService } from '../services/krakenRest.js';

export const exchangesRouter = Router();

const exchanges = {
  binance: new BinanceRestService(),
  bybit: new BybitRestService(),
  okx: new OkxRestService(),
  kucoin: new KucoinRestService(),
  coinbase: new CoinbaseRestService(),
  kraken: new KrakenRestService(),
};

function getExchange(name) {
  const ex = exchanges[name?.toLowerCase()];
  if (!ex) throw new Error(`Unknown exchange: ${name}. Available: binance, bybit, okx, kucoin, coinbase, kraken`);
  return ex;
}

// List available exchanges
exchangesRouter.get('/list', (req, res) => {
  res.json({
    exchanges: [
      { id: 'binance', name: 'Binance', ws: 'wss://stream.binance.com' },
      { id: 'bybit', name: 'Bybit', ws: 'wss://stream.bybit.com' },
      { id: 'okx', name: 'OKX', ws: 'wss://ws.okx.com' },
      { id: 'kucoin', name: 'KuCoin', ws: 'wss://ws-api.kucoin.com' },
      { id: 'coinbase', name: 'Coinbase', ws: 'wss://ws-feed.exchange.coinbase.com' },
      { id: 'kraken', name: 'Kraken', ws: 'wss://ws.kraken.com' },
    ],
  });
});

// Get klines from any exchange
exchangesRouter.get('/klines', async (req, res) => {
  try {
    const { exchange, symbol, interval, limit } = req.query;
    const ex = getExchange(exchange || 'binance');

    // Normalize symbol for each exchange
    let normalizedSymbol = symbol || 'BTCUSDT';
    if (exchange === 'okx' || exchange === 'kucoin') {
      normalizedSymbol = normalizedSymbol.replace('USDT', '-USDT');
    }

    const data = await ex.getKlines(normalizedSymbol, interval, parseInt(limit) || 500);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get 24h tickers from any exchange
exchangesRouter.get('/tickers', async (req, res) => {
  try {
    const { exchange } = req.query;
    const ex = getExchange(exchange || 'binance');
    const data = await ex.get24hTickers();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single ticker from any exchange
exchangesRouter.get('/ticker/:symbol', async (req, res) => {
  try {
    const { exchange } = req.query;
    const ex = getExchange(exchange || 'binance');

    let normalizedSymbol = req.params.symbol;
    if (exchange === 'okx' || exchange === 'kucoin') {
      normalizedSymbol = normalizedSymbol.replace('USDT', '-USDT');
    }

    const data = await ex.get24hTicker(normalizedSymbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search symbols on any exchange
exchangesRouter.get('/search', async (req, res) => {
  try {
    const { exchange, q } = req.query;
    const ex = getExchange(exchange || 'binance');
    const data = await ex.searchSymbols(q);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get price comparison across all exchanges
exchangesRouter.get('/compare/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const results = {};

    const promises = Object.entries(exchanges).map(async ([name, ex]) => {
      try {
        let normalizedSymbol = symbol;
        if (name === 'okx' || name === 'kucoin') {
          normalizedSymbol = normalizedSymbol.replace('USDT', '-USDT');
        }
        const ticker = await ex.get24hTicker(normalizedSymbol);
        results[name] = {
          price: ticker.lastPrice,
          change24h: ticker.priceChangePercent,
          volume: ticker.quoteVolume,
        };
      } catch (err) {
        results[name] = { error: err.message };
      }
    });

    await Promise.allSettled(promises);

    // Find best price
    const validResults = Object.entries(results).filter(([, r]) => r.price);
    if (validResults.length > 0) {
      const prices = validResults.map(([name, r]) => ({ name, price: r.price }));
      results.bestBid = prices.reduce((a, b) => a.price > b.price ? a : b);
      results.bestAsk = prices.reduce((a, b) => a.price < b.price ? a : b);
      results.spread = results.bestBid.price - results.bestAsk.price;
      results.spreadPercent = (results.spread / results.bestAsk.price) * 100;
    }

    res.json({ symbol, exchanges: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
