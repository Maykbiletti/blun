/**
 * Rate Limiter using Token Bucket algorithm
 * Per IP/API-Key: 100 requests per minute
 */

class RateLimiter {
  /**
   * @param {number} maxTokens - Maximum tokens in bucket (default 100)
   * @param {number} refillRate - Tokens per minute (default 100)
   * @param {number} windowMs - Time window in milliseconds (default 60000 = 1 minute)
   */
  constructor(maxTokens = 100, refillRate = 100, windowMs = 60000) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  /**
   * Get or create bucket for identifier (IP or API key)
   */
  _getBucket(identifier) {
    if (!this.buckets.has(identifier)) {
      this.buckets.set(identifier, {
        tokens: this.maxTokens,
        lastRefill: Date.now()
      });
    }
    return this.buckets.get(identifier);
  }

  /**
   * Refill tokens based on elapsed time
   */
  _refillTokens(bucket) {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = (timePassed / this.windowMs) * this.refillRate;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Check if request is allowed for identifier
   * @param {string} identifier - IP address or API key
   * @returns {boolean} - true if allowed, false if rate limited
   */
  isAllowed(identifier) {
    const bucket = this._getBucket(identifier);
    this._refillTokens(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get remaining tokens for identifier
   */
  getRemainingTokens(identifier) {
    const bucket = this._getBucket(identifier);
    this._refillTokens(bucket);
    return Math.floor(bucket.tokens);
  }

  /**
   * Reset tokens for specific identifier
   */
  reset(identifier) {
    if (this.buckets.has(identifier)) {
      this.buckets.delete(identifier);
    }
  }

  /**
   * Clear all buckets
   */
  resetAll() {
    this.buckets.clear();
  }

  /**
   * Get bucket stats (for monitoring/debugging)
   */
  getStats(identifier) {
    const bucket = this._getBucket(identifier);
    this._refillTokens(bucket);
    return {
      identifier,
      tokens: Math.floor(bucket.tokens),
      maxTokens: this.maxTokens,
      lastRefill: bucket.lastRefill
    };
  }
}

// TESTS - Edge cases
if (require.main === module) {
  const limiter = new RateLimiter(100, 100, 60000);

  // Test 1: Basic allow
  console.assert(limiter.isAllowed('192.168.1.1'), 'Test 1 Failed: Should allow first request');

  // Test 2: Multiple requests until limit
  limiter.reset('192.168.1.1');
  let allowed = 0;
  for (let i = 0; i < 100; i++) {
    if (limiter.isAllowed('192.168.1.1')) allowed++;
  }
  console.assert(allowed === 100, `Test 2 Failed: Should allow 100 requests, got ${allowed}`);

  // Test 3: Rate limited after 100
  console.assert(!limiter.isAllowed('192.168.1.1'), 'Test 3 Failed: Should deny 101st request');

  // Test 4: Different identifiers are isolated
  limiter.reset('192.168.1.1');
  console.assert(limiter.isAllowed('10.0.0.1'), 'Test 4a Failed: Different IP should have independent limit');
  console.assert(limiter.isAllowed('192.168.1.1'), 'Test 4b Failed: Reset should restore tokens');

  // Test 5: Remaining tokens tracking
  limiter.reset('192.168.1.2');
  console.assert(limiter.getRemainingTokens('192.168.1.2') === 100, 'Test 5a Failed: Should have 100 tokens initially');
  limiter.isAllowed('192.168.1.2');
  console.assert(limiter.getRemainingTokens('192.168.1.2') === 99, 'Test 5b Failed: Should decrement correctly');

  // Test 6: Token refill simulation
  limiter.reset('192.168.1.3');
  for (let i = 0; i < 50; i++) limiter.isAllowed('192.168.1.3');
  const remaining = limiter.getRemainingTokens('192.168.1.3');
  console.assert(remaining === 50, `Test 6 Failed: Should have 50 remaining, got ${remaining}`);

  // Test 7: Stats method accuracy
  const stats = limiter.getStats('192.168.1.3');
  console.assert(stats.identifier === '192.168.1.3', 'Test 7a Failed: Stats identifier mismatch');
  console.assert(stats.tokens === 50, 'Test 7b Failed: Stats token count mismatch');
  console.assert(stats.maxTokens === 100, 'Test 7c Failed: Stats maxTokens mismatch');

  // Test 8: Reset all functionality
  limiter.resetAll();
  console.assert(limiter.getRemainingTokens('192.168.1.1') === 100, 'Test 8 Failed: resetAll should clear buckets');
  console.assert(limiter.getRemainingTokens('10.0.0.1') === 100, 'Test 8 Failed: resetAll incomplete');

  // Test 9: API key vs IP isolation
  console.assert(limiter.isAllowed('api-key-abc'), 'Test 9a Failed: Should allow API key');
  console.assert(limiter.isAllowed('192.168.1.100'), 'Test 9b Failed: Should allow different IP independently');

  // Test 10: Edge case - zero requests
  limiter.reset('edge-case');
  for (let i = 0; i < 101; i++) limiter.isAllowed('edge-case');
  console.assert(!limiter.isAllowed('edge-case'), 'Test 10 Failed: Should limit exactly at 100');

  console.log('✓ All tests passed');
}

module.exports = RateLimiter;
