import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { binanceRouter } from './routes/binance.js';
import { indicatorsRouter } from './routes/indicators.js';
import { signalsRouter } from './routes/signals.js';
import { backtestRouter } from './routes/backtest.js';
import { exchangesRouter } from './routes/exchanges.js';
import { advancedSignalsRouter } from './routes/advancedSignals.js';
import { paperTradingRouter } from './routes/paperTrading.js';
import { patternsRouter } from './routes/patterns.js';
import { whaleRouter } from './routes/whale.js';
import { riskRouter } from './routes/risk.js';
import notificationsRouter from './routes/notifications.js';
import authRouter from './routes/auth.js';
import userRouter from './routes/user.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');

const app = express();

const migration = (async () => {
  try {
    const schemaPath = path.resolve(__dirname, '../schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await pool.query(schema);
      console.log('DB schema applied');
    }
  } catch (err) {
    console.warn('Schema migration skipped:', err.message);
  }
})();

app.use((req, res, next) => migration.then(() => next()).catch(next));
app.use(cors());
app.use(express.json());

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

app.get('/api/dbcheck', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS time, current_database() AS db');
    res.json({ connected: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.get('/api/envcheck', (req, res) => {
  res.json({
    PGHOST: process.env.PGHOST || '(not set)',
    PGPORT: process.env.PGPORT || '(not set)',
    PGDATABASE: process.env.PGDATABASE || '(not set)',
    PGUSER: process.env.PGUSER || '(not set)',
    PGPASSWORD: process.env.PGPASSWORD ? '***SET***' : '(not set)',
    JWT_SECRET: process.env.JWT_SECRET ? '***SET***' : '(not set)',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/binance', binanceRouter);
app.use('/api/indicators', indicatorsRouter);
app.use('/api/signals', signalsRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/exchanges', exchangesRouter);
app.use('/api/ai', advancedSignalsRouter);
app.use('/api/paper', paperTradingRouter);
app.use('/api/patterns', patternsRouter);
app.use('/api/whale', whaleRouter);
app.use('/api/risk', riskRouter);
app.use('/api/notifications', notificationsRouter);

if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

export default app;