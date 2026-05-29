import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';

export const binanceRouter = Router();
const binance = new BinanceRestService();

// Get exchange info (all symbols)
binanceRouter.get('/exchange-info', async (req, res) => {
  try {
    const data = await binance.getExchangeInfo();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get klines (candlestick data)
binanceRouter.get('/klines', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;
    const data = await binance.getKlines(symbol, interval, parseInt(limit) || 500);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get 24h ticker for all symbols
binanceRouter.get('/tickers', async (req, res) => {
  try {
    const data = await binance.get24hTickers();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get 24h ticker for single symbol
binanceRouter.get('/ticker/:symbol', async (req, res) => {
  try {
    const data = await binance.get24hTicker(req.params.symbol);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search symbols
binanceRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    const data = await binance.searchSymbols(q);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
