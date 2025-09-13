/**
 * Movie Pagination Service
 * Provides fast, database-style pagination for sorted movie collections
 * Addresses performance issues with large batch fetching
 */

const { getExtendedUpcomingMovies } = require('./tmdb');
const { processMoviesWithDates, filterMovies, sortMovies, deduplicateMovies } = require('./movie-processor');

class MoviePaginationService {
  constructor() {
    this.sortedCollections = new Map();
    this.lastRefresh = new Map();
    this.refreshInProgress = new Map();
    this.refreshInterval = 15 * 60 * 1000; // 15 minutes
    this.maxPages = 30; // Limit TMDB API calls for full refresh

    // Cache warming for popularity sorting
    this.popularityCache = new Map();
    this.popularityCacheTime = null;
    this.popularityWarmPages = 5; // Fewer pages for fast initial cache
  }

  /**
   * Get a paginated subset of movies from sorted collection
   * HYBRID STRATEGY: Fast popularity cache vs accurate date fetching
   * @param {string} sortBy - Sort criteria
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Number of movies per page
   * @param {Array} excludeIds - Movie IDs to exclude
   * @param {string} genre - Genre filter
   * @returns {Object} Paginated result with movies, hasMore, etc.
   */
  async getSortedPage(sortBy, page, pageSize = 20, excludeIds = [], genre = null) {
    console.log(`getSortedPage: ${sortBy}, page ${page}, genre ${genre || 'all'}`);

    // HYBRID DECISION: Route to optimized method based on sort type
    if (sortBy === 'popularity') {
      return await this.getPopularityPageFast(page, pageSize, excludeIds, genre);
    }

    if (sortBy.includes('release_date')) {
      return await this.getDatePageAccurate(sortBy, page, pageSize, excludeIds, genre);
    }

    // Fallback to original method for other sort types
    return await this.getSortedPageOriginal(sortBy, page, pageSize, excludeIds, genre);
  }

  /**
   * FAST POPULARITY SORTING: Use pre-warmed cache
   */
  async getPopularityPageFast(page, pageSize, excludeIds = [], genre = null) {
    const cacheKey = `popularity_${genre || 'all'}`;

    // Check if we have fresh cached data
    if (this.isPopularityCacheFresh(cacheKey)) {
      console.log(`Using pre-warmed popularity cache for ${cacheKey}`);
      return this.getPageFromCache(this.popularityCache.get(cacheKey), page, pageSize, excludeIds);
    }

    console.log(`Popularity cache stale/missing for ${cacheKey}, warming now...`);

    // Cache miss or stale - warm it quickly (async for next time)
    this.warmPopularityCache(genre).catch(console.error);

    // For immediate response, fetch minimal pages
    return await this.getQuickPopularityResponse(page, pageSize, excludeIds, genre);
  }

  /**
   * ACCURATE DATE SORTING: Smart real-time fetch with reduced pages
   */
  async getDatePageAccurate(sortBy, page, pageSize, excludeIds = [], genre = null) {
    const cacheKey = `date_${sortBy}_${genre || 'all'}`;

    // Check for recent date cache (shorter TTL for dates)
    const cachedResult = this.sortedCollections.get(cacheKey);
    const cacheAge = Date.now() - (this.lastRefresh.get(cacheKey) || 0);

    if (cachedResult && cacheAge < (5 * 60 * 1000)) { // 5 minute TTL for dates
      console.log(`Using cached date results for ${cacheKey}`);
      return this.getPageFromCache(cachedResult, page, pageSize, excludeIds);
    }

    console.log(`Fetching fresh date results for ${cacheKey}`);

    // Fetch fewer pages for date sorting (but enough for accuracy)
    const optimizedPages = 8; // Sweet spot: accuracy vs speed
    const movies = await this.fetchDateSortedMovies(sortBy, optimizedPages, genre);

    // Cache the results
    this.sortedCollections.set(cacheKey, movies);
    this.lastRefresh.set(cacheKey, Date.now());

    return this.getPageFromCache(movies, page, pageSize, excludeIds);
  }

  /**
   * ORIGINAL METHOD: Fallback for other sort types
   */
  async getSortedPageOriginal(sortBy, page, pageSize, excludeIds, genre) {
    const collectionKey = `upcoming_${sortBy}_${genre || 'all'}`;

    // Ensure collection is available and fresh
    if (this.needsRefresh(collectionKey)) {
      await this.refreshCollection(collectionKey, sortBy, genre);
    }

    const collection = this.sortedCollections.get(collectionKey);
    if (!collection || collection.length === 0) {
      throw new Error(`Collection not available: ${collectionKey}`);
    }

    return this.getPageFromCache(collection, page, pageSize, excludeIds);
  }

