// BLUN - API v1 | Billing & Company Payments | MIT License
const express = require("express");
const { pool } = require("../../db");
const { authenticate, requireAuth } = require("../../middleware/auth");
const { logActivity } = require("../../middleware/activity");

var router = express.Router();

// Middleware: Company Authorization
async function requireCompanyAccess(req, res, next) {
  try {
    var companyId = req.body.company_id || req.query.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "company_id required" });
    }

    // Check if user is owner or member of company
    var check = await pool.query(
      "SELECT id FROM companies WHERE id = $1 AND (owner_user_id = $2 OR id IN (SELECT company_id FROM company_members WHERE user_id = $2 AND role IN ('admin', 'member')))",
      [companyId, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Access denied to this company" });
    }

    req.company_id = companyId;
    next();
  } catch (err) {
    console.error("[billing] Company auth error:", err.message);
    res.status(500).json({ error: "Authorization failed" });
  }
}

// POST /billing/v1/subscription — Create/Update Company Subscription
router.post("/subscription", authenticate, requireAuth, requireCompanyAccess, async function(req, res) {
  try {
    var { company_id, plan, billing_contact_email, billing_contact_name } = req.body;

    // Validate plan
    var validPlans = ["free", "pro", "team", "enterprise"];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ error: "Invalid plan. Use: free, pro, team, enterprise" });
    }

    // Check for existing subscription
    var existing = await pool.query(
      "SELECT id, plan, status FROM subscriptions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
      [company_id]
    );

    if (existing.rows.length > 0) {
      // Update existing subscription
      var sub = existing.rows[0];
      await pool.query(
        "UPDATE subscriptions SET plan = $1, status = $2, billing_contact_email = $3, billing_contact_name = $4, updated_at = NOW() WHERE id = $5",
        [plan, "active", billing_contact_email || null, billing_contact_name || null, sub.id]
      );

      // Log activity
      logActivity(req.user.id, "billing_subscription_updated", {
        company_id: company_id,
        plan: plan,
        previous_plan: sub.plan
      }, req.headers["x-forwarded-for"] || req.connection.remoteAddress);

      return res.json({
        subscription_id: sub.id,
        plan: plan,
        status: "active",
        action: "updated",
        effective_date: new Date()
      });
    }

    // Create new subscription
    var result = await pool.query(
      "INSERT INTO subscriptions (company_id, user_id, plan, status, billing_contact_email, billing_contact_name, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id, plan, status, created_at",
      [company_id, req.user.id, plan, "active", billing_contact_email || null, billing_contact_name || null]
    );

    var subscription = result.rows[0];

    // Log activity
    logActivity(req.user.id, "billing_subscription_created", {
      company_id: company_id,
      plan: plan,
      subscription_id: subscription.id
    }, req.headers["x-forwarded-for"] || req.connection.remoteAddress);

    res.status(201).json({
      subscription_id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      action: "created",
      effective_date: subscription.created_at
    });
  } catch (err) {
    console.error("[billing] subscription error:", err.message);
    res.status(500).json({ error: "Failed to create/update subscription" });
  }
});

