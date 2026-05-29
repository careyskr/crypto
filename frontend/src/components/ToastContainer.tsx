import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../context/NotificationContext';

const TOAST_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
  signal: { bg: 'bg-accent-blue/10', border: 'border-accent-blue/30', icon: '📡' },
  trade: { bg: 'bg-accent-green/10', border: 'border-accent-green/30', icon: '📊' },
  tp: { bg: 'bg-accent-green/10', border: 'border-accent-green/30', icon: '🎯' },
  sl: { bg: 'bg-accent-red/10', border: 'border-accent-red/30', icon: '🛑' },
  risk: { bg: 'bg-accent-yellow/10', border: 'border-accent-yellow/30', icon: '⚠️' },
  whale: { bg: 'bg-accent-purple/10', border: 'border-accent-purple/30', icon: '🐋' },
  system: { bg: 'bg-accent-blue/10', border: 'border-accent-blue/30', icon: '🔔' },
  suggestion: { bg: 'bg-accent-cyan/10', border: 'border-accent-cyan/30', icon: '💡' },
  success: { bg: 'bg-accent-green/10', border: 'border-accent-green/30', icon: '✅' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useNotifications();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => {
          const style = TOAST_STYLES[toast.type] || TOAST_STYLES.system;
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              onClick={() => removeToast(toast.id)}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border ${style.border} ${style.bg} backdrop-blur-xl bg-bg-secondary/90 shadow-2xl cursor-pointer max-w-[360px]`}
            >
              <span className="text-lg shrink-0 mt-0.5">{style.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary">{toast.title}</p>
                {toast.message && (
                  <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{toast.message}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
