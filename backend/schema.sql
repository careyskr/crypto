CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  market_type VARCHAR(20) DEFAULT 'spot',
  trading_mode VARCHAR(20) DEFAULT 'intraday',
  risk_level VARCHAR(20) DEFAULT 'moderate',
  theme_mode VARCHAR(10) DEFAULT 'dark',
  notifications_enabled BOOLEAN DEFAULT true,
  default_leverage DECIMAL(4,1) DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS ai_signals (
  id SERIAL PRIMARY KEY,
  coin VARCHAR(20) NOT NULL,
  signal_type VARCHAR(20) NOT NULL,
  market_type VARCHAR(20) NOT NULL,
  entry_min DECIMAL(20,8),
  entry_max DECIMAL(20,8),
  stop_loss DECIMAL(20,8),
  tp1 DECIMAL(20,8),
  tp2 DECIMAL(20,8),
  tp3 DECIMAL(20,8),
  confidence DECIMAL(5,2),
  reasoning TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  coin VARCHAR(20) NOT NULL,
  market_type VARCHAR(20),
  position_type VARCHAR(10),
  leverage DECIMAL(4,1) DEFAULT 1.0,
  entry_price DECIMAL(20,8),
  current_price DECIMAL(20,8),
  pnl DECIMAL(20,8),
  roi DECIMAL(10,4),
  stop_loss DECIMAL(20,8),
  tp1 DECIMAL(20,8),
  tp2 DECIMAL(20,8),
  tp3 DECIMAL(20,8),
  status VARCHAR(20) DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portfolio_stats (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  paper_balance DECIMAL(20,2) DEFAULT 10000.00,
  total_trades INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2) DEFAULT 0,
  total_pnl DECIMAL(20,8) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  notification_type VARCHAR(50) DEFAULT 'system',
  priority VARCHAR(20) DEFAULT 'normal',
  is_read BOOLEAN DEFAULT false,
  related_trade_id INTEGER,
  related_signal_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