  /**
   * Extract page from cached movie collection
   */
  getPageFromCache(movies, page, pageSize, excludeIds = []) {
    // Apply exclusion filter
    const availableMovies = movies.filter(movie => !excludeIds.includes(movie.id));

    // Calculate pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageMovies = availableMovies.slice(startIndex, endIndex);

    return {
      movies: pageMovies,
      hasMore: endIndex < availableMovies.length,
      totalCount: availableMovies.length,
      currentPage: page,
      collectionSize: movies.length,
      source: 'pagination-service'
    };
  }

  /**
   * Refresh a movie collection from TMDB API
   * @param {string} collectionKey - Cache key for collection
   * @param {string} sortBy - Sort criteria
   * @param {string} genre - Genre filter
   */
  async refreshCollection(collectionKey, sortBy, genre = null) {
    // Prevent duplicate refresh operations
    if (this.refreshInProgress.get(collectionKey)) {
      console.log(`Collection refresh already in progress: ${collectionKey}`);
      return;
    }

    this.refreshInProgress.set(collectionKey, true);
    console.log(`Starting collection refresh: ${collectionKey}`);
    
    try {
      const allMovies = [];
      let page = 1;
      let hasMore = true;
      let consecutiveEmptyPages = 0;
      
      while (hasMore && page <= this.maxPages && consecutiveEmptyPages < 3) {
        try {
          const response = await getExtendedUpcomingMovies(page, "US", sortBy);
          
          if (!response.results || response.results.length === 0) {
            consecutiveEmptyPages++;
            page++;
            continue;
          }
          
          consecutiveEmptyPages = 0;
          
          // Process movies with dates
          const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
          
          // Apply filtering
          const filtered = filterMovies(processed, { type: 'upcoming', genre });
          
          allMovies.push(...filtered);
          
          hasMore = page < response.total_pages && response.results.length > 0;
          page++;
          
          // Rate limiting to prevent TMDB API issues
          await new Promise(resolve => setTimeout(resolve, 150));
          
        } catch (error) {
          console.error(`Error fetching page ${page} for ${collectionKey}:`, error);
          consecutiveEmptyPages++;
          page++;
          
          // Continue trying next pages, but with a longer delay
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Deduplicate and sort the entire collection
      const deduplicated = deduplicateMovies(allMovies, []);
      const sorted = sortMovies(deduplicated, sortBy);
      
      // Store in memory with metadata
      this.sortedCollections.set(collectionKey, sorted);
      this.lastRefresh.set(collectionKey, Date.now());
      
      console.log(`Collection ${collectionKey} refreshed: ${sorted.length} movies from ${page-1} pages`);
      
    } catch (error) {
      console.error(`Failed to refresh collection ${collectionKey}:`, error);
      throw error;
    } finally {
      this.refreshInProgress.delete(collectionKey);
    }
  }

  /**
   * Check if a collection needs refreshing
   * @param {string} collectionKey - Cache key to check
   * @returns {boolean} Whether collection needs refresh
   */
  needsRefresh(collectionKey) {
    // Check if collection exists
    if (!this.sortedCollections.has(collectionKey)) {
      return true;
    }
    
    // Check if collection is stale
    const lastRefresh = this.lastRefresh.get(collectionKey);
    if (!lastRefresh) {
      return true;
    }
    
    return Date.now() - lastRefresh > this.refreshInterval;
  }

  /**
   * Get cache statistics for monitoring
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    const stats = {
      collections: this.sortedCollections.size,
      totalMovies: 0,
      memoryUsage: 0,
      collectionsDetail: {}
    };
    
    for (const [key, collection] of this.sortedCollections.entries()) {
      stats.totalMovies += collection.length;
      
      // Rough memory calculation (each movie ~2KB)
      const collectionMemory = collection.length * 2 * 1024;
      stats.memoryUsage += collectionMemory;
      
      stats.collectionsDetail[key] = {
        movieCount: collection.length,
        lastRefresh: this.lastRefresh.get(key),
        memoryKB: Math.round(collectionMemory / 1024)
      };
    }
    
    stats.memoryMB = Math.round(stats.memoryUsage / 1024 / 1024);
    return stats;
  }

  /**
   * Check if popularity cache is fresh
   */
  isPopularityCacheFresh(cacheKey) {
    if (!this.popularityCache.has(cacheKey) || !this.popularityCacheTime) {
      return false;
    }

    const cacheAge = Date.now() - this.popularityCacheTime;
    return cacheAge < (30 * 60 * 1000); // 30 minutes TTL
  }

  /**
   * Warm popularity cache with optimized page count
   */
  async warmPopularityCache(genre = null) {
    const cacheKey = `popularity_${genre || 'all'}`;

    console.log(`Warming popularity cache for ${cacheKey}...`);

    try {
      const movies = [];

      for (let page = 1; page <= this.popularityWarmPages; page++) {
        const response = await getExtendedUpcomingMovies(page, "US", "popularity");

        if (response.results && response.results.length > 0) {
          const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
          const filtered = filterMovies(processed, { type: 'upcoming', genre });
          movies.push(...filtered);
        }

        // Small delay to be nice to TMDB
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Sort and deduplicate
      const deduplicated = deduplicateMovies(movies, []);
      const sorted = sortMovies(deduplicated, 'popularity');

      this.popularityCache.set(cacheKey, sorted);
      this.popularityCacheTime = Date.now();

      console.log(`Popularity cache warmed: ${sorted.length} movies for ${cacheKey}`);

    } catch (error) {
      console.error(`Failed to warm popularity cache for ${cacheKey}:`, error);
    }
  }

  /**
   * Quick popularity response for cache misses
   */
  async getQuickPopularityResponse(page, pageSize, excludeIds, genre) {
    console.log('Providing quick popularity response while cache warms...');

    try {
      // Fetch just 2 pages for immediate response
      const quickPages = 2;
      const movies = [];

      for (let tmdbPage = 1; tmdbPage <= quickPages; tmdbPage++) {
        const response = await getExtendedUpcomingMovies(tmdbPage, "US", "popularity");

        if (response.results && response.results.length > 0) {
          const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
          const filtered = filterMovies(processed, { type: 'upcoming', genre });
          movies.push(...filtered);
        }
      }

      const sorted = sortMovies(movies, 'popularity');
      return this.getPageFromCache(sorted, page, pageSize, excludeIds);

    } catch (error) {
      console.error('Quick popularity response failed:', error);
      throw error;
    }
  }

  /**
   * Fetch date-sorted movies with optimized page count
   */
  async fetchDateSortedMovies(sortBy, maxPages, genre) {
    const movies = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        const response = await getExtendedUpcomingMovies(page, "US", sortBy);

        if (response.results && response.results.length > 0) {
          const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
          const filtered = filterMovies(processed, { type: 'upcoming', genre });
          movies.push(...filtered);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 120));

      } catch (error) {
        console.error(`Error fetching date page ${page}:`, error);
        // Continue with next page
      }
    }

    // Deduplicate and sort
    const deduplicated = deduplicateMovies(movies, []);
    return sortMovies(deduplicated, sortBy);
  }

