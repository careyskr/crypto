import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimeInterval, MarketType, Exchange } from '../types';

export type Page = 'terminal' | 'paper' | 'analytics' | 'whale' | 'risk' | 'patterns';

interface AppState {
  exchange: Exchange;
  setExchange: (exchange: Exchange) => void;

  symbol: string;
  setSymbol: (symbol: string) => void;

  interval: TimeInterval;
  setInterval: (interval: TimeInterval) => void;

  marketType: MarketType;
  setMarketType: (type: MarketType) => void;

  favorites: string[];
  toggleFavorite: (symbol: string) => void;
  isFavorite: (symbol: string) => boolean;

  sidebarOpen: boolean;
  toggleSidebar: () => void;

  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;

  page: Page;
  setPage: (page: Page) => void;

  tradingMode: string;
  setTradingMode: (mode: string) => void;
  riskLevel: string;
  setRiskLevel: (level: string) => void;
  tradeDirection: string;
  setTradeDirection: (dir: string) => void;

  signalTriggerSymbol: string | null;
  triggerSignalFor: (symbol: string) => void;
  clearSignalTrigger: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      marketType: 'spot',
      favorites: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
      sidebarOpen: true,
      searchOpen: false,
      page: 'terminal',
      setPage: (page) => set({ page }),
      tradingMode: 'intraday',
      riskLevel: 'moderate',
      tradeDirection: 'both',
      signalTriggerSymbol: null,

      setExchange: (exchange) => set({ exchange }),
      setSymbol: (symbol) => set({ symbol }),
      setInterval: (interval) => set({ interval }),
      setMarketType: (marketType) => set({ marketType }),

      toggleFavorite: (symbol) => {
        const favs = get().favorites;
        if (favs.includes(symbol)) {
          set({ favorites: favs.filter((f) => f !== symbol) });
        } else {
          set({ favorites: [...favs, symbol] });
        }
      },
      isFavorite: (symbol) => get().favorites.includes(symbol),

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSearchOpen: (searchOpen) => set({ searchOpen }),

      setTradingMode: (tradingMode) => set({ tradingMode }),
      setRiskLevel: (riskLevel) => set({ riskLevel }),
      setTradeDirection: (tradeDirection) => set({ tradeDirection }),

      triggerSignalFor: (symbol) => set({ symbol, signalTriggerSymbol: symbol }),
      clearSignalTrigger: () => set({ signalTriggerSymbol: null }),
    }),
    {
      name: 'crypto-dashboard-store',
      partialize: (state) => ({
        symbol: state.symbol,
        favorites: state.favorites,
        interval: state.interval,
        marketType: state.marketType,
        exchange: state.exchange,
        page: state.page,
        tradingMode: state.tradingMode,
        riskLevel: state.riskLevel,
        tradeDirection: state.tradeDirection,
      }),
    }
  )
);
