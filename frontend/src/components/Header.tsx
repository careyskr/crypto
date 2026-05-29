import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/useAppStore';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { formatSymbol } from '../utils/format';
import type { Exchange } from '../types';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;

const EXCHANGES: { id: Exchange; name: string; color: string }[] = [
  { id: 'binance', name: 'Binance', color: '#F0B90B' },
  { id: 'bybit', name: 'Bybit', color: '#F7A600' },
  { id: 'okx', name: 'OKX', color: '#FFFFFF' },
  { id: 'kucoin', name: 'KuCoin', color: '#23AF44' },
  { id: 'coinbase', name: 'Coinbase', color: '#0052FF' },
  { id: 'kraken', name: 'Kraken', color: '#5841D8' },
];

export function Header() {
  const { symbol, interval, setInterval, exchange, setExchange, toggleSidebar, setSearchOpen, triggerSignalFor } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="h-14 flex items-center px-4 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-xl shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 mr-6">
        <button onClick={toggleSidebar} className="text-text-secondary hover:text-text-primary transition-colors p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span className="font-semibold text-sm hidden sm:block">CryptoSignal</span>
        </div>
      </div>

      {/* Exchange Selector */}
      <div className="flex items-center bg-bg-primary rounded-lg p-0.5 mr-3">
        {EXCHANGES.map((ex) => (
          <button
            key={ex.id}
            onClick={() => setExchange(ex.id)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              exchange === ex.id
                ? 'text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            style={exchange === ex.id ? { backgroundColor: `${ex.color}20`, color: ex.color } : {}}
          >
            {ex.name}
          </button>
        ))}
      </div>

      {/* Current Symbol — click to generate signal */}
      <div className="flex items-center gap-2 mr-4">
        <button onClick={() => triggerSignalFor(symbol)}
          className="font-mono font-semibold text-sm text-text-primary hover:text-accent-blue transition-colors px-2 py-0.5 rounded hover:bg-accent-blue/10">
          {formatSymbol(symbol)}
        </button>
      </div>

      {/* Timeframes */}
      <div className="hidden md:flex items-center gap-1 mr-4">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setInterval(tf as any)}
            className={`px-2 py-1 text-xs font-medium rounded transition-all ${
              interval === tf
                ? 'bg-accent-blue/20 text-accent-blue'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search Button */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-primary border border-border-primary hover:border-border-hover transition-all text-text-muted text-xs mr-3"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <span className="hidden sm:block">Search</span>
        <kbd className="hidden sm:block text-[10px] bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">/</kbd>
      </button>

      {/* Notification Bell */}
      <NotificationBell />

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary text-xs mr-2"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <span className="hidden sm:block text-[10px] font-medium">Light</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span className="hidden sm:block text-[10px] font-medium">Dark</span>
          </>
        )}
      </button>

      {/* User Menu */}
      {user ? (
        <div className="flex items-center gap-2 pl-2 border-l border-border-primary">
          <div className="w-7 h-7 rounded-full bg-accent-green/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-accent-green">
              {user.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs font-medium text-text-primary max-w-[80px] truncate">
            {user.username}
          </span>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="text-[10px] text-text-muted hover:text-accent-red transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate('/login')}
          className="text-xs text-accent-green hover:text-accent-green/80 transition-colors font-medium px-2"
        >
          Login
        </button>
      )}
    </header>
  );
}
