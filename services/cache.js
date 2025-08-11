// services/cache.js
const NodeCache = require("node-cache");

// Cache with 10 minutes TTL (adjust as needed)
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

/**
 * Get cached data by key
 * @param {string} key
 * @returns {any|null} Cached data or null if missing
 */
function getCachedData(key) {
  return cache.get(key);
}

/**
 * Set data into cache with optional TTL override
 * @param {string} key
 * @param {any} value
 * @param {number} ttlInSeconds optional TTL override
 */
function setCachedData(key, value, ttlInSeconds) {
  cache.set(key, value, ttlInSeconds);
}

/**
 * Clear cached data by key
 * @param {string} key
 */
function clearCache(key) {
  cache.del(key);
}

module.exports = {
  getCachedData,
  setCachedData,
  clearCache,
};
