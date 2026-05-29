import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { detectPatterns } from '../services/patternDetector.js';

export const patternsRouter = Router();
const binance = new BinanceRestService();

patternsRouter.get('/detect', async (req, res) => {
  try {
    const { symbol, interval } = req.query;
    const klines = await binance.getKlines(symbol || 'BTCUSDT', interval || '1h', 500);
    const patterns = detectPatterns(klines);
    res.json({ symbol: symbol || 'BTCUSDT', interval: interval || '1h', patterns, count: patterns.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
