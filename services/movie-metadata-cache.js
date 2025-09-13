/**
 * Movie Metadata Cache Service
 * Lightweight caching for frequently accessed movie data with smart memory management
 */

const { getCachedData, setCachedData, clearCache } = require('./cache');

class MovieMetadataCache {
  constructor() {
    this.metadataCache = new Map();
    this.accessCount = new Map();
    this.lastAccess = new Map();
    this.maxCacheSize = 1000; // Limit to 1000 movies in memory
    this.cleanupInterval = 30 * 60 * 1000; // 30 minutes

    // Auto-cleanup stale entries
    setInterval(() => this.cleanupStaleEntries(), this.cleanupInterval);
  }

  /**
   * Get lightweight movie metadata
   * @param {number} movieId - Movie ID
   * @returns {Object|null} Cached metadata or null
   */
  getMovieMetadata(movieId) {
    this.recordAccess(movieId);

    // Check in-memory cache first
    if (this.metadataCache.has(movieId)) {
      return this.metadataCache.get(movieId);
    }

    // Check persistent cache
    const persistentData = getCachedData(`movie_metadata_${movieId}`);
    if (persistentData) {
      this.metadataCache.set(movieId, persistentData);
      return persistentData;
    }

    return null;
  }

  /**
   * Store lightweight movie metadata
   * @param {number} movieId - Movie ID
   * @param {Object} movieData - Full movie data from TMDB
   * @param {Object} releaseData - Release data
   */
  setMovieMetadata(movieId, movieData, releaseData = {}) {
    const metadata = this.createLightweightMetadata(movieData, releaseData);

    // Store in memory cache with size management
    this.ensureCacheSpace();
    this.metadataCache.set(movieId, metadata);

    // Store in persistent cache with longer TTL
    setCachedData(`movie_metadata_${movieId}`, metadata, 3600); // 1 hour TTL

    this.recordAccess(movieId);
  }

  /**
   * Create lightweight metadata object from full movie data
   * @param {Object} movieData - Full movie data
   * @param {Object} releaseData - Release data
   * @returns {Object} Lightweight metadata
   */
  createLightweightMetadata(movieData, releaseData = {}) {
    return {
      id: movieData.id,
      title: movieData.title,
      poster_path: movieData.poster_path,
      release_date: movieData.release_date,
      genre_ids: movieData.genre_ids || [],
      vote_average: movieData.vote_average || 0,
      vote_count: movieData.vote_count || 0,
      popularity: movieData.popularity || 0,
      overview: movieData.overview ? movieData.overview.substring(0, 200) : '', // Truncate overview

      // Release data
      usTheatrical: releaseData.usTheatrical || null,
      streaming: releaseData.streaming || null,
      primary: releaseData.primary || movieData.release_date,

      // Calculated fields
      qualityScore: (movieData.vote_average || 0) * Math.log((movieData.popularity || 0) + 1),

      // Cache metadata
      cached_at: Date.now(),
      cache_version: 1
    };
  }

  /**
   * Bulk set metadata for multiple movies
   * @param {Array} moviesWithReleaseData - Array of {movieData, releaseData} objects
   */
  setBulkMetadata(moviesWithReleaseData) {
    for (const { movieData, releaseData } of moviesWithReleaseData) {
      this.setMovieMetadata(movieData.id, movieData, releaseData);
    }
  }

  /**
   * Record access for LRU management
   * @param {number} movieId - Movie ID
   */
  recordAccess(movieId) {
    const currentCount = this.accessCount.get(movieId) || 0;
    this.accessCount.set(movieId, currentCount + 1);
    this.lastAccess.set(movieId, Date.now());
  }

  /**
   * Ensure cache doesn't exceed size limits
   */
  ensureCacheSpace() {
    if (this.metadataCache.size >= this.maxCacheSize) {
      // Remove least recently used items (20% of cache)
      const itemsToRemove = Math.floor(this.maxCacheSize * 0.2);

      // Sort by last access time (oldest first)
      const sortedByAccess = Array.from(this.lastAccess.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, itemsToRemove);

      for (const [movieId] of sortedByAccess) {
        this.metadataCache.delete(movieId);
        this.accessCount.delete(movieId);
        this.lastAccess.delete(movieId);
      }

      console.log(`Removed ${itemsToRemove} items from movie metadata cache`);
    }
  }

  /**
   * Clean up stale entries based on age
   */
  cleanupStaleEntries() {
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours
    const now = Date.now();
    let removed = 0;

    for (const [movieId, lastAccessTime] of this.lastAccess.entries()) {
      if (now - lastAccessTime > maxAge) {
        this.metadataCache.delete(movieId);
        this.accessCount.delete(movieId);
        this.lastAccess.delete(movieId);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`Cleaned up ${removed} stale movie metadata entries`);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const memoryUsageKB = this.metadataCache.size * 0.8; // Rough estimate (0.8KB per movie)

    return {
      memoryEntries: this.metadataCache.size,
      maxSize: this.maxCacheSize,
      memoryUsageKB: Math.round(memoryUsageKB),
      memoryUsageMB: Math.round(memoryUsageKB / 1024),
      utilizationPercent: Math.round((this.metadataCache.size / this.maxCacheSize) * 100),
      totalAccesses: Array.from(this.accessCount.values()).reduce((sum, count) => sum + count, 0)
    };
  }

  /**
   * Get hot movies (most frequently accessed)
   * @param {number} limit - Number of hot movies to return
   * @returns {Array} Array of {movieId, accessCount} objects
   */
  getHotMovies(limit = 10) {
    return Array.from(this.accessCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([movieId, accessCount]) => ({ movieId, accessCount }));
  }

  /**
   * Check if movie metadata is available and fresh
   * @param {number} movieId - Movie ID
   * @param {number} maxAge - Maximum age in milliseconds (default: 30 minutes)
   * @returns {boolean} Whether metadata is available and fresh
   */
  isMetadataFresh(movieId, maxAge = 30 * 60 * 1000) {
    const metadata = this.getMovieMetadata(movieId);
    if (!metadata || !metadata.cached_at) {
      return false;
    }

    return (Date.now() - metadata.cached_at) < maxAge;
  }

  /**
   * Clear all cached data
   */
  clearAllCache() {
    this.metadataCache.clear();
    this.accessCount.clear();
    this.lastAccess.clear();
  }

  /**
   * Preload popular movies metadata
   * @param {Array} movieIds - Array of movie IDs to preload
   */
  async preloadPopularMovies(movieIds) {
    const uncachedIds = movieIds.filter(id => !this.metadataCache.has(id));

    if (uncachedIds.length > 0) {
      console.log(`Preloading metadata for ${uncachedIds.length} popular movies`);
      // This would integrate with the bulk processor to fetch missing data
      // Implementation depends on specific needs
    }
  }
}

// Create singleton instance
const movieMetadataCache = new MovieMetadataCache();

module.exports = movieMetadataCache;