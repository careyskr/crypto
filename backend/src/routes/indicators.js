import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { calculateAllIndicators } from '../services/indicators.js';

export const indicatorsRouter = Router();
const binance = new BinanceRestService();

indicatorsRouter.get('/calculate', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;
    const klines = await binance.getKlines(symbol || 'BTCUSDT', interval || '1h', parseInt(limit) || 500);
    const indicators = calculateAllIndicators(klines);
    res.json(indicators);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
