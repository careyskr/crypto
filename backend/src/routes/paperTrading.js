import { Router } from 'express';
import { PaperTradingService } from '../services/paperTrading.js';
import { getTradeAdvice } from '../services/aiExplainer.js';
import { priceCache } from '../services/priceCache.js';

export const paperTradingRouter = Router();
const pts = new PaperTradingService();

paperTradingRouter.get('/account', (req, res) => {
  try { res.json(pts.getAccount()); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/stats', (req, res) => {
  try { res.json(pts.getStats()); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/open', (req, res) => {
  try {
    const trades = pts.getOpenTrades();
    const enriched = trades.map((t) => {
      const currentPrice = t.current_price || t.entry_price;
      return pts.getLiveTradeData(t, currentPrice);
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/closed', (req, res) => {
  try { res.json(pts.getClosedTrades(parseInt(req.query.limit) || 50)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades', (req, res) => {
  try { res.json(pts.getAllTrades(parseInt(req.query.limit) || 100)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/:id', (req, res) => {
  try {
    const trade = pts.getTrade(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/trade', (req, res) => {
  try {
    const trade = pts.openTrade(req.body);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.get('/orders/pending', (req, res) => {
  try {
    const orders = pts.getPendingOrders();
    const enriched = orders.map((o) => {
      const currentPrice = priceCache[o.symbol] || o.entry_price;
      return pts.getLiveOrderData(o, currentPrice);
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/orders/:id/cancel', (req, res) => {
  try {
    const result = pts.cancelPendingOrder(parseInt(req.params.id));
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.put('/orders/:id/modify', (req, res) => {
  try {
    const result = pts.modifyPendingOrder(parseInt(req.params.id), req.body);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/orders/check-pending', async (req, res) => {
  try {
    const executed = await pts.checkPendingOrders(priceCache);
    res.json({ executed, count: executed.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.put('/trade/:id/modify', (req, res) => {
  try {
    const trade = pts.modifyTrade(parseInt(req.params.id), req.body);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/trade/:id/partial-close', (req, res) => {
  try {
    const result = pts.partialClose(parseInt(req.params.id), req.body.percentage);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/trade/:id/close', (req, res) => {
  try {
    const trade = pts.closeTrade(parseInt(req.params.id), req.body.exitPrice, req.body.reason);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/reset', (req, res) => {
  try { res.json(pts.resetAccount(req.body.balance)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/check-sl-tp', (req, res) => {
  try {
    pts.checkStopLossAndTakeProfit(req.body.symbol, req.body.currentPrice);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/ai-advice/:id', async (req, res) => {
  try {
    const trade = pts.getTrade(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const advice = await getTradeAdvice(trade, priceCache);
    res.json({ advice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
