import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface ThemeContextType {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function getInitialTheme(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem('crypto-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return 'dark';
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.removeAttribute('data-theme');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme);
  const { user, token } = useAuth();
  const loadedFromServer = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('crypto-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (!user || !token || loadedFromServer.current) return;
    loadedFromServer.current = true;

    fetch('/api/user/preferences', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : null)
      .then(prefs => {
        if (prefs && prefs.theme_mode && (prefs.theme_mode === 'dark' || prefs.theme_mode === 'light')) {
          setTheme(prefs.theme_mode);
        }
      })
      .catch(() => {});
  }, [user, token]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (token) {
        fetch('/api/user/theme', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ theme_mode: next })
        }).catch(() => {});
      }
      return next;
    });
  }, [token]);

  const setThemeMode = useCallback((mode: 'dark' | 'light') => {
    setTheme(mode);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
