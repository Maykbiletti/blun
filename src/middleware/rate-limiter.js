const { Redis } = require('@upstash/redis');

let redis;
try {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
} catch (e) {
  console.warn('Redis connection failed, falling back to in-memory rate limiter.');
  redis = null;
}

const inMemoryStore = {};

const plans = {
  free: {
    limit: 60,
    window: 60, // 60 seconds
  },
  pro: {
    limit: 300,
    window: 60, // 60 seconds
  },
};

const rateLimiter = async (req, res, next) => {
  const userId = req.user ? req.user.id : req.ip; // Fallback to IP if no user
  if (!userId) {
    return res.status(401).send('Unauthorized');
  }

  const userPlan = (req.user && req.user.plan && plans[req.user.plan]) ? req.user.plan : 'free';
  const { limit, window } = plans[userPlan];
  const key = `rate-limit:${userId}`;
  const now = Math.floor(Date.now() / 1000);

  let requests = [];
  let remaining = limit;

  try {
    if (redis) {
      const transaction = redis.multi();
      transaction.lrange(key, 0, -1);
      transaction.expire(key, window);
      const [history, _] = await transaction.exec();
      
      requests = history.map(Number);

    } else {
      requests = inMemoryStore[key] || [];
    }

    // Filter out requests that are outside the current window
    const validRequests = requests.filter(timestamp => timestamp > now - window);

    if (validRequests.length >= limit) {
        const resetTime = (validRequests.length > 0 ? validRequests[0] : now) + window;
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('Retry-After', resetTime - now);
        return res.status(429).send('Too Many Requests');
    }
    
    remaining = limit - validRequests.length -1;
    
    // Add current request timestamp
    validRequests.push(now);

    if (redis) {
      const transaction = redis.multi();
      transaction.del(key);
      transaction.rpush(key, ...validRequests);
      transaction.expire(key, window);
      await transaction.exec();
    } else {
      inMemoryStore[key] = validRequests;
      // Clean up old entries from in-memory store periodically
      setTimeout(() => {
        const cleanupNow = Math.floor(Date.now() / 1000);
        if(inMemoryStore[key]){
             inMemoryStore[key] = inMemoryStore[key].filter(timestamp => timestamp > cleanupNow - window);
             if(inMemoryStore[key].length === 0){
                 delete inMemoryStore[key];
             }
        }
      }, window * 1000 + 100);
    }

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);

    return next();

  } catch (error) {
    console.error('Rate limiter error:', error);
    // If there's an error (e.g., Redis down), fail open and let the request through.
    return next();
  }
};

module.exports = rateLimiter;
