import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { MultiExchangeWebSocketService } from './services/multiExchangeWs.js';
import { PaperTradingService } from './services/paperTrading.js';
import { priceCache } from './services/priceCache.js';
import db from './db/database.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Serve built frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

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

const pts = new PaperTradingService();

const multiWs = new MultiExchangeWebSocketService(io, priceCache);
multiWs.start();

io.on('connection', (socket) => {
  socket.on('subscribe', ({ exchange, symbol }) => {
    const sym = symbol?.toUpperCase() || 'BTCUSDT';
    multiWs.subscribe(exchange || 'binance', sym, socket.id);
    socket.join(`ticker:${sym}`);
  });
  socket.on('unsubscribe', ({ exchange, symbol }) => {
    const sym = symbol?.toUpperCase() || 'BTCUSDT';
    multiWs.unsubscribe(exchange || 'binance', sym, socket.id);
  });
  socket.on('subscribe-paper-positions', () => {
    socket.join('paper-positions');
  });
  socket.on('unsubscribe-paper-positions', () => {
    socket.leave('paper-positions');
  });
  socket.on('join-notifications', (userId) => {
    if (userId) socket.join(`user:${userId}`);
  });
  socket.on('disconnect', () => multiWs.removeClient(socket.id));
});

// Paper trading live loop: every 1 second
setInterval(() => {
  try {
    // Check and execute pending orders against live prices
    pts.checkPendingOrders(priceCache).then(executed => {
      if (executed.length > 0) {
        io.to('paper-positions').emit('paper-orders-executed', executed);
      }
    });

    const openTrades = db.getOpenTrades().filter(t => t.entry_price != null && t.quantity != null);
    const updates = [];

    for (const trade of openTrades) {
      const raw = priceCache[trade.symbol];
      const currentPrice = raw !== undefined ? parseFloat(raw) : trade.current_price || trade.entry_price;
      const hasLivePrice = raw !== undefined;

      // Update current price only if we have a live price
      if (hasLivePrice) {
        db.updateTrade(trade.id, { current_price: currentPrice });
      }

      // Check liquidation first
      const liqPrice = trade.side === 'long'
        ? trade.entry_price * (1 - 1 / trade.leverage + 0.005)
        : trade.entry_price * (1 + 1 / trade.leverage - 0.005);

      if (liqPrice) {
        if (trade.side === 'long' && currentPrice <= liqPrice) {
          pts.closeTrade(trade.id, liqPrice, 'liquidation');
          continue;
        }
        if (trade.side === 'short' && currentPrice >= liqPrice) {
          pts.closeTrade(trade.id, liqPrice, 'liquidation');
          continue;
        }
      }

      // Trailing stop
      if (trade.trailing_stop) {
        if (trade.side === 'long') {
          if (currentPrice > (trade.highest_price || trade.entry_price)) {
            db.updateTrade(trade.id, { highest_price: currentPrice });
          }
          const trailSl = (trade.highest_price || trade.entry_price) * (1 - trade.trailing_stop / 100);
          if (trade.stop_loss === null || trailSl > trade.stop_loss) {
            db.updateTrade(trade.id, { stop_loss: +trailSl.toFixed(2), trailing_stop_activated: true });
          }
        } else {
          if (currentPrice < (trade.lowest_price || trade.entry_price)) {
            db.updateTrade(trade.id, { lowest_price: currentPrice });
          }
          const trailSl = (trade.lowest_price || trade.entry_price) * (1 + trade.trailing_stop / 100);
          if (trade.stop_loss === null || trailSl < trade.stop_loss) {
            db.updateTrade(trade.id, { stop_loss: +trailSl.toFixed(2), trailing_stop_activated: true });
          }
        }
      }

      // Check SL
      if (trade.stop_loss) {
        if (trade.side === 'long' && currentPrice <= trade.stop_loss) {
          pts.closeTrade(trade.id, trade.stop_loss, 'stop_loss');
          continue;
        }
        if (trade.side === 'short' && currentPrice >= trade.stop_loss) {
          pts.closeTrade(trade.id, trade.stop_loss, 'stop_loss');
          continue;
        }
      }

      // Check TPs
      let tpClosed = false;
      for (const [tp, label] of [
        [trade.take_profit_3, 'tp3'], [trade.take_profit_2, 'tp2'], [trade.take_profit_1, 'tp1'],
      ]) {
        if (!tp) continue;
        if (trade.side === 'long' && currentPrice >= tp) {
          pts.closeTrade(trade.id, tp, `${label}_hit`);
          tpClosed = true;
          break;
        }
        if (trade.side === 'short' && currentPrice <= tp) {
          pts.closeTrade(trade.id, tp, `${label}_hit`);
          tpClosed = true;
          break;
        }
      }
      if (tpClosed) continue;

      // Build live position data
      const diff = trade.side === 'long'
        ? (currentPrice - trade.entry_price)
        : (trade.entry_price - currentPrice);
      const unrealizedPnl = +(diff * trade.quantity * trade.leverage).toFixed(2);
      const margin = (trade.entry_price * trade.quantity) / trade.leverage;
      const unrealizedPnlPercent = margin > 0 ? +((unrealizedPnl / margin) * 100).toFixed(2) : 0;

      const ms = Date.now() - new Date(trade.opened_at).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const duration = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

      let tpProgress = 0;
      if (trade.take_profit_1 && currentPrice !== trade.entry_price) {
        if (trade.side === 'long' && currentPrice > trade.entry_price) {
          tpProgress = Math.min(100, ((currentPrice - trade.entry_price) / (trade.take_profit_1 - trade.entry_price)) * 100);
        } else if (trade.side === 'short' && currentPrice < trade.entry_price) {
          tpProgress = Math.min(100, ((trade.entry_price - currentPrice) / (trade.entry_price - trade.take_profit_1)) * 100);
        }
      }

      let slDistance = null;
      if (trade.stop_loss && trade.entry_price !== 0) {
        if (trade.side === 'long') slDistance = +(((currentPrice - trade.stop_loss) / trade.entry_price) * 100).toFixed(2);
        else slDistance = +(((trade.stop_loss - currentPrice) / trade.entry_price) * 100).toFixed(2);
      }

      updates.push({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side,
        entry_price: trade.entry_price,
        current_price: currentPrice,
        quantity: trade.quantity,
        leverage: trade.leverage,
        stop_loss: trade.stop_loss,
        take_profit_1: trade.take_profit_1,
        take_profit_2: trade.take_profit_2,
        take_profit_3: trade.take_profit_3,
        trailing_stop: trade.trailing_stop,
        trailing_stop_activated: trade.trailing_stop_activated,
        unrealized_pnl: unrealizedPnl,
        unrealized_pnl_percent: unrealizedPnlPercent,
        liquidation_price: liqPrice ? +liqPrice.toFixed(2) : null,
        duration,
        tp_progress: +tpProgress.toFixed(1),
        sl_distance: slDistance,
        margin: +margin.toFixed(2),
        opened_at: trade.opened_at,
        suggestions: pts.getSuggestions(trade, currentPrice),
      });
    }

    if (updates.length > 0) {
      io.to('paper-positions').emit('paper-positions-update', updates);
    }

    // Emit pending orders update
    const pendingOrders = db.getPendingOrders();
    if (pendingOrders.length > 0) {
      const pendingUpdates = pendingOrders.map((o) => {
        const currentPrice = priceCache[o.symbol] || o.entry_price;
        return {
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          entry_price: o.entry_price,
          quantity: o.quantity,
          leverage: o.leverage,
          stop_loss: o.stop_loss,
          take_profit_1: o.take_profit_1,
          take_profit_2: o.take_profit_2,
          take_profit_3: o.take_profit_3,
          current_price: currentPrice,
          status: 'pending',
          opened_at: o.opened_at,
          margin: +((o.entry_price * o.quantity) / o.leverage).toFixed(2),
        };
      });
      io.to('paper-positions').emit('paper-pending-orders-update', pendingUpdates);
    }
  } catch {}
}, 1000);

// Fetch live prices for open trades AND pending orders every 5 seconds
setInterval(async () => {
  try {
    const symbols = [
      ...new Set([
        ...db.getOpenTrades().map(t => t.symbol),
        ...db.getPendingOrders().map(o => o.symbol),
      ])
    ];
    if (symbols.length === 0) return;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${JSON.stringify(symbols)}`);
    if (!res.ok) {
      // If symbols array fails, try one at a time for missing symbols
      const missing = symbols.filter(s => !priceCache[s]);
      if (missing.length > 0) {
        for (const sym of missing) {
          try {
            const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
            if (r.ok) {
              const p = await r.json();
              if (p.symbol && p.price) priceCache[p.symbol] = parseFloat(p.price);
            }
          } catch {}
        }
      }
      return;
    }
    const prices = await res.json();
    for (const p of prices) {
      if (p.symbol && p.price) priceCache[p.symbol] = parseFloat(p.price);
    }
  } catch {}
}, 5000);

// Price cache from tickers
app.use((req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (data) => {
    if (data?.symbol && data?.lastPrice) priceCache[data.symbol] = data.lastPrice;
    return origJson(data);
  };
  next();
});

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
