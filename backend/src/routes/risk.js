import { Router } from 'express';
import { calculateRisk, getDailyRiskSummary } from '../services/riskManager.js';
import db from '../db/database.js';

export const riskRouter = Router();

riskRouter.post('/calculate', (req, res) => {
  try { res.json(calculateRisk(req.body)); } catch (err) { res.status(500).json({ error: err.message }); }
});

riskRouter.get('/daily', async (req, res) => {
  try {
    const account = await db.getAccount();
    const trades = await db.getAllTrades();
    res.json(getDailyRiskSummary(trades, account.balance));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
