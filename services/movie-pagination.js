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
    this.maxPages = 30; // Limit TMDB API calls
  }

  /**
   * Get a paginated subset of movies from sorted collection
   * @param {string} sortBy - Sort criteria
   * @param {number} page - Page number (1-based)
   * @param {number} pageSize - Number of movies per page
   * @param {Array} excludeIds - Movie IDs to exclude
   * @param {string} genre - Genre filter
   * @returns {Object} Paginated result with movies, hasMore, etc.
   */
  async getSortedPage(sortBy, page, pageSize = 20, excludeIds = [], genre = null) {
    const collectionKey = `upcoming_${sortBy}_${genre || 'all'}`;
    
    // Ensure collection is available and fresh
    if (this.needsRefresh(collectionKey)) {
      await this.refreshCollection(collectionKey, sortBy, genre);
    }
    
    const collection = this.sortedCollections.get(collectionKey);
    if (!collection || collection.length === 0) {
      throw new Error(`Collection not available: ${collectionKey}`);
    }
    
    // Apply exclusion filter
    const availableMovies = collection.filter(movie => !excludeIds.includes(movie.id));
    
    // Calculate pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageMovies = availableMovies.slice(startIndex, endIndex);
    
    return {
      movies: pageMovies,
      hasMore: endIndex < availableMovies.length,
      totalCount: availableMovies.length,
      currentPage: page,
      collectionSize: collection.length,
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
   * Preload common collections for better performance
   * Call this on server startup or via cron job
   */
  async preloadCollections() {
    const commonCollections = [
      { sortBy: 'popularity', genre: null },
      { sortBy: 'release_date_asc', genre: null },
      { sortBy: 'release_date_desc', genre: null }
    ];
    
    console.log('Preloading movie collections...');
    
    for (const { sortBy, genre } of commonCollections) {
      const collectionKey = `upcoming_${sortBy}_${genre || 'all'}`;
      
      try {
        await this.refreshCollection(collectionKey, sortBy, genre);
      } catch (error) {
        console.error(`Failed to preload collection ${collectionKey}:`, error);
      }
    }
    
    console.log('Collection preloading completed');
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