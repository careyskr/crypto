import { Router } from 'express';
import pool from '../db.js';
import { authenticateToken } from '../auth.js';

const router = Router();

router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      const newPrefs = await pool.query(
        `INSERT INTO user_preferences (user_id) VALUES ($1) RETURNING *`,
        [req.user.id]
      );
      return res.json(newPrefs.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/preferences', authenticateToken, async (req, res) => {
  const { market_type, trading_mode, risk_level, theme_mode, notifications_enabled, default_leverage } = req.body;

  try {
    const result = await pool.query(
      `UPDATE user_preferences SET
        market_type = COALESCE($1, market_type),
        trading_mode = COALESCE($2, trading_mode),
        risk_level = COALESCE($3, risk_level),
        theme_mode = COALESCE($4, theme_mode),
        notifications_enabled = COALESCE($5, notifications_enabled),
        default_leverage = COALESCE($6, default_leverage)
      WHERE user_id = $7
      RETURNING *`,
      [market_type, trading_mode, risk_level, theme_mode, notifications_enabled ?? true, default_leverage, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, avatar, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/theme', authenticateToken, async (req, res) => {
  const { theme_mode } = req.body;

  if (!theme_mode || !['dark', 'light'].includes(theme_mode)) {
    return res.status(400).json({ error: 'Invalid theme mode. Must be "dark" or "light"' });
  }

  try {
    const result = await pool.query(
      `UPDATE user_preferences SET theme_mode = $1 WHERE user_id = $2 RETURNING *`,
      [theme_mode, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update theme error:', err);
    res.status(500).json({ error: 'Failed to update theme' });
  }
});

export default router;
