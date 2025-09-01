const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const monitor = require('../services/rate-limit-monitor');

// Shared configuration and handlers
const createSharedHandler = () => {
  return (req, res) => {
    monitor.logRequest(req, true);
    
    const userInfo = req.session?.userId ? `user ${req.session.userId}` : `IP ${req.ip}`;
    const endpoint = req.originalUrl;
    const maxRequests = res.getHeaders()['ratelimit-limit'] || 'unknown';
    console.warn(`[RATE_LIMIT] ${userInfo} hit rate limit on ${endpoint} - ${maxRequests} requests per window`);
    
    const isApiRequest = req.originalUrl.startsWith('/api/') || 
                        req.originalUrl.startsWith('/follow') || 
                        req.originalUrl.startsWith('/unfollow') ||
                        req.originalUrl.startsWith('/load-more');
    
    const retryAfter = res.getHeaders()['ratelimit-reset'] ? 
                      Math.ceil((res.getHeaders()['ratelimit-reset'] - Date.now()) / 1000) :
                      60; // fallback
    
    if (isApiRequest) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter,
        rateLimitInfo: {
          limit: res.getHeaders()['ratelimit-limit'],
          remaining: res.getHeaders()['ratelimit-remaining'] || 0,
          resetTime: new Date(res.getHeaders()['ratelimit-reset'] || Date.now() + 60000)
        }
      });
    }
    
    return res.status(429).render('error', {
      title: 'Rate Limited',
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
      retryAfter
    });
  };
};

const skipCronJobs = (req) => {
  return req.originalUrl.startsWith('/jobs/') && 
         req.headers['x-cron-secret'] === process.env.CRON_SECRET;
};

const createRateLimiter = (config) => {
  const limiter = rateLimit({
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    handler: createSharedHandler(),
    skip: skipCronJobs,
    ...config
  });
  
  // Wrap with monitoring (only logs once per request)
  return (req, res, next) => {
    monitor.logRequest(req, false);
    limiter(req, res, next);
  };
};

// Specific rate limiters
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  skipSuccessfulRequests: true
});

const userActionLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: (req) => req.session?.userId ? 100 : 20,
  message: 'Too many requests. Please try again later.',
  keyGenerator: (req) => {
    if (req.session?.userId) {
      return `user_${req.session.userId}`;
    }
    return ipKeyGenerator(req.ip, 64); // IPv6-safe fallback
  }
});

const dataRetrievalLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour  
  max: (req) => req.session?.userId ? 500 : 200,
  message: 'Too many requests. Please try again later.'
  // Uses default IP-based key generation
});

const strictLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Rate limit exceeded. Please slow down.'
});

module.exports = {
  authLimiter,
  userActionLimiter, 
  dataRetrievalLimiter,
  strictLimiter
};