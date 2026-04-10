"use strict";

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;
const agentBuckets = new Map();

function getAgentId(req) {
  if (req.agent && req.agent.id != null) return String(req.agent.id);
  if (req.user && req.user.agent_id != null) return String(req.user.agent_id);
  if (req.user && req.user.agentId != null) return String(req.user.agentId);
  if (req.params && req.params.agentId != null) return String(req.params.agentId);
  if (req.body && req.body.agentId != null) return String(req.body.agentId);
  if (req.query && req.query.agentId != null) return String(req.query.agentId);

  const headerAgentId = req.headers && (
    req.headers["x-agent-id"] ||
    req.headers["x-blun-agent-id"] ||
    req.headers["agent-id"]
  );
  if (headerAgentId != null && headerAgentId !== "") return String(headerAgentId);

  return null;
}

function prune(now) {
  for (const [agentId, state] of agentBuckets.entries()) {
    if (now >= state.resetAt) {
      agentBuckets.delete(agentId);
    }
  }
}

function rateLimiter(req, res, next) {
  const now = Date.now();

  if (Math.random() < 0.05) {
    prune(now);
  }

  const agentId = getAgentId(req);
  if (!agentId) {
    return next();
  }

  let state = agentBuckets.get(agentId);
  if (!state || now >= state.resetAt) {
    state = { count: 0, resetAt: now + WINDOW_MS };
    agentBuckets.set(agentId, state);
  }

  if (state.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded for this agent.",
      retryAfter: retryAfterSeconds,
    });
  }

  state.count += 1;

  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, MAX_REQUESTS - state.count)));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(state.resetAt / 1000)));

  return next();
}

module.exports = rateLimiter;
