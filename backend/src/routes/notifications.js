import { Router } from 'express';
import pool from '../db.js';
import { authenticateToken } from '../auth.js';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  const { unread } = req.query;
  try {
    let query = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [req.user.id];
    if (unread === 'true') {
      query += ' AND is_read = false';
    }
    query += ' ORDER BY created_at DESC LIMIT 50';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ count: result.rows[0].count });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

router.delete('/clear', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM notifications WHERE user_id = $1 AND is_read = true',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Clear notifications error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT notifications_enabled FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );
    res.json({
      signal_alerts: true,
      trade_alerts: true,
      risk_alerts: true,
      whale_alerts: true,
      system_alerts: true,
      notifications_enabled: result.rows[0]?.notifications_enabled ?? true,
    });
  } catch (err) {
    console.error('Get notification settings error:', err);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

router.put('/settings', authenticateToken, async (req, res) => {
  const { signal_alerts, trade_alerts, risk_alerts, whale_alerts, system_alerts } = req.body;
  try {
    const enabled = signal_alerts && trade_alerts && risk_alerts && whale_alerts && system_alerts;
    await pool.query(
      'UPDATE user_preferences SET notifications_enabled = $1 WHERE user_id = $2',
      [enabled, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Update notification settings error:', err);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

export async function createNotification(userId, { title, message, type = 'system', priority = 'normal', tradeId = null, signalId = null }) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, message, notification_type, priority, related_trade_id, related_signal_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, title, message, type, priority, tradeId, signalId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Create notification error:', err);
    return null;
  }
}

export async function createNotificationForAll({ title, message, type = 'system', priority = 'normal' }) {
  try {
    const users = await pool.query('SELECT id FROM users');
    for (const user of users.rows) {
      await createNotification(user.id, { title, message, type, priority });
    }
  } catch (err) {
    console.error('Broadcast notification error:', err);
  }
}

export default router;
