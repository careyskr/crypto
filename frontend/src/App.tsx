import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useAppStore, Page } from './stores/useAppStore';
import { Header } from './components/Header';
import { ChartPanel } from './components/ChartPanel';
import { Sidebar } from './components/Sidebar';
import { SignalPanel } from './components/SignalPanel';
import { SearchModal } from './components/SearchModal';
import { MarqueeTicker } from './components/MarqueeTicker';
import { OrderBook } from './components/OrderBook';
import { PaperTrading } from './components/PaperTrading';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { WhaleTracker } from './components/WhaleTracker';
import { RiskCalculator } from './components/RiskCalculator';
import { PatternDetection } from './components/PatternDetection';
import { ToastContainer } from './components/ToastContainer';
import Login from './pages/Login';
import Signup from './pages/Signup';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center bg-bg-primary"><div className="w-6 h-6 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Dashboard() {
  const { searchOpen, sidebarOpen, symbol, page, setPage } = useAppStore();
  const [showOrderBook, setShowOrderBook] = useState(() => localStorage.getItem('showOrderBook') !== 'false');
  const [showSignalPanel, setShowSignalPanel] = useState(() => localStorage.getItem('showSignalPanel') !== 'false');

  useEffect(() => { localStorage.setItem('showOrderBook', String(showOrderBook)); }, [showOrderBook]);
  useEffect(() => { localStorage.setItem('showSignalPanel', String(showSignalPanel)); }, [showSignalPanel]);

  return (
    <div className="h-screen flex flex-col bg-bg-primary text-text-primary overflow-hidden">
      <nav className="h-9 flex items-center px-3 border-b border-border-primary bg-bg-secondary/80 backdrop-blur-xl shrink-0 gap-1">
        {([
          { id: 'terminal', label: 'Terminal', icon: '◈' },
          { id: 'paper', label: 'Paper Trading', icon: '📊' },
          { id: 'analytics', label: 'Analytics', icon: '📈' },
          { id: 'patterns', label: 'Patterns', icon: '◇' },
          { id: 'whale', label: 'Whale Tracker', icon: '🐋' },
          { id: 'risk', label: 'Risk Manager', icon: '⚙' },
        ] as { id: Page; label: string; icon: string }[]).map(item => (
          <button key={item.id} onClick={() => setPage(item.id)}
            className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded-md transition-all ${
              page === item.id ? 'bg-accent-green/10 text-accent-green neon-green' : 'text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/30'
            }`}>
            <span className="text-[11px]">{item.icon}</span>
            <span className="hidden md:block">{item.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        {page === 'terminal' && (
          <>
            <button onClick={() => setShowOrderBook(!showOrderBook)}
              className={`text-[10px] px-2 py-1 rounded ${showOrderBook ? 'text-accent-green bg-accent-green/10' : 'text-text-muted'}`}>
              Order Book
            </button>
            <button onClick={() => setShowSignalPanel(!showSignalPanel)}
              className={`text-[10px] px-2 py-1 rounded ${showSignalPanel ? 'text-accent-green bg-accent-green/10' : 'text-text-muted'}`}>
              Signal Panel
            </button>
          </>
        )}
      </nav>

      {page === 'terminal' && (
        <>
          <Header />
          <MarqueeTicker />
          <div className="flex flex-1 overflow-hidden">
            {sidebarOpen && <Sidebar />}
            <ChartPanel />
            {showOrderBook && (
              <div className="w-64 border-l border-border-primary bg-bg-secondary/30 shrink-0 hidden lg:block">
                <OrderBook symbol={symbol} />
              </div>
            )}
            {showSignalPanel && <SignalPanel />}
          </div>
        </>
      )}

      {page === 'paper' && (
        <>
          <Header />
          <div className="flex flex-1 overflow-y-auto"><PaperTrading /></div>
        </>
      )}

      {page === 'analytics' && <div className="flex-1 overflow-y-auto"><AnalyticsDashboard /></div>}
      {page === 'patterns' && <div className="flex-1 overflow-y-auto"><PatternDetection /></div>}
      {page === 'whale' && <div className="flex-1 overflow-y-auto"><WhaleTracker /></div>}
      {page === 'risk' && <div className="flex-1 overflow-y-auto"><RiskCalculator /></div>}

      {searchOpen && <SearchModal />}
    </div>
  );
}

export default function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/*" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

export { Dashboard };
