// BLUN - Webhooks API Route

var express = require("express");
var crypto = require("crypto");
var router = express.Router();
var db = require("../../db");

var DEFAULT_EVENT_TYPE = "task.completed";
var TABLE_NAME = "webhook_subscriptions";
var IN_MEMORY_SUBSCRIPTIONS = [];
var tableReady = false;
var tableUnsupported = false;

function generateId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

function generateSecret() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeEventType(value) {
  if (!value || typeof value !== "string") {
    return DEFAULT_EVENT_TYPE;
  }

  var normalized = value.trim().toLowerCase();
  if (normalized === "task-completion" || normalized === "task_completion") {
    return DEFAULT_EVENT_TYPE;
  }

  return normalized;
}

function isAllowedEventType(value) {
  return value === DEFAULT_EVENT_TYPE;
}

function pickTargetUrl(body) {
  if (!body || typeof body !== "object") {
    return "";
  }

  return body.url || body.target_url || body.webhook_url || "";
}

function isValidHttpUrl(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  try {
    var parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_err) {
    return false;
  }
}

function buildPublicSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    target_url: row.target_url,
    event_type: row.event_type,
    enabled: !!row.enabled,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_test_at: row.last_test_at || null,
    last_test_status: row.last_test_status || null
  };
}

function buildCreatedSubscription(row) {
  var subscription = buildPublicSubscription(row);
  if (!subscription) {
    return null;
  }

  subscription.secret = row.secret;
  return subscription;
}

async function ensureTable() {
  if (tableReady) {
    return true;
  }

  if (tableUnsupported) {
    return false;
  }

  try {
    await db.query([
      "CREATE TABLE IF NOT EXISTS " + TABLE_NAME + " (",
      "  id TEXT PRIMARY KEY,",
      "  target_url TEXT NOT NULL,",
      "  event_type TEXT NOT NULL,",
      "  secret TEXT NOT NULL,",
      "  enabled BOOLEAN NOT NULL DEFAULT TRUE,",
      "  last_test_at TIMESTAMPTZ,",
      "  last_test_status TEXT,",
      "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
      "  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      ")"
    ].join(" "));

    await db.query(
      "CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_type ON " + TABLE_NAME + " (event_type)"
    );

    tableReady = true;
    return true;
  } catch (error) {
    tableUnsupported = true;
    console.error(
      "[webhooks] table setup failed, using in-memory fallback:",
      error && error.message ? error.message : error
    );
    return false;
  }
}

async function insertSubscription(subscription) {
  var hasTable = await ensureTable();
  if (!hasTable) {
    IN_MEMORY_SUBSCRIPTIONS.unshift(subscription);
    return subscription;
  }

  var rows = await db.query(
    [
      "INSERT INTO " + TABLE_NAME + " (id, target_url, event_type, secret, enabled)",
      "VALUES ($1, $2, $3, $4, $5)",
      "RETURNING id, target_url, event_type, secret, enabled, created_at, updated_at, last_test_at, last_test_status"
    ].join(" "),
    [
      subscription.id,
      subscription.target_url,
      subscription.event_type,
      subscription.secret,
      subscription.enabled
    ]
  );

  return rows[0];
}

async function listSubscriptions() {
  var hasTable = await ensureTable();
  if (!hasTable) {
    return IN_MEMORY_SUBSCRIPTIONS.slice();
  }

  return await db.query(
    [
      "SELECT id, target_url, event_type, secret, enabled, created_at, updated_at, last_test_at, last_test_status",
      "FROM " + TABLE_NAME,
      "ORDER BY created_at DESC"
    ].join(" ")
  );
}

async function findSubscriptionById(subscriptionId) {
  if (!subscriptionId) {
    return null;
  }

  var hasTable = await ensureTable();
  if (!hasTable) {
    for (var i = 0; i < IN_MEMORY_SUBSCRIPTIONS.length; i += 1) {
      if (IN_MEMORY_SUBSCRIPTIONS[i].id === subscriptionId) {
        return IN_MEMORY_SUBSCRIPTIONS[i];
      }
    }
    return null;
  }

  var rows = await db.query(
    [
      "SELECT id, target_url, event_type, secret, enabled, created_at, updated_at, last_test_at, last_test_status",
      "FROM " + TABLE_NAME,
      "WHERE id = $1",
      "LIMIT 1"
    ].join(" "),
    [subscriptionId]
  );

  return rows[0] || null;
}

async function updateTestStatus(subscription, statusText) {
  if (!subscription || !subscription.id) {
    return;
  }

  var hasTable = await ensureTable();
  if (!hasTable) {
    for (var i = 0; i < IN_MEMORY_SUBSCRIPTIONS.length; i += 1) {
      if (IN_MEMORY_SUBSCRIPTIONS[i].id === subscription.id) {
        IN_MEMORY_SUBSCRIPTIONS[i].last_test_at = new Date().toISOString();
        IN_MEMORY_SUBSCRIPTIONS[i].last_test_status = statusText;
        IN_MEMORY_SUBSCRIPTIONS[i].updated_at = new Date().toISOString();
        break;
      }
    }
    return;
  }

  await db.query(
    [
      "UPDATE " + TABLE_NAME,
      "SET last_test_at = NOW(), last_test_status = $1, updated_at = NOW()",
      "WHERE id = $2"
    ].join(" "),
    [statusText, subscription.id]
  );
}

