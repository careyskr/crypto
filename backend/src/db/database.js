import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_DB = {
  accounts: [{ id: 1, name: 'Paper Account', balance: 10000, initial_balance: 10000, total_pnl: 0, win_count: 0, loss_count: 0, created_at: new Date().toISOString() }],
  trades: [],
  signals: [],
  whale_alerts: [],
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    }
  } catch {}
  return { ...DEFAULT_DB };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Auto-save every 10 seconds
setInterval(() => saveDB(db), 10000);

const dbInterface = {
  getAccount() { return db.accounts.find(a => a.id === 1); },

  updateAccount(fields) {
    const acc = db.accounts.find(a => a.id === 1);
    Object.assign(acc, fields);
    saveDB(db);
    return acc;
  },

  addTrade(trade) {
    trade.id = db.trades.length + 1;
    trade.opened_at = new Date().toISOString();
    if (!trade.status) trade.status = 'open';
    db.trades.push(trade);
    saveDB(db);
    return trade;
  },

  getTrade(id) { return db.trades.find(t => t.id === id); },

  getOpenTrades() { return db.trades.filter(t => t.status === 'open').reverse(); },

  getPendingOrders() { return db.trades.filter(t => t.status === 'pending').reverse(); },

  getCancelledOrders() { return db.trades.filter(t => t.status === 'cancelled').reverse(); },

  getClosedTrades(limit = 50) {
    return db.trades.filter(t => t.status === 'closed').slice(-limit).reverse();
  },

  getAllTrades(limit = 100) { return db.trades.slice(-limit).reverse(); },

  updateTrade(id, fields) {
    const trade = db.trades.find(t => t.id === id);
    if (trade) Object.assign(trade, fields);
    saveDB(db);
    return trade;
  },

  getTradesBySymbol(symbol) {
    return db.trades.filter(t => t.symbol === symbol);
  },

  resetAccount(balance = 10000) {
    const acc = db.accounts.find(a => a.id === 1);
    acc.balance = balance;
    acc.initial_balance = balance;
    acc.total_pnl = 0;
    acc.win_count = 0;
    acc.loss_count = 0;

    // Close all open trades without PnL impact, but preserve history
    for (const t of db.trades) {
      if (t.status === 'open') {
        t.status = 'closed';
        t.exit_price = t.entry_price;
        t.pnl = 0;
        t.pnl_percent = 0;
        t.closed_at = new Date().toISOString();
        t.reason = 'account_reset';
      }
    }

    saveDB(db);
    return acc;
  },
};

export default dbInterface;
