// BLUN - AI Organisator | MIT License
// Usage tracking and metrics routes — Monitor API usage, agent execution, and billing impact

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireAuth } = require('../middleware/auth');

// POST /usage/track — Log API/agent usage event
router.post('/track', authenticate, requireAuth, async function(req, res) {
  try {
    const { event_type, resource_id, cost_units, metadata } = req.body;

    if (!event_type || !resource_id) {
      return res.status(400).json({ error: 'event_type and resource_id required' });
    }

    const result = await pool.query(
      `INSERT INTO usage_events
       (user_id, event_type, resource_id, cost_units, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [req.user.id, event_type, resource_id, cost_units || 0, JSON.stringify(metadata || {})]
    );

    res.status(201).json({ event: result.rows[0], tracked: true });
  } catch (err) {
    console.error('[usage-tracking] track error:', err.message);
    res.status(500).json({ error: 'Failed to track usage event' });
  }
});

// GET /usage/summary — Usage summary for current user
router.get('/summary', authenticate, requireAuth, async function(req, res) {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30*24*60*60*1000);
    const toDate = to ? new Date(to) : new Date();

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_events,
        SUM(cost_units) as total_cost_units,
        event_type,
        COUNT(DISTINCT resource_id) as unique_resources
       FROM usage_events
       WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY event_type
       ORDER BY total_cost_units DESC`,
      [req.user.id, fromDate, toDate]
    );

    const totalUnits = result.rows.reduce((sum, row) => sum + (row.total_cost_units || 0), 0);
    res.json({
      summary: {
        period: { from: fromDate, to: toDate },
        total_events: result.rows.reduce((sum, row) => sum + parseInt(row.total_events), 0),
        total_cost_units: totalUnits,
        by_event_type: result.rows
      }
    });
  } catch (err) {
    console.error('[usage-tracking] summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch usage summary' });
  }
});

// GET /usage/daily — Daily usage breakdown
router.get('/daily', authenticate, requireAuth, async function(req, res) {
  try {
    const { days } = req.query;
    const daysBack = parseInt(days) || 30;

    const result = await pool.query(
      `SELECT
        DATE(created_at) as day,
        COUNT(*) as events,
        SUM(cost_units) as cost_units,
        COUNT(DISTINCT event_type) as event_types
       FROM usage_events
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(created_at)
       ORDER BY day DESC`,
      [req.user.id, daysBack]
    );

    res.json({
      daily: result.rows,
      range_days: daysBack
    });
  } catch (err) {
    console.error('[usage-tracking] daily error:', err.message);
    res.status(500).json({ error: 'Failed to fetch daily usage' });
  }
});

// GET /usage/limits — Current usage relative to plan limits
router.get('/limits', authenticate, requireAuth, async function(req, res) {
  try {
    const { getPlanLimits } = require('../middleware/plans');

    const subResult = await pool.query(
      'SELECT plan FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.user.id]
    );

    const plan = (subResult.rows[0] && subResult.rows[0].plan) || 'free';
    const limits = getPlanLimits(plan);

    const usageResult = await pool.query(
      `SELECT SUM(cost_units) as total_cost_units
       FROM usage_events
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [req.user.id]
    );

    const currentUsage = usageResult.rows[0]?.total_cost_units || 0;
    const monthlyLimit = limits?.cost_limit || 1000000;
    const percentUsed = Math.round((currentUsage / monthlyLimit) * 100);

    res.json({
      plan: plan,
      limits: limits,
      current_usage: {
        cost_units: currentUsage,
        monthly_limit: monthlyLimit,
        percent_of_limit: percentUsed
      },
      usage_warning: percentUsed > 80
    });
  } catch (err) {
    console.error('[usage-tracking] limits error:', err.message);
    res.status(500).json({ error: 'Failed to fetch usage limits' });
  }
});

module.exports = router;
