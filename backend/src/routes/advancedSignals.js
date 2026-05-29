import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { generateConfirmedSignal } from '../services/advancedSignalEngine.js';
import { scanMarket } from '../services/marketScanner.js';
import { scanWithPreferences, generateSmartSignal, analyzeCoin, findTrade } from '../services/aiScannerEngine.js';
import { explainSignal } from '../services/aiExplainer.js';

export const advancedSignalsRouter = Router();
const binance = new BinanceRestService();

// In-memory user preferences store
const userPreferences = {
  tradingMode: 'intraday',
  riskLevel: 'moderate',
  timeframe: '1h',
  direction: 'both',
  exchange: 'binance',
  marketType: 'spot',
};

// GET/POST user preferences
advancedSignalsRouter.get('/preferences', (req, res) => {
  res.json(userPreferences);
});

advancedSignalsRouter.post('/preferences', (req, res) => {
  const { tradingMode, riskLevel, timeframe, direction, exchange, marketType } = req.body;
  if (tradingMode) userPreferences.tradingMode = tradingMode;
  if (riskLevel) userPreferences.riskLevel = riskLevel;
  if (timeframe) userPreferences.timeframe = timeframe;
  if (direction) userPreferences.direction = direction;
  if (exchange) userPreferences.exchange = exchange;
  if (marketType) userPreferences.marketType = marketType;
  res.json({ success: true, preferences: userPreferences });
});

// ANALYZE COIN - Full technical analysis
advancedSignalsRouter.get('/analyze-coin', async (req, res) => {
  try {
    const { symbol, ...prefs } = req.query;
    const sym = (symbol || '').toUpperCase();
    if (!sym) return res.status(400).json({ error: 'Symbol required' });
    const mergedPrefs = { ...userPreferences, ...prefs };
    const result = await analyzeCoin(sym, mergedPrefs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FIND TRADE - Check if safe trade setup exists
advancedSignalsRouter.get('/find-trade', async (req, res) => {
  try {
    const { symbol, ...prefs } = req.query;
    const sym = (symbol || '').toUpperCase();
    if (!sym) return res.status(400).json({ error: 'Symbol required' });
    const mergedPrefs = { ...userPreferences, ...prefs };
    const result = await findTrade(sym, mergedPrefs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SIGNAL MODE - Generate confirmed signal for a symbol with preferences
advancedSignalsRouter.get('/signal', async (req, res) => {
  try {
    const { symbol, interval, explain } = req.query;
    const sym = (symbol || 'BTCUSDT').toUpperCase();
    const tf = interval || '1h';

    const klines = await binance.getKlines(sym, tf, 500);
    const result = await generateConfirmedSignal(sym, klines, tf);

    if (explain === 'true' && result.signal !== 'NO_TRADE') {
      result.aiExplanation = await explainSignal(result, sym);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SMART SIGNAL - Generate signal using user preferences
advancedSignalsRouter.get('/smart-signal', async (req, res) => {
  try {
    const { symbol, ...prefs } = req.query;
    const sym = (symbol || 'BTCUSDT').toUpperCase();
    const mergedPrefs = { ...userPreferences, ...prefs };

    // If generating for "best" signal, scan for top opportunity first
    if (sym === 'BEST') {
      const scanResult = await scanWithPreferences({
        ...mergedPrefs,
        direction: 'both',
        limit: 30,
      });
      if (scanResult.qualified === 0) {
        return res.json({
          signal: 'NO_TRADE',
          confidence: 0,
          symbol: 'NONE',
          reason: 'No safe high-confidence setup currently available across scanned coins.',
          exchange: mergedPrefs.exchange,
          tradingMode: mergedPrefs.tradingMode,
          timeframe: mergedPrefs.timeframe,
          riskLevel: mergedPrefs.riskLevel,
          scanned: scanResult.scanned,
          qualified: 0,
          timestamp: Date.now(),
        });
      }
      const bestSymbol = scanResult.results[0].symbol;
      const signal = await generateSmartSignal(bestSymbol, mergedPrefs);
      signal.scanned = scanResult.scanned;
      signal.qualified = scanResult.qualified;
      signal.topCoins = scanResult.results.slice(0, 5).map(r => ({
        symbol: r.symbol,
        score: r.opportunityScore,
        trend: r.trend,
      }));
      return res.json(signal);
    }

    const signal = await generateSmartSignal(sym, mergedPrefs);
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SCAN MODE - Scan market for opportunities (basic)
advancedSignalsRouter.get('/scan', async (req, res) => {
  try {
    const { limit, interval, mode } = req.query;
    const result = await scanMarket({
      limit: Math.min(parseInt(limit) || 50, 200),
      timeframe: interval || '1h',
      mode: mode || 'moderate',
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SMART SCAN - Scan with user preferences (richer output)
advancedSignalsRouter.get('/smart-scan', async (req, res) => {
  try {
    const { limit, ...prefs } = req.query;
    const mergedPrefs = { ...userPreferences, ...prefs };

    const result = await scanWithPreferences({
      ...mergedPrefs,
      limit: Math.min(parseInt(limit) || 60, 100),
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// BATCH SIGNALS - Generate signals for multiple symbols
advancedSignalsRouter.post('/batch', async (req, res) => {
  try {
    const { symbols, interval, explain } = req.body;
    const tf = interval || '1h';
    const results = [];

    for (let i = 0; i < (symbols || []).length; i += 3) {
      const batch = symbols.slice(i, i + 3);
      const batchResults = await Promise.allSettled(
        batch.map(async (sym) => {
          const klines = await binance.getKlines(sym, tf, 500);
          const signal = await generateConfirmedSignal(sym, klines, tf);
          if (explain === 'true' && signal.signal !== 'NO_TRADE') {
            signal.aiExplanation = await explainSignal(signal, sym);
          }
          return signal;
        })
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled') results.push(r.value);
      }
    }

    const confirmed = results.filter(r => r.signal !== 'NO_TRADE');
    const rejected = results.filter(r => r.signal === 'NO_TRADE');

    res.json({
      confirmed: confirmed.sort((a, b) => b.confidence - a.confidence),
      rejected,
      totalScanned: results.length,
      totalConfirmed: confirmed.length,
      totalRejected: rejected.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
