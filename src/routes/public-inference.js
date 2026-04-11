/**
 * Public Inference API — BLUN as Provider
 *
 * Endpoints:
 *   POST /                   — Simple inference (prompt-based)
 *   POST /chat/completions   — OpenAI-compatible chat completions
 *   GET  /models             — List available models
 *
 * Auth: X-BLUN-Key header (user api_key from DB)
 */

const express = require("express");
const { pool } = require("../db");
const router = express.Router();

// ---------------------------------------------------------------------------
// API Key Auth Middleware
// ---------------------------------------------------------------------------

async function apiKeyAuth(req, res, next) {
  var apiKey = req.headers["x-blun-key"] || req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({
      error: { message: "Missing API key. Set X-BLUN-Key header.", type: "auth_error" }
    });
  }

  try {
    var result = await pool.query(
      "SELECT id, email, name, role, plan FROM users WHERE api_key = $1 LIMIT 1",
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: { message: "Invalid API key.", type: "auth_error" }
      });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error("[public-inference] Auth error:", err.message);
    return res.status(500).json({
      error: { message: "Authentication service unavailable.", type: "server_error" }
    });
  }
}

router.use(apiKeyAuth);

// ---------------------------------------------------------------------------
// Rate limiting (in-memory, per user)
// ---------------------------------------------------------------------------

var rateLimits = {};
var RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
var RATE_LIMIT_MAX = 30; // requests per window

function checkRateLimit(userId) {
  var now = Date.now();
  var entry = rateLimits[userId];

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimits[userId] = { windowStart: now, count: 1 };
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Cleanup stale entries every 5 minutes
setInterval(function () {
  var now = Date.now();
  var keys = Object.keys(rateLimits);
  for (var i = 0; i < keys.length; i++) {
    if (now - rateLimits[keys[i]].windowStart > RATE_LIMIT_WINDOW * 2) {
      delete rateLimits[keys[i]];
    }
  }
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Usage logging
// ---------------------------------------------------------------------------

async function logUsage(userId, model, provider, tokensIn, tokensOut, latencyMs) {
  try {
    await pool.query(
      "INSERT INTO inference_log (user_id, model, provider, tokens_in, tokens_out, latency_ms, created_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, NOW())",
      [userId, model, provider, tokensIn, tokensOut, latencyMs]
    );
  } catch (err) {
    // Non-critical — table may not exist yet, just log
    console.error("[public-inference] Usage log failed:", err.message);
  }
}

// ---------------------------------------------------------------------------
// POST / — Simple inference
// ---------------------------------------------------------------------------

router.post("/", async function (req, res) {
  var prompt = req.body.prompt;
  var model = req.body.model;
  var maxTokens = req.body.max_tokens || req.body.maxTokens || 2048;
  var temperature = req.body.temperature;
  var systemPrompt = req.body.system || req.body.systemPrompt;
  var messages = req.body.messages;

  if (!prompt && (!messages || messages.length === 0)) {
    return res.status(400).json({
      error: { message: "Either 'prompt' or 'messages' is required.", type: "invalid_request" }
    });
  }

  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({
      error: { message: "Rate limit exceeded. Max " + RATE_LIMIT_MAX + " requests per minute.", type: "rate_limit" }
    });
  }

  try {
    var ai = require("../ai/ai-provider");

    var queryOpts = {
      prompt: prompt,
      messages: messages,
      systemPrompt: systemPrompt,
      model: model,
      maxTokens: maxTokens,
      taskType: req.body.taskType || "chat",
      priority: req.body.priority || "balanced"
    };

    if (temperature != null) queryOpts.temperature = temperature;

    var result = await ai.query(queryOpts);

    logUsage(
      req.user.id,
      result._model || model || "default",
      result._provider || "unknown",
      result.tokensIn || 0,
      result.tokensOut || 0,
      result._latencyMs || 0
    );

    res.json({
      id: "inf-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      object: "inference.completion",
      created: Math.floor(Date.now() / 1000),
      model: result._model || model || "default",
      provider: result._provider || "blun",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text || "" },
          finish_reason: result.stopReason || "stop"
        }
      ],
      usage: {
        prompt_tokens: result.tokensIn || 0,
        completion_tokens: result.tokensOut || 0,
        total_tokens: (result.tokensIn || 0) + (result.tokensOut || 0)
      },
      latency_ms: result._latencyMs || 0
    });
  } catch (err) {
    console.error("[public-inference] Query error:", err.message);
    res.status(500).json({
      error: { message: err.message, type: "inference_error" }
    });
  }
});

// ---------------------------------------------------------------------------
// POST /chat/completions — OpenAI-compatible
// ---------------------------------------------------------------------------

