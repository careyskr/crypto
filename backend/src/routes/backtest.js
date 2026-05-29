import { Router } from 'express';
import { BinanceRestService } from '../services/binanceRest.js';
import { runBacktest } from '../services/backtester.js';

export const backtestRouter = Router();
const binance = new BinanceRestService();

backtestRouter.post('/run', async (req, res) => {
  try {
    const { symbol, interval, days, config } = req.body;
    const sym = (symbol || 'BTCUSDT').toUpperCase();
    const tf = interval || '1h';
    const lookbackDays = Math.min(days || 90, 365);

    // Calculate how many klines we need
    const intervalsPerDay = {
      '1m': 1440, '3m': 480, '5m': 288, '15m': 96, '30m': 48,
      '1h': 24, '2h': 12, '4h': 6, '6h': 4, '8h': 3, '12h': 2,
      '1d': 1, '3d': 1/3, '1w': 1/7,
    };
    const klinesNeeded = Math.min(lookbackDays * (intervalsPerDay[tf] || 24), 1000);

    const klines = await binance.getKlines(sym, tf, Math.min(klinesNeeded, 1000));

    if (klines.length < 100) {
      return res.status(400).json({ error: 'Not enough historical data for backtesting' });
    }

    const result = runBacktest(klines, config || {});
    result.symbol = sym;
    result.interval = tf;
    result.dataPoints = klines.length;

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
