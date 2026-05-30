import { Router } from 'express';
import { PaperTradingService } from '../services/paperTrading.js';
import { getTradeAdvice } from '../services/aiExplainer.js';

export const paperTradingRouter = Router();
const pts = new PaperTradingService();

paperTradingRouter.get('/account', async (req, res) => {
  try { res.json(await pts.getAccount()); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/stats', async (req, res) => {
  try { res.json(await pts.getStats()); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/open', async (req, res) => {
  try {
    const trades = await pts.getOpenTrades();
    const enriched = trades.map((t) => {
      const currentPrice = t.current_price || t.entry_price;
      return pts.getLiveTradeData(t, currentPrice);
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/closed', async (req, res) => {
  try { res.json(await pts.getClosedTrades(parseInt(req.query.limit) || 50)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades', async (req, res) => {
  try { res.json(await pts.getAllTrades(parseInt(req.query.limit) || 100)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.get('/trades/:id', async (req, res) => {
  try {
    const trade = await pts.getTrade(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    res.json(trade);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/trade', async (req, res) => {
  try {
    const trade = await pts.openTrade(req.body);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.get('/orders/pending', async (req, res) => {
  try {
    const orders = await pts.getPendingOrders();
    const enriched = orders.map((o) => {
      const currentPrice = o.entry_price;
      return pts.getLiveOrderData(o, currentPrice);
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/orders/:id/cancel', async (req, res) => {
  try {
    const result = await pts.cancelPendingOrder(parseInt(req.params.id));
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.put('/orders/:id/modify', async (req, res) => {
  try {
    const result = await pts.modifyPendingOrder(parseInt(req.params.id), req.body);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/orders/check-pending', async (req, res) => {
  try {
    const executed = await pts.checkPendingOrders(req.body.prices || {});
    res.json({ executed, count: executed.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.put('/trade/:id/modify', async (req, res) => {
  try {
    const trade = await pts.modifyTrade(parseInt(req.params.id), req.body);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/trade/:id/partial-close', async (req, res) => {
  try {
    const result = await pts.partialClose(parseInt(req.params.id), req.body.percentage);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/trade/:id/close', async (req, res) => {
  try {
    const trade = await pts.closeTrade(parseInt(req.params.id), req.body.exitPrice, req.body.reason);
    res.json(trade);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

paperTradingRouter.post('/reset', async (req, res) => {
  try { res.json(await pts.resetAccount(req.body.balance)); } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/check-sl-tp', async (req, res) => {
  try {
    await pts.checkStopLossAndTakeProfit(req.body.symbol, req.body.currentPrice);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

paperTradingRouter.post('/ai-advice/:id', async (req, res) => {
  try {
    const trade = await pts.getTrade(parseInt(req.params.id));
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    const advice = await getTradeAdvice(trade, req.body.prices || {});
    res.json({ advice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});