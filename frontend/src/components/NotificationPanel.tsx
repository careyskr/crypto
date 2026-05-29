import { useState, useMemo } from 'react';
import { useNotifications } from '../context/NotificationContext';

const TYPE_ICONS: Record<string, string> = {
  signal: '📡',
  trade: '📊',
  tp: '🎯',
  sl: '🛑',
  risk: '⚠️',
  whale: '🐋',
  system: '🔔',
  suggestion: '💡',
  success: '✅',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'border-l-accent-blue',
  normal: 'border-l-accent-green',
  high: 'border-l-accent-yellow',
  critical: 'border-l-accent-red',
};

function getTimeAgo(date: string) {
  const ms = Date.now() - new Date(date).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearRead } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = useMemo(() => {
    return filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;
  }, [notifications, filter]);

  return (
    <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] flex flex-col rounded-xl bg-bg-secondary border border-border-primary shadow-2xl backdrop-blur-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-medium text-accent-red bg-accent-red/10 px-1.5 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter(f => f === 'all' ? 'unread' : 'all')}
            className="text-[10px] px-2 py-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors"
          >
            {filter === 'all' ? 'Unread' : 'All'}
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-[10px] px-2 py-1 rounded-md text-accent-blue hover:text-accent-blue/80 hover:bg-accent-blue/10 transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={clearRead}
            className="text-[10px] px-2 py-1 rounded-md text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-border-primary/50">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="text-3xl mb-3 opacity-30">🔔</div>
            <p className="text-sm text-text-muted">No notifications</p>
            <p className="text-[11px] text-text-muted/60 mt-1">
              {filter === 'unread' ? 'All caught up!' : 'Nothing to show'}
            </p>
          </div>
        ) : (
          filtered.map(n => (
            <div
              key={n.id}
              onClick={() => { if (!n.is_read) markAsRead(n.id); }}
              className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-all border-l-2 ${
                PRIORITY_COLORS[n.priority] || 'border-l-transparent'
              } ${n.is_read ? 'opacity-60 hover:opacity-80' : 'bg-accent-blue/[0.02] hover:bg-bg-tertiary/50'}`}
            >
              <span className="text-lg shrink-0 mt-0.5">
                {TYPE_ICONS[n.notification_type] || '🔔'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-xs ${n.is_read ? 'text-text-secondary' : 'text-text-primary font-medium'}`}>
                    {n.title}
                  </p>
                  <span className="text-[10px] text-text-muted shrink-0 whitespace-nowrap">
                    {getTimeAgo(n.created_at)}
                  </span>
                </div>
                {n.message && (
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{n.message}</p>
                )}
              </div>
              {!n.is_read && (
                <span className="w-2 h-2 rounded-full bg-accent-blue shrink-0 mt-1.5" />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
