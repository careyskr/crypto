import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  notification_type: string;
  priority: string;
  is_read: boolean;
  related_trade_id: number | null;
  related_signal_id: number | null;
  created_at: string;
}

interface Toast {
  id: number | string;
  title: string;
  message: string;
  type: string;
  priority: string;
}

interface NotificationSettings {
  signal_alerts: boolean;
  trade_alerts: boolean;
  risk_alerts: boolean;
  whale_alerts: boolean;
  system_alerts: boolean;
  notifications_enabled: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  toasts: Toast[];
  settings: NotificationSettings;
  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearRead: () => Promise<void>;
  addToast: (toast: { id?: number | string; title: string; message: string; type: string; priority: string }) => void;
  removeToast: (id: number | string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>({
    signal_alerts: true,
    trade_alerts: true,
    risk_alerts: true,
    whale_alerts: true,
    system_alerts: true,
    notifications_enabled: true,
  });
  const { user, token } = useAuth();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {}
  }, [token]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count);
      }
    } catch {}
  }, [token]);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchNotifications();
    fetchUnreadCount();
    fetchSettings();
  }, [token]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 10000);
    return () => clearInterval(interval);
  }, [user, fetchUnreadCount]);

  const markAsRead = useCallback(async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  }, [token]);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  }, [token]);

  const clearRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/clear', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch {}
  }, [token]);

  const addToast = useCallback(({ id, title, message, type, priority }: { id?: number | string; title: string; message: string; type: string; priority: string }) => {
    const toast: Toast = { id: id || Date.now(), title, message, type, priority };
    setToasts(prev => [...prev, toast]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, priority === 'critical' ? 6000 : 4000);
  }, []);

  const removeToast = useCallback((id: number | string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    try {
      await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });
    } catch {}
  }, [token]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      toasts,
      settings,
      fetchNotifications,
      fetchUnreadCount,
      markAsRead,
      markAllAsRead,
      clearRead,
      addToast,
      removeToast,
      updateSettings,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
