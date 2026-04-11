const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const subscriptions = [];

function nowIso() {
  return new Date().toISOString();
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function normalizeEvents(events) {
  if (!events) {
    return ['task.completed'];
  }

  if (!Array.isArray(events)) {
    return null;
  }

  const normalized = events
    .map((eventName) => (typeof eventName === 'string' ? eventName.trim() : ''))
    .filter(Boolean);

  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

function buildSignature(payloadString, secret) {
  if (!secret) {
    return null;
  }

  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

async function deliverWebhook(subscription, payload) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available in this Node runtime');
  }

  const body = JSON.stringify(payload);
  const signature = buildSignature(body, subscription.secret);

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'blun-webhooks/1.0',
    'X-BLUN-Webhook-Event': payload.type,
    'X-BLUN-Webhook-Id': payload.id,
    'X-BLUN-Webhook-Timestamp': payload.created_at
  };

  if (signature) {
    headers['X-BLUN-Signature'] = `sha256=${signature}`;
  }

  const response = await fetch(subscription.url, {
    method: 'POST',
    headers,
    body
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body: text.slice(0, 1000)
  };
}

router.post('/subscribe', async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const secret = typeof req.body?.secret === 'string' ? req.body.secret : null;
    const events = normalizeEvents(req.body?.events);

    if (!isValidHttpUrl(url)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook url. Expected http:// or https:// URL.'
      });
    }

    if (!events) {
      return res.status(400).json({
        success: false,
        error: 'Invalid events. Expected a non-empty string array.'
      });
    }

    const existing = subscriptions.find((item) => item.url === url);

    if (existing) {
      existing.events = events;
      existing.secret = secret;
      existing.active = true;
      existing.updated_at = nowIso();

      return res.status(200).json({
        success: true,
        updated: true,
        data: existing
      });
    }

    const record = {
      id: crypto.randomUUID(),
      url,
      events,
      secret,
      active: true,
      created_at: nowIso(),
      updated_at: nowIso()
    };

    subscriptions.push(record);

    return res.status(201).json({
      success: true,
      data: record
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to subscribe webhook',
      message: error.message
    });
  }
});

router.post('/test', async (req, res) => {
  try {
    const subscriptionId = typeof req.body?.subscription_id === 'string'
      ? req.body.subscription_id
      : null;

    let targets = subscriptions.filter((item) => item.active);

    if (subscriptionId) {
      targets = targets.filter((item) => item.id === subscriptionId);
    }

    if (targets.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No matching active webhook subscription found.'
      });
    }

    const eventType = typeof req.body?.event_type === 'string' && req.body.event_type.trim()
      ? req.body.event_type.trim()
      : 'task.completed';

    const payload = {
      id: crypto.randomUUID(),
      type: eventType,
      created_at: nowIso(),
      data: {
        task_id: req.body?.task_id || 'test-task-001',
        task_title: req.body?.task_title || 'Webhook test task',
        status: 'completed',
        completed_at: nowIso(),
        source: 'webhooks.test'
      }
    };

    const results = await Promise.all(
      targets.map(async (subscription) => {
        try {
          const response = await deliverWebhook(subscription, payload);

          return {
            subscription_id: subscription.id,
            url: subscription.url,
            delivered: response.ok,
            status: response.status,
            status_text: response.statusText,
            response_body: response.body
          };
        } catch (err) {
          return {
            subscription_id: subscription.id,
            url: subscription.url,
            delivered: false,
            error: err.message
          };
        }
      })
    );

    return res.status(200).json({
      success: true,
      event: payload,
      results
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to send webhook test event',
      message: error.message
    });
  }
});

router.get('/', async (_req, res) => {
  return res.status(200).json({
    success: true,
    count: subscriptions.length,
    data: subscriptions
  });
});

module.exports = router;
