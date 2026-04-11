"use strict";

const DEFAULT_CAPACITY = 100;
const DEFAULT_REFILL_WINDOW_MS = 60 * 1000;
const DEFAULT_BUCKET_TTL_MS = 2 * DEFAULT_REFILL_WINDOW_MS;

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeIp(ip) {
  if (!ip) return "unknown";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

function createMemoryStore() {
  const map = new Map();
  const expiry = new Map();

  function isExpired(key, now) {
    const expiresAt = expiry.get(key);
    return typeof expiresAt === "number" && expiresAt <= now;
  }

  function purgeIfExpired(key, now) {
    if (!isExpired(key, now)) return false;
    map.delete(key);
    expiry.delete(key);
    return true;
  }

  return {
    get(key) {
      purgeIfExpired(key, Date.now());
      return map.get(key);
    },
    set(key, value, ttlMs) {
      map.set(key, value);
      if (isPositiveFiniteNumber(ttlMs)) {
        expiry.set(key, Date.now() + ttlMs);
      } else {
        expiry.delete(key);
      }
    },
    delete(key) {
      expiry.delete(key);
      map.delete(key);
    },
    entries() {
      this.cleanupExpired();
      return map.entries();
    },
    cleanupExpired(now = Date.now()) {
      for (const key of map.keys()) {
        purgeIfExpired(key, now);
      }
    },
    size() {
      this.cleanupExpired();
      return map.size;
    }
  };
}

class TokenBucketRateLimiter {
  constructor(options = {}) {
    this.capacity = isPositiveFiniteNumber(options.capacity) ? options.capacity : DEFAULT_CAPACITY;
    this.refillWindowMs = isPositiveFiniteNumber(options.refillWindowMs)
      ? options.refillWindowMs
      : DEFAULT_REFILL_WINDOW_MS;
    this.bucketTtlMs = isPositiveFiniteNumber(options.bucketTtlMs)
      ? options.bucketTtlMs
      : DEFAULT_BUCKET_TTL_MS;

    this.refillRatePerMs = this.capacity / this.refillWindowMs;
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.store = options.store || createMemoryStore();

    const cleanupEveryMs = Number.isFinite(options.cleanupEveryMs) ? options.cleanupEveryMs : 0;
    if (cleanupEveryMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupEveryMs);
      if (typeof this.cleanupTimer.unref === "function") this.cleanupTimer.unref();
    }
  }

  resolveKey(input) {
    if (typeof input === "string") {
      return `ip:${normalizeIp(input)}`;
    }

    const req = input || {};
    const headers = req.headers || {};
    const headerApiKey = headers["x-api-key"] || headers["X-API-Key"];
    const explicitApiKey = req.apiKey || req.api_key;
    const apiKey = explicitApiKey || headerApiKey;

    if (apiKey) return `api:${String(apiKey)}`;

    const ip = req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress);
    return `ip:${normalizeIp(ip)}`;
  }

  consume(input, tokens = 1) {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new Error("tokens must be a positive number");
    }

    const now = Number(this.now());
    if (!Number.isFinite(now)) {
      throw new Error("now() must return a finite timestamp");
    }

    const key = this.resolveKey(input);
    const bucket = this._getOrCreateBucket(key, now);
    this._refill(bucket, now);

    if (tokens > this.capacity) {
      return {
        allowed: false,
        key,
        limit: this.capacity,
        remaining: Math.floor(bucket.tokens),
        retryAfterMs: this.refillWindowMs,
        resetMs: this._calculateResetMs(bucket, now)
      };
    }

    if (bucket.tokens < tokens) {
      const deficit = tokens - bucket.tokens;
      const retryAfterMs = Math.ceil(deficit / this.refillRatePerMs);
      return {
        allowed: false,
        key,
        limit: this.capacity,
        remaining: Math.floor(bucket.tokens),
        retryAfterMs,
        resetMs: this._calculateResetMs(bucket, now)
      };
    }

    bucket.tokens -= tokens;
    bucket.expiresAt = now + this.bucketTtlMs;
    this.store.set(key, bucket, this.bucketTtlMs);

    return {
      allowed: true,
      key,
      limit: this.capacity,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
      resetMs: this._calculateResetMs(bucket, now)
    };
  }

  getBucket(input) {
    const key = this.resolveKey(input);
    return this.store.get(key);
  }

  reset(input) {
    const key = this.resolveKey(input);
    this.store.delete(key);
  }

  cleanup() {
    const now = this.now();

    if (typeof this.store.cleanupExpired === "function") {
      this.store.cleanupExpired(now);
    }

    if (typeof this.store.entries !== "function") {
      return;
    }

    for (const [key, bucket] of this.store.entries()) {
      if (bucket.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  stop() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  _getOrCreateBucket(key, now) {
    const existing = this.store.get(key);
    if (existing) return existing;

    const created = {
      tokens: this.capacity,
      lastRefill: now,
      expiresAt: now + this.bucketTtlMs
    };

    this.store.set(key, created, this.bucketTtlMs);
    return created;
  }

  _refill(bucket, now) {
    if (now <= bucket.lastRefill) return;

    const elapsedMs = now - bucket.lastRefill;
    const refillTokens = elapsedMs * this.refillRatePerMs;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refillTokens);
    bucket.lastRefill = now;
  }

  _calculateResetMs(bucket, now) {
    const missing = this.capacity - bucket.tokens;
    const refillMs = Math.ceil(missing / this.refillRatePerMs);
    return now + Math.max(0, refillMs);
  }
}

module.exports = {
  TokenBucketRateLimiter,
  createRateLimiter: (options) => new TokenBucketRateLimiter(options),
  createMemoryStore
};