  /**
   * Preload common collections for better performance
   * Call this on server startup or via cron job
   */
  async preloadCollections() {
    console.log('Preloading movie collections with hybrid strategy...');

    // PRIORITY 1: Warm popularity caches (fast startup essential)
    try {
      await this.warmPopularityCache(null); // All genres
      console.log('✅ Popularity cache warmed');
    } catch (error) {
      console.error('❌ Failed to warm popularity cache:', error);
    }

    // PRIORITY 2: Pre-warm common date collections (background)
    const dateCollections = [
      { sortBy: 'release_date_asc', genre: null },
      { sortBy: 'release_date_desc', genre: null }
    ];

    // Run these in background to avoid blocking startup
    setTimeout(async () => {
      for (const { sortBy, genre } of dateCollections) {
        try {
          await this.fetchDateSortedMovies(sortBy, 6, genre);
          console.log(`✅ Pre-warmed ${sortBy} collection`);
        } catch (error) {
          console.error(`❌ Failed to pre-warm ${sortBy}:`, error);
        }
      }
    }, 5000); // 5 second delay

    console.log('Hybrid collection preloading initiated');
  }

  /**
   * Clear stale collections to free memory
   */
  clearStaleCollections() {
    const staleThreshold = this.refreshInterval * 2; // 30 minutes
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, lastRefresh] of this.lastRefresh.entries()) {
      if (now - lastRefresh > staleThreshold) {
        this.sortedCollections.delete(key);
        this.lastRefresh.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`Cleared ${cleared} stale movie collections`);
    }
  }
}

// Create singleton instance
const moviePaginationService = new MoviePaginationService();

// Auto-cleanup stale collections every 30 minutes
setInterval(() => {
  moviePaginationService.clearStaleCollections();
}, 30 * 60 * 1000);

module.exports = moviePaginationService;