// GET /billing/v1/usage — Get Company Usage Stats
router.get("/usage", authenticate, requireAuth, async function(req, res) {
  try {
    var companyId = req.query.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "company_id required" });
    }

    // Check access
    var check = await pool.query(
      "SELECT id FROM companies WHERE id = $1 AND (owner_user_id = $2 OR id IN (SELECT company_id FROM company_members WHERE user_id = $2))",
      [companyId, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Access denied to this company" });
    }

    // Get subscription info
    var subResult = await pool.query(
      "SELECT id, plan, status, created_at, updated_at FROM subscriptions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
      [companyId]
    );

    var subscription = subResult.rows[0] || { plan: "free", status: "inactive" };

    // Get usage stats (last 30 days)
    var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    var usage = await pool.query(
      "SELECT COUNT(*) as count FROM activity_logs WHERE company_id = $1 AND timestamp > $2",
      [companyId, thirtyDaysAgo]
    );

    var apiCalls = usage.rows[0]?.count || 0;

    // Get agent deployments count
    var agents = await pool.query(
      "SELECT COUNT(*) as count FROM agents WHERE company_id = $1 AND status = 'active'",
      [companyId]
    );

    var activeAgents = agents.rows[0]?.count || 0;

    // Get storage usage (approx from attachments)
    var storage = await pool.query(
      "SELECT SUM(CAST(metadata->>'size' AS INTEGER)) as total_bytes FROM attachments WHERE company_id = $1",
      [companyId]
    );

    var storageMB = Math.round((storage.rows[0]?.total_bytes || 0) / (1024 * 1024));

    // Plan limits
    var planLimits = {
      free: { api_calls: 1000, agents: 1, storage_mb: 100 },
      pro: { api_calls: 100000, agents: 5, storage_mb: 1000 },
      team: { api_calls: 1000000, agents: 20, storage_mb: 5000 },
      enterprise: { api_calls: -1, agents: -1, storage_mb: -1 }
    };

    var limits = planLimits[subscription.plan] || planLimits.free;

    // Calculate usage percentage
    var apiUsagePercent = limits.api_calls === -1 ? 0 : Math.round((apiCalls / limits.api_calls) * 100);
    var agentUsagePercent = limits.agents === -1 ? 0 : Math.round((activeAgents / limits.agents) * 100);
    var storageUsagePercent = limits.storage_mb === -1 ? 0 : Math.round((storageMB / limits.storage_mb) * 100);

    res.json({
      company_id: companyId,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        active_since: subscription.created_at,
        last_updated: subscription.updated_at
      },
      usage: {
        api_calls: {
          current: apiCalls,
          limit: limits.api_calls === -1 ? null : limits.api_calls,
          percent: apiUsagePercent,
          period: "30_days"
        },
        agents: {
          current: activeAgents,
          limit: limits.agents === -1 ? null : limits.agents,
          percent: agentUsagePercent
        },
        storage_mb: {
          current: storageMB,
          limit: limits.storage_mb === -1 ? null : limits.storage_mb,
          percent: storageUsagePercent
        }
      },
      limits: limits,
      warnings: {
        api_calls_high: apiUsagePercent > 80,
        agents_high: agentUsagePercent > 80,
        storage_high: storageUsagePercent > 80
      }
    });
  } catch (err) {
    console.error("[billing] usage error:", err.message);
    res.status(500).json({ error: "Failed to fetch usage stats" });
  }
});

// GET /billing/v1/subscription — Get Current Subscription
router.get("/subscription", authenticate, requireAuth, async function(req, res) {
  try {
    var companyId = req.query.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "company_id required" });
    }

    // Check access
    var check = await pool.query(
      "SELECT id FROM companies WHERE id = $1 AND (owner_user_id = $2 OR id IN (SELECT company_id FROM company_members WHERE user_id = $2))",
      [companyId, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: "Access denied to this company" });
    }

    var result = await pool.query(
      "SELECT id, plan, status, billing_contact_email, billing_contact_name, created_at, updated_at FROM subscriptions WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
      [companyId]
    );

    var subscription = result.rows[0] || {
      plan: "free",
      status: "inactive",
      created_at: new Date(),
      message: "No active subscription"
    };

    res.json({ subscription: subscription });
  } catch (err) {
    console.error("[billing] get subscription error:", err.message);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

// POST /billing/v1/cancel — Cancel Company Subscription
router.post("/cancel", authenticate, requireAuth, requireCompanyAccess, async function(req, res) {
  try {
    var { company_id } = req.body;

    var result = await pool.query(
      "SELECT id FROM subscriptions WHERE company_id = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1",
      [company_id]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    var subId = result.rows[0].id;

    await pool.query(
      "UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE id = $2",
      ["cancelled", subId]
    );

    logActivity(req.user.id, "billing_subscription_cancelled", {
      company_id: company_id,
      subscription_id: subId
    }, req.headers["x-forwarded-for"] || req.connection.remoteAddress);

    res.json({
      subscription_id: subId,
      status: "cancelled",
      cancelled_at: new Date()
    });
  } catch (err) {
    console.error("[billing] cancel error:", err.message);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

module.exports = router;
