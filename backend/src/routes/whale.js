import { Router } from 'express';
import { WhaleTrackerService } from '../services/whaleTracker.js';

export const whaleRouter = Router();
const tracker = new WhaleTrackerService();

whaleRouter.get('/alerts', async (req, res) => {
  try {
    const alerts = await tracker.getWhaleAlerts();
    const sentiment = tracker.getWhaleSentiment(alerts);
    res.json({ alerts, sentiment, count: alerts.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
