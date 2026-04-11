"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { TokenBucketRateLimiter } = require("../utils/rate-limiter");

test("allows up to 100 requests in a minute and blocks request 101", () => {
  let now = 1_000_000;
  const limiter = new TokenBucketRateLimiter({ capacity: 100, refillWindowMs: 60_000, now: () => now });

  for (let i = 0; i < 100; i += 1) {
    const result = limiter.consume({ ip: "10.0.0.1" });
    assert.strictEqual(result.allowed, true);
  }

  const blocked = limiter.consume({ ip: "10.0.0.1" });
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs > 0);
});

test("refills tokens over time for edge timing boundaries", () => {
  let now = 2_000_000;
  const limiter = new TokenBucketRateLimiter({ capacity: 100, refillWindowMs: 60_000, now: () => now });

  for (let i = 0; i < 100; i += 1) limiter.consume({ ip: "10.0.0.2" });
  assert.strictEqual(limiter.consume({ ip: "10.0.0.2" }).allowed, false);

  now += 30_000;
  for (let i = 0; i < 50; i += 1) {
    const allowed = limiter.consume({ ip: "10.0.0.2" }).allowed;
    assert.strictEqual(allowed, true);
  }

  assert.strictEqual(limiter.consume({ ip: "10.0.0.2" }).allowed, false);

  now += 30_000;
  const afterFullMinute = limiter.consume({ ip: "10.0.0.2" });
  assert.strictEqual(afterFullMinute.allowed, true);
});

test("uses API key as primary identifier over IP", () => {
  let now = 3_000_000;
  const limiter = new TokenBucketRateLimiter({ capacity: 2, refillWindowMs: 60_000, now: () => now });

  const reqA = { ip: "10.0.0.3", headers: { "x-api-key": "tenant-1" } };
  const reqB = { ip: "10.0.0.4", headers: { "x-api-key": "tenant-1" } };

  assert.strictEqual(limiter.consume(reqA).allowed, true);
  assert.strictEqual(limiter.consume(reqB).allowed, true);

  const blocked = limiter.consume(reqA);
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.key, "api:tenant-1");
});

test("keeps independent buckets for different IPs without API key", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1, refillWindowMs: 60_000, now: () => 4_000_000 });

  assert.strictEqual(limiter.consume({ ip: "10.0.0.5" }).allowed, true);
  assert.strictEqual(limiter.consume({ ip: "10.0.0.6" }).allowed, true);
  assert.strictEqual(limiter.consume({ ip: "10.0.0.5" }).allowed, false);
  assert.strictEqual(limiter.consume({ ip: "10.0.0.6" }).allowed, false);
});

test("normalizes localhost and IPv4-mapped addresses consistently", () => {
  const limiter = new TokenBucketRateLimiter({ capacity: 1, refillWindowMs: 60_000, now: () => 5_000_000 });

  assert.strictEqual(limiter.consume({ ip: "::ffff:127.0.0.1" }).allowed, true);
  assert.strictEqual(limiter.consume({ ip: "127.0.0.1" }).allowed, false);
});

test("cleanup removes expired buckets", () => {
  let now = 6_000_000;
  const limiter = new TokenBucketRateLimiter({
    capacity: 100,
    refillWindowMs: 60_000,
    bucketTtlMs: 10_000,
    now: () => now
  });

  limiter.consume({ ip: "10.0.0.7" });
  assert.ok(limiter.getBucket({ ip: "10.0.0.7" }));

  now += 10_001;
  limiter.cleanup();

  assert.strictEqual(limiter.getBucket({ ip: "10.0.0.7" }), undefined);
});

test("throws for invalid token amount", () => {
  const limiter = new TokenBucketRateLimiter({ now: () => 7_000_000 });

  assert.throws(() => limiter.consume({ ip: "10.0.0.8" }, 0), /positive number/);
  assert.throws(() => limiter.consume({ ip: "10.0.0.8" }, -2), /positive number/);
});
