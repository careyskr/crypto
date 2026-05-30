import pool from '../db.js';

const dbInterface = {
  async getAccount() {
    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = 1');
    if (rows.length === 0) {
      const { rows: inserted } = await pool.query(
        `INSERT INTO accounts (id, name, balance, initial_balance)
         VALUES (1, 'Paper Account', 10000, 10000) RETURNING *`
      );
      return inserted[0];
    }
    return rows[0];
  },

  async updateAccount(fields) {
    const keys = Object.keys(fields);
    const setStr = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => fields[k]);
    const { rows } = await pool.query(
      `UPDATE accounts SET ${setStr} WHERE id = $1 RETURNING *`,
      [1, ...values]
    );
    return rows[0];
  },

  async addTrade(trade) {
    const keys = ['account_id', 'symbol', 'side', 'type', 'entry_price', 'current_price', 'quantity', 'leverage', 'stop_loss', 'take_profit_1', 'take_profit_2', 'take_profit_3', 'trailing_stop', 'trailing_stop_activated', 'highest_price', 'lowest_price', 'status', 'reason', 'fee', 'pnl', 'pnl_percent', 'exit_price', 'signal_id'];
    const cols = keys.filter(k => trade[k] !== undefined);
    const vals = cols.map(k => trade[k]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO trades (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return rows[0];
  },

  async getTrade(id) {
    const { rows } = await pool.query('SELECT * FROM trades WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async getOpenTrades() {
    const { rows } = await pool.query(
      "SELECT * FROM trades WHERE status = 'open' ORDER BY id DESC"
    );
    return rows;
  },

  async getPendingOrders() {
    const { rows } = await pool.query(
      "SELECT * FROM trades WHERE status = 'pending' ORDER BY id DESC"
    );
    return rows;
  },

  async getCancelledOrders() {
    const { rows } = await pool.query(
      "SELECT * FROM trades WHERE status = 'cancelled' ORDER BY id DESC"
    );
    return rows;
  },

  async getClosedTrades(limit = 50) {
    const { rows } = await pool.query(
      "SELECT * FROM trades WHERE status = 'closed' ORDER BY id DESC LIMIT $1",
      [limit]
    );
    return rows;
  },

  async getAllTrades(limit = 100) {
    const { rows } = await pool.query(
      'SELECT * FROM trades ORDER BY id DESC LIMIT $1',
      [limit]
    );
    return rows;
  },

  async updateTrade(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.getTrade(id);
    const setStr = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => fields[k]);
    const { rows } = await pool.query(
      `UPDATE trades SET ${setStr} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return rows[0];
  },

  async getTradesBySymbol(symbol) {
    const { rows } = await pool.query(
      'SELECT * FROM trades WHERE symbol = $1',
      [symbol]
    );
    return rows;
  },

  async resetAccount(balance = 10000) {
    const { rows: old } = await pool.query('SELECT * FROM accounts WHERE id = 1');
    const acc = old[0];
    await pool.query(
      `UPDATE accounts SET balance = $1, initial_balance = $1, total_pnl = 0, win_count = 0, loss_count = 0 WHERE id = 1`,
      [balance]
    );
    await pool.query(
      `UPDATE trades SET status = 'closed', exit_price = entry_price, pnl = 0, pnl_percent = 0, closed_at = NOW(), reason = 'account_reset' WHERE status = 'open'`
    );
    const { rows: updated } = await pool.query('SELECT * FROM accounts WHERE id = 1');
    return updated[0];
  },
};

export default dbInterface;