import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { generateSignal } from '../services/signalEngine.js';
import { explainSignal } from '../services/aiExplainer.js';

export const signalsRouter = Router();
const binance = new BinanceRestService();

// Get signal for a single symbol
signalsRouter.get('/signal', async (req, res) => {
  try {
    const { symbol, interval, explain } = req.query;
    const sym = (symbol || 'BTCUSDT').toUpperCase();
    const tf = interval || '1h';

    const klines = await binance.getKlines(sym, tf, 500);
    const signal = generateSignal(klines);
    signal.symbol = sym;

    if (explain === 'true') {
      signal.explanation = await explainSignal(signal, sym);
    }

    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scan multiple symbols
signalsRouter.post('/scan', async (req, res) => {
  try {
    const { symbols, interval, mode } = req.body;
    const tf = interval || '1h';
    const limit = Math.min(symbols?.length || 50, 100);

    const results = [];
    const symList = (symbols || []).slice(0, limit);

    // Process in batches of 5 to avoid rate limits
    for (let i = 0; i < symList.length; i += 5) {
      const batch = symList.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async (sym) => {
          const klines = await binance.getKlines(sym, tf, 500);
          const signal = generateSignal(klines);
          signal.symbol = sym;
          return signal;
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    // Filter based on mode
    const minConfidence = mode === 'aggressive' ? 30 : mode === 'moderate' ? 50 : 70;
    const filtered = results.filter(r =>
      r.signal !== 'NEUTRAL' && r.confidence >= minConfidence
    );

    // Sort by confidence
    filtered.sort((a, b) => b.confidence - a.confidence);

    res.json({
      results: filtered,
      total: results.length,
      filtered: filtered.length,
      mode: mode || 'conservative',
      interval: tf,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get top signals (quick scan)
signalsRouter.get('/top', async (req, res) => {
  try {
    const { interval, mode, limit } = req.query;
    const tf = interval || '1h';
    const maxSymbols = parseInt(limit) || 50;

    // Get top USDT pairs by volume
    const tickers = await binance.get24hTickers();
    const topSymbols = tickers
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, maxSymbols)
      .map(t => t.symbol);

    const results = [];
    for (let i = 0; i < topSymbols.length; i += 5) {
      const batch = topSymbols.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async (sym) => {
          const klines = await binance.getKlines(sym, tf, 500);
          const signal = generateSignal(klines);
          signal.symbol = sym;
          return signal;
        })
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    const minConfidence = mode === 'aggressive' ? 30 : mode === 'moderate' ? 50 : 70;
    const filtered = results
      .filter(r => r.signal !== 'NEUTRAL' && r.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);

    res.json({
      results: filtered,
      total: results.length,
      filtered: filtered.length,
      mode: mode || 'conservative',
      interval: tf,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
