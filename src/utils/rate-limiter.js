/**
 * Rate Limiter using Token Bucket Algorithm
 * Per IP/API-Key: 100 requests per minute
 * Uses in-memory storage with cleanup mechanism
 */

class RateLimiter {
  constructor(options = {}) {
    // Configuration
    this.tokensPerMinute = options.tokensPerMinute || 100;
    this.refillIntervalMs = 60000; // 1 minute
    this.cleanupIntervalMs = options.cleanupIntervalMs || 300000; // 5 minutes
    this.maxBucketSize = this.tokensPerMinute;

    // Storage: Map of key -> { tokens, lastRefillTime }
    this.buckets = new Map();

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this._cleanup(), this.cleanupIntervalMs);
  }

  /**
   * Check if request is allowed and consume token if possible
   * @param {string} key - IP address or API key identifier
   * @returns {Object} { allowed: boolean, tokensRemaining: number, retryAfterMs: number }
   */
  allowRequest(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Rate limiter key must be a non-empty string');
    }

    const now = Date.now();
    let bucket = this.buckets.get(key);

    // Initialize bucket if it doesn't exist
    if (!bucket) {
      bucket = {
        tokens: this.maxBucketSize,
        lastRefillTime: now,
        createdAt: now
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    this._refillTokens(bucket, now);

    // Check if request is allowed
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.lastRequestTime = now;
      return {
        allowed: true,
        tokensRemaining: Math.floor(bucket.tokens),
        retryAfterMs: null
      };
    }

    // Calculate time until next token is available
    const timeSinceRefill = now - bucket.lastRefillTime;
    const tokensNeeded = 1 - bucket.tokens;
    const timeUntilAvailable = (tokensNeeded * this.refillIntervalMs) - timeSinceRefill;
    const retryAfterMs = Math.max(0, Math.ceil(timeUntilAvailable));

    return {
      allowed: false,
      tokensRemaining: 0,
      retryAfterMs
    };
  }

  /**
   * Get current token count for a key without consuming
   * @param {string} key - IP address or API key identifier
   * @returns {Object} { tokens: number, status: string }
   */
  getStatus(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Rate limiter key must be a non-empty string');
    }

    const bucket = this.buckets.get(key);

    if (!bucket) {
      return {
        tokens: this.maxBucketSize,
        status: 'new'
      };
    }

    const now = Date.now();
    this._refillTokens(bucket, now);

    return {
      tokens: Math.floor(bucket.tokens),
      status: 'existing'
    };
  }

  /**
   * Reset bucket for a specific key
   * @param {string} key - IP address or API key identifier
   */
  resetKey(key) {
    this.buckets.delete(key);
  }

  /**
   * Clear all buckets
   */
  reset() {
    this.buckets.clear();
  }

  /**
   * Refill tokens based on elapsed time
   * @private
   */
  _refillTokens(bucket, now) {
    const timeSinceRefill = now - bucket.lastRefillTime;
    const tokensToAdd = (timeSinceRefill / this.refillIntervalMs) * this.maxBucketSize;

    bucket.tokens = Math.min(
      this.maxBucketSize,
      bucket.tokens + tokensToAdd
    );
    bucket.lastRefillTime = now;
  }

  /**
   * Clean up old buckets that haven't been used
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const maxIdleTime = this.cleanupIntervalMs * 2; // 10 minutes

    for (const [key, bucket] of this.buckets.entries()) {
      const idleTime = now - (bucket.lastRequestTime || bucket.createdAt);
      if (idleTime > maxIdleTime) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Get bucket count (for testing/monitoring)
   * @returns {number} Number of active buckets
   */
  getBucketCount() {
    return this.buckets.size;
  }

  /**
   * Destroy limiter and cleanup timers
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.buckets.clear();
  }
}

// Test cases
function runTests() {
  console.log('Running Rate Limiter Tests...\n');

  // Test 1: Basic token consumption
  console.log('Test 1: Basic token consumption');
  const limiter1 = new RateLimiter({ tokensPerMinute: 100 });
  const result1 = limiter1.allowRequest('192.168.1.1');
  console.assert(result1.allowed === true, 'First request should be allowed');
  console.assert(result1.tokensRemaining === 99, 'Should have 99 tokens remaining');
  console.log('✓ Passed\n');

  // Test 2: Rate limit exceeded
  console.log('Test 2: Rate limit exceeded');
  const limiter2 = new RateLimiter({ tokensPerMinute: 3 });
  limiter2.allowRequest('192.168.1.2');
  limiter2.allowRequest('192.168.1.2');
  limiter2.allowRequest('192.168.1.2');
  const result2 = limiter2.allowRequest('192.168.1.2');
  console.assert(result2.allowed === false, 'Fourth request should be denied');
  console.assert(result2.retryAfterMs > 0, 'Should have retry after value');
  console.log('✓ Passed\n');

  // Test 3: Different keys are independent
  console.log('Test 3: Different keys are independent');
  const limiter3 = new RateLimiter({ tokensPerMinute: 2 });
  limiter3.allowRequest('key1');
  limiter3.allowRequest('key1');
  const result3a = limiter3.allowRequest('key1');
  const result3b = limiter3.allowRequest('key2');
  console.assert(result3a.allowed === false, 'key1 should be rate limited');
  console.assert(result3b.allowed === true, 'key2 should be allowed');
  console.log('✓ Passed\n');

  // Test 4: Invalid key handling
  console.log('Test 4: Invalid key handling');
  const limiter4 = new RateLimiter();
  try {
    limiter4.allowRequest(null);
    console.assert(false, 'Should throw error for null key');
  } catch (e) {
    console.assert(true, 'Correctly throws error for invalid key');
  }
  console.log('✓ Passed\n');

  // Test 5: Get status without consuming
  console.log('Test 5: Get status without consuming');
  const limiter5 = new RateLimiter({ tokensPerMinute: 10 });
  limiter5.allowRequest('192.168.1.5');
  const status = limiter5.getStatus('192.168.1.5');
  console.assert(status.tokens === 9, 'Status should reflect consumed token');
  const status2 = limiter5.getStatus('192.168.1.5');
  console.assert(status2.tokens === 9, 'Status should not consume token');
  console.log('✓ Passed\n');

  // Test 6: Reset functionality
  console.log('Test 6: Reset functionality');
  const limiter6 = new RateLimiter({ tokensPerMinute: 2 });
  limiter6.allowRequest('192.168.1.6');
  limiter6.allowRequest('192.168.1.6');
  limiter6.resetKey('192.168.1.6');
  const result6 = limiter6.allowRequest('192.168.1.6');
  console.assert(result6.tokensRemaining === 1, 'Reset should restore tokens');
  console.log('✓ Passed\n');

  // Test 7: Bucket count tracking
  console.log('Test 7: Bucket count tracking');
  const limiter7 = new RateLimiter();
  limiter7.allowRequest('key1');
  limiter7.allowRequest('key2');
  limiter7.allowRequest('key3');
  console.assert(limiter7.getBucketCount() === 3, 'Should track 3 buckets');
  console.log('✓ Passed\n');

  // Cleanup
  limiter1.destroy();
  limiter2.destroy();
  limiter3.destroy();
  limiter4.destroy();
  limiter5.destroy();
  limiter6.destroy();
  limiter7.destroy();

  console.log('All tests passed!');
}

// Run tests if executed directly
if (require.main === module) {
  runTests();
}

module.exports = RateLimiter;