function createSignature(secret, rawPayload) {
  if (!secret) {
    return "";
  }

  return crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");
}

router.post("/webhooks/subscribe", async function(req, res) {
  var targetUrl = pickTargetUrl(req.body);
  if (!isValidHttpUrl(targetUrl)) {
    return res.status(400).json({ error: "Valid target URL is required (http/https)." });
  }

  var eventType = normalizeEventType(req.body && (req.body.event_type || req.body.event));
  if (!isAllowedEventType(eventType)) {
    return res.status(400).json({
      error: "Unsupported event type.",
      allowed: [DEFAULT_EVENT_TYPE]
    });
  }

  var subscription = {
    id: generateId(),
    target_url: targetUrl,
    event_type: eventType,
    secret: req.body && typeof req.body.secret === "string" && req.body.secret.trim() ? req.body.secret.trim() : generateSecret(),
    enabled: !(req.body && req.body.enabled === false),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_test_at: null,
    last_test_status: null
  };

  try {
    var created = await insertSubscription(subscription);
    return res.status(201).json({
      ok: true,
      subscription: buildCreatedSubscription(created)
    });
  } catch (error) {
    console.error(
      "POST /webhooks/subscribe failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to create webhook subscription." });
  }
});

router.post("/webhooks/test", async function(req, res) {
  if (typeof fetch !== "function") {
    return res.status(500).json({ error: "Fetch API not available in current Node runtime." });
  }

  var input = req.body || {};
  var subscription = null;

  try {
    if (input.subscription_id || input.id) {
      subscription = await findSubscriptionById(input.subscription_id || input.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found." });
      }
    }
  } catch (error) {
    console.error(
      "POST /webhooks/test lookup failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to load webhook subscription." });
  }

  if (!subscription) {
    var directUrl = pickTargetUrl(input);
    if (!isValidHttpUrl(directUrl)) {
      return res.status(400).json({ error: "Provide subscription_id or valid target URL." });
    }

    subscription = {
      id: null,
      target_url: directUrl,
      event_type: DEFAULT_EVENT_TYPE,
      secret: input.secret || "",
      enabled: true
    };
  }

  if (!subscription.enabled) {
    return res.status(400).json({ error: "Subscription is disabled." });
  }

  var payload = {
    event: DEFAULT_EVENT_TYPE,
    test: true,
    timestamp: new Date().toISOString(),
    data: {
      task_id: input.task_id || "test-task",
      agent_id: input.agent_id || "test-agent",
      status: "completed",
      summary: input.summary || "This is a test task completion event"
    }
  };

  var rawPayload = JSON.stringify(payload);
  var signature = createSignature(subscription.secret, rawPayload);

  var controller = new AbortController();
  var timeout = setTimeout(function() {
    controller.abort();
  }, 8000);

  try {
    var response = await fetch(subscription.target_url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-blun-event": DEFAULT_EVENT_TYPE,
        "x-blun-test": "true",
        "x-blun-signature": signature
      },
      body: rawPayload,
      signal: controller.signal
    });

    clearTimeout(timeout);

    var responseText = "";
    try {
      responseText = await response.text();
    } catch (_err) {
      responseText = "";
    }

    var statusText = response.ok ? "success" : "http_" + String(response.status || 0);
    if (subscription.id) {
      await updateTestStatus(subscription, statusText);
    }

    return res.status(response.ok ? 200 : 502).json({
      ok: response.ok,
      delivered_to: subscription.target_url,
      status: response.status,
      status_text: response.statusText || "",
      response_preview: responseText ? responseText.slice(0, 500) : ""
    });
  } catch (error) {
    clearTimeout(timeout);

    if (subscription.id) {
      await updateTestStatus(subscription, "failed");
    }

    console.error(
      "POST /webhooks/test delivery failed:",
      error && error.message ? error.message : error
    );

    return res.status(502).json({
      ok: false,
      delivered_to: subscription.target_url,
      error: error && error.message ? error.message : "Webhook test failed"
    });
  }
});

router.get("/webhooks", async function(req, res) {
  try {
    var rows = await listSubscriptions();
    var subscriptions = Array.isArray(rows) ? rows.map(buildPublicSubscription) : [];

    return res.json({
      count: subscriptions.length,
      subscriptions: subscriptions
    });
  } catch (error) {
    console.error(
      "GET /webhooks failed:",
      error && error.message ? error.message : error
    );
    return res.status(500).json({ error: "Failed to load webhook subscriptions." });
  }
});

module.exports = router;