router.post("/chat/completions", async function (req, res) {
  var messages = req.body.messages;
  var model = req.body.model;
  var maxTokens = req.body.max_tokens || 2048;
  var temperature = req.body.temperature;
  var stream = req.body.stream || false;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: "'messages' array is required.", type: "invalid_request" }
    });
  }

  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({
      error: { message: "Rate limit exceeded. Max " + RATE_LIMIT_MAX + " requests per minute.", type: "rate_limit" }
    });
  }

  // Extract system prompt from messages if present
  var systemPrompt = null;
  var chatMessages = [];
  for (var i = 0; i < messages.length; i++) {
    if (messages[i].role === "system") {
      systemPrompt = messages[i].content;
    } else {
      chatMessages.push({ role: messages[i].role, content: messages[i].content });
    }
  }

  if (stream) {
    return handleStreamingCompletion(req, res, chatMessages, systemPrompt, model, maxTokens, temperature);
  }

  try {
    var ai = require("../ai/ai-provider");

    var queryOpts = {
      messages: chatMessages,
      systemPrompt: systemPrompt,
      model: model,
      maxTokens: maxTokens,
      taskType: "chat",
      priority: "balanced"
    };

    if (temperature != null) queryOpts.temperature = temperature;

    var result = await ai.query(queryOpts);

    logUsage(
      req.user.id,
      result._model || model || "default",
      result._provider || "unknown",
      result.tokensIn || 0,
      result.tokensOut || 0,
      result._latencyMs || 0
    );

    // OpenAI-compatible response format
    res.json({
      id: "chatcmpl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: result._model || model || "default",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text || "" },
          finish_reason: result.stopReason || "stop"
        }
      ],
      usage: {
        prompt_tokens: result.tokensIn || 0,
        completion_tokens: result.tokensOut || 0,
        total_tokens: (result.tokensIn || 0) + (result.tokensOut || 0)
      }
    });
  } catch (err) {
    console.error("[public-inference] Chat completions error:", err.message);
    res.status(500).json({
      error: { message: err.message, type: "inference_error" }
    });
  }
});

// ---------------------------------------------------------------------------
// Streaming (SSE) handler for chat/completions
// ---------------------------------------------------------------------------

async function handleStreamingCompletion(req, res, messages, systemPrompt, model, maxTokens, temperature) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  var completionId = "chatcmpl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  var created = Math.floor(Date.now() / 1000);

  try {
    var ai = require("../ai/ai-provider");

    var queryOpts = {
      messages: messages,
      systemPrompt: systemPrompt,
      model: model,
      maxTokens: maxTokens,
      taskType: "chat",
      priority: "balanced"
    };

    if (temperature != null) queryOpts.temperature = temperature;

    var result = await ai.query(queryOpts);

    // Simulate streaming by chunking the response text
    var text = result.text || "";
    var chunkSize = 20;

    for (var i = 0; i < text.length; i += chunkSize) {
      var chunk = text.slice(i, i + chunkSize);
      var data = {
        id: completionId,
        object: "chat.completion.chunk",
        created: created,
        model: result._model || model || "default",
        choices: [
          {
            index: 0,
            delta: { content: chunk },
            finish_reason: null
          }
        ]
      };
      res.write("data: " + JSON.stringify(data) + "\n\n");
    }

    // Final chunk with finish_reason
    res.write("data: " + JSON.stringify({
      id: completionId,
      object: "chat.completion.chunk",
      created: created,
      model: result._model || model || "default",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    }) + "\n\n");

    res.write("data: [DONE]\n\n");

    logUsage(
      req.user.id,
      result._model || model || "default",
      result._provider || "unknown",
      result.tokensIn || 0,
      result.tokensOut || 0,
      result._latencyMs || 0
    );

    res.end();
  } catch (err) {
    console.error("[public-inference] Stream error:", err.message);
    res.write("data: " + JSON.stringify({
      error: { message: err.message, type: "inference_error" }
    }) + "\n\n");
    res.end();
  }
}

// ---------------------------------------------------------------------------
// GET /models — Available models
// ---------------------------------------------------------------------------

router.get("/models", async function (req, res) {
  try {
    var ai = require("../ai/ai-provider");
    var registry = ai.MODEL_REGISTRY || ai.getModelRegistry && ai.getModelRegistry() || {};

    var models = Object.keys(registry).map(function (id) {
      var m = registry[id];
      return {
        id: id,
        object: "model",
        provider: m.provider || "unknown",
        capabilities: m.capabilities || [],
        context_window: m.contextWindow || m.context || null
      };
    });

    res.json({
      object: "list",
      data: models
    });
  } catch (err) {
    console.error("[public-inference] Models list error:", err.message);
    res.status(500).json({
      error: { message: "Could not retrieve model list.", type: "server_error" }
    });
  }
});

module.exports = router;
