class RateLimitMonitor {
  constructor() {
    this.stats = {
      totalRequests: 0,
      rateLimitHits: 0,
      endpoints: {},
      users: {},
      ips: {}
    };
    this.alertThresholds = {
      rateLimitHitsPerHour: 50,
      uniqueIPsHittingLimits: 10
    };
    this.startTime = new Date();
  }

  logRequest(req, isRateLimited = false) {
    const endpoint = req.originalUrl;
    const userKey = req.session?.userId ? `user_${req.session.userId}` : null;
    const ip = req.ip;
    const timestamp = new Date();

    this.stats.totalRequests++;

    if (isRateLimited) {
      this.stats.rateLimitHits++;
      this.logRateLimit(req, timestamp);
    }

    if (!this.stats.endpoints[endpoint]) {
      this.stats.endpoints[endpoint] = { requests: 0, rateLimitHits: 0 };
    }
    this.stats.endpoints[endpoint].requests++;
    if (isRateLimited) {
      this.stats.endpoints[endpoint].rateLimitHits++;
    }

    if (userKey) {
      if (!this.stats.users[userKey]) {
        this.stats.users[userKey] = { requests: 0, rateLimitHits: 0 };
      }
      this.stats.users[userKey].requests++;
      if (isRateLimited) {
        this.stats.users[userKey].rateLimitHits++;
      }
    }

    if (!this.stats.ips[ip]) {
      this.stats.ips[ip] = { requests: 0, rateLimitHits: 0 };
    }
    this.stats.ips[ip].requests++;
    if (isRateLimited) {
      this.stats.ips[ip].rateLimitHits++;
    }
  }

  logRateLimit(req, timestamp) {
    const userInfo = req.session?.userId ? `user ${req.session.userId}` : `IP ${req.ip}`;
    const endpoint = req.originalUrl;
    const userAgent = req.get('User-Agent') || 'Unknown';

    console.warn(`[RATE_LIMIT_HIT] ${timestamp.toISOString()} - ${userInfo} hit rate limit on ${endpoint}`);
    console.warn(`[RATE_LIMIT_DETAILS] User-Agent: ${userAgent}, Referer: ${req.get('Referer') || 'None'}`);

    this.checkForAlerts();
  }

  checkForAlerts() {
    const now = new Date();
    const hourAgo = new Date(now - 60 * 60 * 1000);

    const recentHits = this.stats.rateLimitHits;
    if (recentHits >= this.alertThresholds.rateLimitHitsPerHour) {
      console.error(`[RATE_LIMIT_ALERT] High number of rate limit hits: ${recentHits} in the last period`);
    }

    const uniqueIPsWithLimits = Object.keys(this.stats.ips).filter(
      ip => this.stats.ips[ip].rateLimitHits > 0
    ).length;

    if (uniqueIPsWithLimits >= this.alertThresholds.uniqueIPsHittingLimits) {
      console.error(`[RATE_LIMIT_ALERT] ${uniqueIPsWithLimits} unique IPs hitting rate limits - possible DDoS`);
    }
  }

  getStats() {
    const uptime = Date.now() - this.startTime.getTime();
    const requestsPerMinute = (this.stats.totalRequests / (uptime / 60000)).toFixed(2);
    const rateLimitPercentage = ((this.stats.rateLimitHits / this.stats.totalRequests) * 100).toFixed(2);

    return {
      ...this.stats,
      uptime: Math.round(uptime / 1000),
      requestsPerMinute: parseFloat(requestsPerMinute),
      rateLimitPercentage: parseFloat(rateLimitPercentage),
      topEndpoints: this.getTopEndpoints(),
      topOffendingIPs: this.getTopOffendingIPs(),
      timestamp: new Date()
    };
  }

  getTopEndpoints(limit = 5) {
    return Object.entries(this.stats.endpoints)
      .sort((a, b) => b[1].requests - a[1].requests)
      .slice(0, limit)
      .map(([endpoint, stats]) => ({ endpoint, ...stats }));
  }

  getTopOffendingIPs(limit = 5) {
    return Object.entries(this.stats.ips)
      .filter(([ip, stats]) => stats.rateLimitHits > 0)
      .sort((a, b) => b[1].rateLimitHits - a[1].rateLimitHits)
      .slice(0, limit)
      .map(([ip, stats]) => ({ ip, ...stats }));
  }

  resetStats() {
    this.stats = {
      totalRequests: 0,
      rateLimitHits: 0,
      endpoints: {},
      users: {},
      ips: {}
    };
    this.startTime = new Date();
    console.info('[RATE_LIMIT_MONITOR] Stats reset');
  }

  startPeriodicReporting(intervalMinutes = 60) {
    setInterval(() => {
      const stats = this.getStats();
      console.info('[RATE_LIMIT_REPORT] Periodic stats:', {
        totalRequests: stats.totalRequests,
        rateLimitHits: stats.rateLimitHits,
        rateLimitPercentage: stats.rateLimitPercentage,
        requestsPerMinute: stats.requestsPerMinute,
        topEndpoints: stats.topEndpoints.slice(0, 3)
      });
    }, intervalMinutes * 60 * 1000);
  }
}

const monitor = new RateLimitMonitor();

if (process.env.NODE_ENV === 'production') {
  monitor.startPeriodicReporting(60);
}

module.exports = monitor;