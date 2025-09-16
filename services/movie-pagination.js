/**
 * Movie Pagination Service
 * Provides fast, database-style pagination for sorted movie collections
 * Addresses performance issues with large batch fetching
 */

const { getExtendedUpcomingMovies, discoverMovies } = require('./tmdb');
const { processMoviesWithDates, filterMovies, sortMovies, deduplicateMovies } = require('./movie-processor');
const { toUtcMidnight } = require('../utils/date-helpers');

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
    this.popularityWarmPages = 5; // Base pages, but target-based fetching will override

    // Cache warming for releases popularity sorting
    this.releasesPopularityCache = new Map();
    this.releasesPopularityCacheTime = null;

    // Cache expansion tracking
    this.cacheExpansions = new Map(); // Track expansion levels per cache key
    this.expansionInProgress = new Map(); // Prevent concurrent expansions
    this.expandedCacheTime = new Map(); // Track when cache was expanded
    this.expansionTTL = 10 * 60 * 1000; // 10 minutes for expanded caches
    this.maxExpansionLevel = 3; // Maximum expansion cycles (5 → 15 → 25 → 30 pages)

    // Unified filtering configuration
    this.targetBatchSize = 20; // Standard page size
    this.targetBatches = 5; // Target 5 batches = 100 movies
  }

  /**
   * UNIFIED FILTERING PIPELINE
   * Apply the exact same filtering logic used throughout the system
   * This ensures consistency between cache warming and display-time filtering
   * @param {Array} rawMovies - Raw movies from TMDB API
   * @param {Object} options - Filtering options
   * @returns {Array} Filtered and processed movies
   */
  async applyUnifiedFiltering(rawMovies, options = {}) {
    const {
      type = 'upcoming',
      genre = null,
      excludeIds = [],
      sortBy = 'popularity'
    } = options;

    try {
      // Step 1: Process movies with dates (adds quality scores, formats dates)
      const processed = await processMoviesWithDates(rawMovies, { type });

      // Step 2: Apply genre and type-specific filtering
      const filtered = filterMovies(processed, { type, genre });

      // Step 3: Apply exclusion filter (for already displayed movies)
      const excluded = filtered.filter(movie => {
        if (!movie || !movie.id) return false; // Skip invalid movies
        return !excludeIds.includes(movie.id);
      });

      // Step 4: Deduplicate movies
      const deduplicated = deduplicateMovies(excluded, []);

      // Step 5: Sort movies according to specified criteria
      const sorted = sortMovies(deduplicated, sortBy);

      return sorted;

    } catch (error) {
      console.error('Unified filtering error:', error);
      return []; // Return empty array on error to prevent crashes
    }
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
      const expansionContext = { cacheKey, sortBy: 'popularity', genre };
      return await this.getPageFromCache(this.popularityCache.get(cacheKey), page, pageSize, excludeIds, expansionContext);
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
      const expansionContext = { cacheKey, sortBy, genre };
      return await this.getPageFromCache(cachedResult, page, pageSize, excludeIds, expansionContext);
    }

    console.log(`Fetching fresh date results for ${cacheKey}`);

    // Fetch more pages for date sorting to ensure 6-month coverage
    const optimizedPages = 25; // Increased from 8 to ensure sufficient movie volume
    const movies = await this.fetchDateSortedMovies(sortBy, optimizedPages, genre);

    // Cache the results
    this.sortedCollections.set(cacheKey, movies);
    this.lastRefresh.set(cacheKey, Date.now());

    const expansionContext = { cacheKey, sortBy, genre };
    return await this.getPageFromCache(movies, page, pageSize, excludeIds, expansionContext);
  }

  /**
   * Get sorted page for streaming releases (top-releases page)
   * Uses the same caching and optimization strategies as upcoming movies
   */
  async getReleasesSortedPage(sortBy, page, pageSize = 20, excludeIds = [], genre = null) {
    console.log(`getReleasesSortedPage: ${sortBy}, page ${page}, genre ${genre || 'all'}`);

    // Optimize for popularity sorting with pre-warmed cache
    if (sortBy === 'popularity') {
      return await this.getReleasesPopularityPage(page, pageSize, excludeIds, genre);
    } else {
      return await this.getReleasesDateSortedPage(sortBy, page, pageSize, excludeIds, genre);
    }
  }

  /**
   * Fast popularity-based page retrieval for releases (similar to upcoming)
   */
  async getReleasesPopularityPage(page, pageSize, excludeIds, genre) {
    const cacheKey = `releases_popularity_${genre || 'all'}`;

    // Check if we have pre-warmed cache
    if (this.releasesPopularityCache && this.releasesPopularityCache.has(cacheKey)) {
      console.log(`Using pre-warmed releases popularity cache for ${cacheKey}`);
      const cachedMovies = this.releasesPopularityCache.get(cacheKey);
      const expansionContext = { cacheKey, sortBy: 'popularity', genre, isReleases: true };
      return await this.getPageFromCache(cachedMovies, page, pageSize, excludeIds, expansionContext);
    }

    console.log(`Releases popularity cache stale/missing for ${cacheKey}, warming now...`);

    // Cache miss or stale - warm it quickly (async for next time)
    this.warmReleasesPopularityCache(genre).catch(console.error);

    // For immediate response, fetch minimal pages
    return await this.getQuickReleasesPopularityResponse(page, pageSize, excludeIds, genre);
  }

  /**
   * Date-sorted page retrieval for releases
   */
  async getReleasesDateSortedPage(sortBy, page, pageSize, excludeIds, genre) {
    const cacheKey = `releases_${sortBy}_${genre || 'all'}`;

    // Check if we have cached collection
    if (!this.needsRefresh(cacheKey) && this.sortedCollections.has(cacheKey)) {
      const cachedMovies = this.sortedCollections.get(cacheKey);
      // Re-sort cached movies by the requested sort order since cache contains popularity-sorted movies
      const reSortedMovies = sortMovies(cachedMovies, sortBy);
      const expansionContext = { cacheKey, sortBy, genre, isReleases: true };
      return await this.getPageFromCache(reSortedMovies, page, pageSize, excludeIds, expansionContext);
    }

    console.log(`Fetching fresh releases results for ${cacheKey}`);

    // For date sorting, use the same movie pool as popularity but sort client-side
    // This ensures consistent movie availability across all sorting options
    const optimizedPages = 25; // Increased from typical 8 pages to ensure good coverage
    const movies = await this.fetchStreamingReleases('popularity', optimizedPages, genre);

    // Cache the results
    this.sortedCollections.set(cacheKey, movies);
    this.lastRefresh.set(cacheKey, Date.now());

    const expansionContext = { cacheKey, sortBy, genre, isReleases: true };
    return await this.getPageFromCache(movies, page, pageSize, excludeIds, expansionContext);
  }

  /**
   * Quick popularity response for releases (when cache isn't warmed)
   */
  async getQuickReleasesPopularityResponse(page, pageSize, excludeIds, genre) {
    try {
      // Fetch just 2 pages for immediate response
      const quickPages = 2;
      const allRawMovies = [];

      for (let tmdbPage = 1; tmdbPage <= quickPages; tmdbPage++) {
        const now = toUtcMidnight(new Date());
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const apiParams = {
          page: tmdbPage,
          region: "US",
          sort_by: "popularity.desc",
          "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
          "primary_release_date.lte": now.toISOString().split('T')[0],
          with_release_type: "4|5", // Digital and Physical releases
          ...(genre && { with_genres: genre })
        };

        const response = await discoverMovies(apiParams);

        if (response.results && response.results.length > 0) {
          allRawMovies.push(...response.results);
        }
      }

      // Use unified filtering pipeline for consistency
      const filteredMovies = await this.applyUnifiedFiltering(allRawMovies, {
        type: 'releases',
        genre,
        excludeIds: [], // No exclusions during quick response
        sortBy: 'popularity'
      });

      // Provide expansion context for consistent metadata
      const expansionContext = { cacheKey: `releases_quick_${genre || 'all'}`, sortBy: 'popularity', genre, isReleases: true };
      return await this.getPageFromCache(filteredMovies, page, pageSize, excludeIds, expansionContext);

    } catch (error) {
      console.error('Quick releases popularity response failed:', error);
      throw error;
    }
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
   * Fetch streaming releases with optimized page count
   * Similar to fetchDateSortedMovies but for past 6 months of streaming releases
   */
  async fetchStreamingReleases(sortBy, maxPages, genre) {
    const now = toUtcMidnight(new Date());
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Map our sort options to TMDB's sort_by parameter
    let tmdbSortBy = "popularity.desc";
    switch (sortBy) {
      case "newest":
        tmdbSortBy = "release_date.desc";
        break;
      case "popularity":
      default:
        tmdbSortBy = "popularity.desc";
        break;
    }

    const allRawMovies = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        // Build API params for streaming releases
        const apiParams = {
          page: page,
          region: "US",
          sort_by: tmdbSortBy,
          "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
          "primary_release_date.lte": now.toISOString().split('T')[0],
          with_release_type: "4|5", // Digital and Physical releases
          ...(genre && { with_genres: genre })
        };

        const response = await discoverMovies(apiParams);

        if (response.results && response.results.length > 0) {
          allRawMovies.push(...response.results);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 120));

      } catch (error) {
        console.error(`Error fetching streaming releases page ${page}:`, error);
        // Continue with next page
      }
    }

    // Use unified filtering pipeline for consistency
    return await this.applyUnifiedFiltering(allRawMovies, {
      type: 'releases',
      genre,
      excludeIds: [], // No exclusions during initial fetch
      sortBy
    });
  }

  /**
   * Extract page from cached movie collection with optional expansion
   * Enhanced to ensure full pages and proactive expansion
   */
  async getPageFromCache(movies, page, pageSize, excludeIds = [], expansionContext = null) {
    // Apply exclusion filter - bulletproof deduplication
    const availableMovies = movies.filter(movie => {
      if (!movie || !movie.id) return false; // Skip invalid movies
      return !excludeIds.includes(movie.id);
    });

    // Calculate pagination - FIXED: Use cumulative loading for load-more
    // For load-more scenarios, always take next pageSize movies from available movies
    // The excludeIds already filter out previously displayed movies
    const startIndex = 0;  // Always start from available movies
    const endIndex = pageSize;  // Take next pageSize movies
    let pageMovies = availableMovies.slice(startIndex, endIndex);

    // FIXED: Calculate hasMore based on total cache capacity, not filtered length
    // This prevents "no more movies" when there are still movies in cache
    const totalPagesInCache = Math.ceil(movies.length / pageSize);
    const currentDisplayedCount = excludeIds.length + pageMovies.length;
    let hasMore = page < totalPagesInCache && currentDisplayedCount < movies.length;

    // Check expansion conditions - PROACTIVE instead of reactive
    let expandingInBackground = false;
    let synchronousExpansion = false;

    if (expansionContext) {
      const { cacheKey, sortBy, genre } = expansionContext;

      // SMART EXPANSION: Check if we need expansion
      if (this.shouldExpandCache(cacheKey, page, pageSize, availableMovies.length)) {
        const availableForThisPage = availableMovies.length - ((page - 1) * pageSize);
        const needsSynchronousExpansion = availableForThisPage < pageSize;

        if (needsSynchronousExpansion) {
          // Cache insufficient for full page - expand synchronously for immediate UX
          console.log(`Cache insufficient (${availableForThisPage}/${pageSize} movies available) - expanding synchronously for ${cacheKey}`);

          const expansionSuccess = await this.expandCache(cacheKey, sortBy, genre);

          if (expansionSuccess) {
            // Re-fetch movies from expanded cache to get full page
            console.log(`Synchronous expansion completed for ${cacheKey} - refetching from expanded cache`);
            const expandedMovies = this.getCachedMovies(cacheKey, sortBy, genre);
            if (expandedMovies && expandedMovies.length > movies.length) {
              movies = expandedMovies;
              console.log(`Using expanded cache with ${movies.length} movies for ${cacheKey}`);
            }
          }

          synchronousExpansion = true;
        } else {
          // Cache sufficient for this request - expand in background for future requests
          console.log(`Cache sufficient (${availableForThisPage}/${pageSize} movies) - expanding in background for ${cacheKey}`);

          this.expandCache(cacheKey, sortBy, genre).then(success => {
            if (success) {
              console.log(`Background expansion completed for ${cacheKey}`);
            }
          }).catch(error => {
            console.error(`Background expansion failed for ${cacheKey}:`, error);
          });

          expandingInBackground = true;
        }
      }

      // SMART PAGE COMPLETION: Handle incomplete pages at cache boundary
      if (pageMovies.length < pageSize && !hasMore) {
        console.log(`Incomplete page detected: ${pageMovies.length}/${pageSize} movies for page ${page}`);

        // For now, return available movies and mark hasMore = true if expansion is in progress
        if (expandingInBackground) {
          hasMore = true; // Signal more movies coming via expansion
          console.log(`Marked hasMore=true due to expansion in progress`);
        }
      }
    }

    // Data integrity validation
    const returnedIds = pageMovies.map(m => m.id);
    const duplicateCheck = returnedIds.filter((id, index) => returnedIds.indexOf(id) !== index);
    if (duplicateCheck.length > 0) {
      console.error(`DUPLICATE DETECTION: Found ${duplicateCheck.length} duplicate movies in page ${page}:`, duplicateCheck);
    }

    return {
      movies: pageMovies,
      hasMore,
      totalCount: movies.length, // FIXED: Report original cache size, not filtered size
      currentPage: page,
      collectionSize: movies.length,
      availableCount: availableMovies.length, // Add available count after deduplication
      excludedCount: excludeIds.length, // Add count of excluded movies for debugging
      source: 'pagination-service',
      expanding: expandingInBackground,
      synchronousExpansion: synchronousExpansion, // New: Indicates if sync expansion occurred
      expansionType: synchronousExpansion ? 'synchronous' : (expandingInBackground ? 'background' : 'none'),
      incomplete: pageMovies.length < pageSize && !hasMore
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
   * Warm popularity cache with unified filtering and target batches of 20
   * Ensures cache contains exactly the same movies that would be shown at display time
   */
  async warmPopularityCache(genre = null) {
    const cacheKey = `popularity_${genre || 'all'}`;
    const targetMovies = this.targetBatches * this.targetBatchSize; // 5 * 20 = 100

    console.log(`Warming popularity cache for ${cacheKey} (target: ${targetMovies} movies in ${this.targetBatches} batches)...`);

    try {
      const allRawMovies = [];
      const maxPages = 15; // Safety limit
      let page = 1;
      let filteredMovies = [];

      // Keep fetching until we have enough filtered movies or hit page limit
      while (filteredMovies.length < targetMovies && page <= maxPages) {
        const response = await getExtendedUpcomingMovies(page, "US", "popularity");

        if (response.results && response.results.length > 0) {
          // Deduplicate new movies before accumulating to prevent TMDB API page overlaps
          const newMovies = deduplicateMovies(response.results, allRawMovies);
          allRawMovies.push(...newMovies);

          if (newMovies.length !== response.results.length) {
            const duplicateIds = response.results.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
            console.log(`DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${page}: [${duplicateIds.join(', ')}]`);
          }

          // Apply unified filtering to all movies collected so far
          filteredMovies = await this.applyUnifiedFiltering(allRawMovies, {
            type: 'upcoming',
            genre,
            excludeIds: [], // No exclusions during cache warming
            sortBy: 'popularity'
          });

          console.log(`Cache warming progress: ${filteredMovies.length} filtered movies from ${page} pages (target: ${targetMovies})`);
        } else {
          console.log(`No results from page ${page}, stopping cache warming`);
          break;
        }

        page++;
        // Small delay to be nice to TMDB
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Ensure we have complete batches of 20
      const completeBatches = Math.floor(filteredMovies.length / this.targetBatchSize);
      const finalMovies = filteredMovies.slice(0, completeBatches * this.targetBatchSize);

      this.popularityCache.set(cacheKey, finalMovies);
      this.popularityCacheTime = Date.now();

      console.log(`Popularity cache warmed: ${finalMovies.length} movies (${completeBatches} complete batches of ${this.targetBatchSize}) from ${page - 1} pages for ${cacheKey}`);

    } catch (error) {
      console.error(`Failed to warm popularity cache for ${cacheKey}:`, error);
    }
  }

  /**
   * Warm releases popularity cache for instant response
   * Similar to warmPopularityCache but for streaming releases
   */
  async warmReleasesPopularityCache(genre = null) {
    const cacheKey = `releases_popularity_${genre || 'all'}`;
    const targetMovies = this.targetBatches * this.targetBatchSize; // 5 * 20 = 100

    console.log(`Warming releases popularity cache for ${cacheKey} (target: ${targetMovies} movies in ${this.targetBatches} batches)...`);

    try {
      const now = toUtcMidnight(new Date());
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const allRawMovies = [];
      let page = 1;

      // Target-based fetching: continue until we have sufficient movies
      while (true) {
        const apiParams = {
          page: page,
          region: "US",
          sort_by: "popularity.desc",
          "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
          "primary_release_date.lte": now.toISOString().split('T')[0],
          with_release_type: "4|5", // Digital and Physical releases
          ...(genre && { with_genres: genre })
        };

        const response = await discoverMovies(apiParams);

        if (response.results && response.results.length > 0) {
          // Deduplicate new movies before accumulating to prevent TMDB API page overlaps
          const newMovies = deduplicateMovies(response.results, allRawMovies);
          allRawMovies.push(...newMovies);

          if (newMovies.length !== response.results.length) {
            const duplicateIds = response.results.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
            console.log(`RELEASES DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${page}: [${duplicateIds.join(', ')}]`);
          }
        }

        // Apply unified filtering to see how many usable movies we have
        const filteredMovies = await this.applyUnifiedFiltering(allRawMovies, {
          type: 'releases',
          genre,
          excludeIds: [],
          sortBy: 'popularity'
        });

        console.log(`Cache warming progress: ${filteredMovies.length} filtered movies from ${page} pages (target: ${targetMovies})`);

        // Stop when we have enough movies OR we've reached reasonable limit
        if (filteredMovies.length >= targetMovies || page >= 15) {
          const completeBatches = Math.floor(filteredMovies.length / this.targetBatchSize);
          const finalMovies = filteredMovies.slice(0, completeBatches * this.targetBatchSize);

          // Store in releases cache
          this.releasesPopularityCache.set(cacheKey, finalMovies);
          this.releasesPopularityCacheTime = Date.now();

          console.log(`Releases popularity cache warmed: ${finalMovies.length} movies (${completeBatches} complete batches of ${this.targetBatchSize}) from ${page} pages for ${cacheKey}`);
          break;
        }

        page++;
        // Rate limiting to respect TMDB API
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`Failed to warm releases popularity cache for ${cacheKey}:`, error);
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
      const allRawMovies = [];

      for (let tmdbPage = 1; tmdbPage <= quickPages; tmdbPage++) {
        const response = await getExtendedUpcomingMovies(tmdbPage, "US", "popularity");

        if (response.results && response.results.length > 0) {
          // Deduplicate new movies before accumulating (consistency with other methods)
          const newMovies = deduplicateMovies(response.results, allRawMovies);
          allRawMovies.push(...newMovies);

          if (newMovies.length !== response.results.length) {
            const duplicateIds = response.results.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
            console.log(`QUICK RESPONSE DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${tmdbPage}: [${duplicateIds.join(', ')}]`);
          }
        }
      }

      // Use unified filtering pipeline for consistency
      const filteredMovies = await this.applyUnifiedFiltering(allRawMovies, {
        type: 'upcoming',
        genre,
        excludeIds: [], // No exclusions during quick response
        sortBy: 'popularity'
      });

      // No expansion context for quick response - this is temporary data
      return await this.getPageFromCache(filteredMovies, page, pageSize, excludeIds);

    } catch (error) {
      console.error('Quick popularity response failed:', error);
      throw error;
    }
  }

  /**
   * Fetch date-sorted movies with optimized page count
   */
  async fetchDateSortedMovies(sortBy, maxPages, genre) {
    const allRawMovies = [];

    for (let page = 1; page <= maxPages; page++) {
      try {
        // Don't pass sortBy to TMDB - discover endpoint with date filters ignores sort_by
        // Client-side sorting via applyUnifiedFiltering() handles proper date ordering
        const response = await getExtendedUpcomingMovies(page, "US", "popularity");

        if (response.results && response.results.length > 0) {
          // Deduplicate new movies before accumulating to prevent TMDB API page overlaps
          const newMovies = deduplicateMovies(response.results, allRawMovies);
          allRawMovies.push(...newMovies);

          if (newMovies.length !== response.results.length) {
            const duplicateIds = response.results.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
            console.log(`DATE FETCH DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${page}: [${duplicateIds.join(', ')}]`);
          }
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 120));

      } catch (error) {
        console.error(`Error fetching date page ${page}:`, error);
        // Continue with next page
      }
    }

    // Use unified filtering pipeline for consistency
    return await this.applyUnifiedFiltering(allRawMovies, {
      type: 'upcoming',
      genre,
      excludeIds: [], // No exclusions during initial fetch
      sortBy
    });
  }

  /**
   * Progressively expand cache to provide access to more movies
   * @param {string} cacheKey - Cache key to expand
   * @param {string} sortBy - Sort criteria for fetching
   * @param {string} genre - Genre filter
   * @returns {Promise<boolean>} Whether expansion was successful
   */
  async expandCache(cacheKey, sortBy, genre = null) {
    // Check if expansion is already in progress
    if (this.expansionInProgress.get(cacheKey)) {
      console.log(`Cache expansion already in progress for ${cacheKey}`);
      return false;
    }

    // Get current expansion level
    const currentLevel = this.cacheExpansions.get(cacheKey) || 0;

    // Check if we've reached maximum expansion
    if (currentLevel >= this.maxExpansionLevel) {
      console.log(`Maximum expansion level reached for ${cacheKey}`);
      return false;
    }

    // Calculate new page count based on expansion level
    const basePages = sortBy === 'popularity' ? this.popularityWarmPages : 8;
    const newPageCount = basePages + (currentLevel + 1) * 10; // 5→15→25→35 or 8→18→28→38

    console.log(`Expanding cache ${cacheKey} from level ${currentLevel} to ${currentLevel + 1} (${newPageCount} pages)`);

    this.expansionInProgress.set(cacheKey, true);

    try {
      let expandedMovies = [];

      if (sortBy === 'popularity') {
        // Expand popularity cache with incremental deduplication
        for (let page = 1; page <= newPageCount; page++) {
          const response = await getExtendedUpcomingMovies(page, "US", "popularity");

          if (response.results && response.results.length > 0) {
            const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
            const filtered = filterMovies(processed, { type: 'upcoming', genre });

            // Deduplicate new movies before accumulating to prevent duplicates during expansion
            const newMovies = deduplicateMovies(filtered, expandedMovies);
            expandedMovies.push(...newMovies);

            if (newMovies.length !== filtered.length) {
              const duplicateIds = filtered.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
              console.log(`CACHE EXPANSION DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${page}: [${duplicateIds.join(', ')}]`);
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Update popularity cache (movies are already deduplicated)
        const sorted = sortMovies(expandedMovies, 'popularity');
        this.popularityCache.set(cacheKey, sorted);
        this.popularityCacheTime = Date.now();

      } else if (sortBy.includes('release_date')) {
        // Expand date cache
        expandedMovies = await this.fetchDateSortedMovies(sortBy, newPageCount, genre);

        // Update date cache
        this.sortedCollections.set(cacheKey, expandedMovies);
        this.lastRefresh.set(cacheKey, Date.now());
      } else if (sortBy === 'newest' || cacheKey.includes('releases_')) {
        // Expand releases cache with incremental building (like upcoming)
        const now = toUtcMidnight(new Date());
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        for (let page = 1; page <= newPageCount; page++) {
          try {
            const apiParams = {
              page: page,
              region: "US",
              sort_by: "release_date.desc", // Use date sorting for "newest"
              "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
              "primary_release_date.lte": now.toISOString().split('T')[0],
              with_release_type: "4|5", // Digital and Physical releases
              ...(genre && { with_genres: genre })
            };

            const response = await discoverMovies(apiParams);

            if (response.results && response.results.length > 0) {
              const processed = await processMoviesWithDates(response.results, { type: 'releases' });
              const filtered = filterMovies(processed, { type: 'releases', genre });

              // Deduplicate new movies before accumulating to prevent duplicates during expansion
              const newMovies = deduplicateMovies(filtered, expandedMovies);
              expandedMovies.push(...newMovies);

              if (newMovies.length !== filtered.length) {
                const duplicateIds = filtered.filter(movie => !newMovies.some(newMovie => newMovie.id === movie.id)).map(movie => movie.id);
                console.log(`RELEASES EXPANSION DUPLICATE DETECTION: Found ${duplicateIds.length} duplicate movies in page ${page}: [${duplicateIds.join(', ')}]`);
              }
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Error fetching releases expansion page ${page}:`, error);
            // Continue with next page
          }
        }

        // Sort by newest (release date descending) after expansion
        const sorted = sortMovies(expandedMovies, 'newest');
        this.sortedCollections.set(cacheKey, sorted);
        this.lastRefresh.set(cacheKey, Date.now());
      }

      // Update expansion tracking
      this.cacheExpansions.set(cacheKey, currentLevel + 1);
      this.expandedCacheTime.set(cacheKey, Date.now());

      console.log(`✅ Cache expanded: ${cacheKey} now has ${expandedMovies.length} movies (level ${currentLevel + 1})`);
      return true;

    } catch (error) {
      console.error(`Failed to expand cache ${cacheKey}:`, error);
      return false;
    } finally {
      this.expansionInProgress.delete(cacheKey);
    }
  }

  /**
   * Check if cache needs expansion based on requested page
   * @param {string} cacheKey - Cache key to check
   * @param {number} requestedPage - Page number being requested
   * @param {number} pageSize - Movies per page
   * @param {number} totalMovies - Current total movies in cache
   * @returns {boolean} Whether expansion is needed
   */
  shouldExpandCache(cacheKey, requestedPage, pageSize, totalMovies) {
    // PROACTIVE EXPANSION: Trigger when approaching boundary (2-page buffer)
    const requiredMovies = requestedPage * pageSize;
    const bufferMovies = (requestedPage + 2) * pageSize; // 2-page buffer for proactive expansion
    const hasProactiveBuffer = totalMovies >= bufferMovies;

    if (hasProactiveBuffer) {
      return false; // Current cache has sufficient buffer
    }

    // Check if expansion is possible
    const currentLevel = this.cacheExpansions.get(cacheKey) || 0;
    if (currentLevel >= this.maxExpansionLevel) {
      return false; // Already at maximum expansion
    }

    // Check if expansion is already in progress
    if (this.expansionInProgress.get(cacheKey)) {
      return false; // Already expanding
    }

    // Check if expanded cache is still valid
    const expandedTime = this.expandedCacheTime.get(cacheKey);
    if (expandedTime && (Date.now() - expandedTime > this.expansionTTL)) {
      // Expanded cache is stale, allow re-expansion
      this.cacheExpansions.set(cacheKey, 0);
      this.expandedCacheTime.delete(cacheKey);
      console.log(`Stale cache detected for ${cacheKey}, resetting for re-expansion`);
    }

    console.log(`Proactive expansion triggered: page ${requestedPage}, cache ${totalMovies}, buffer needed ${bufferMovies}`);
    return true; // Needs expansion
  }

  /**
   * Get cached movies for a specific cache key and sort type
   * @param {string} cacheKey - Cache key identifier
   * @param {string} sortBy - Sort criteria
   * @param {string} genre - Genre filter
   * @returns {Array|null} Cached movies or null if not found
   */
  getCachedMovies(cacheKey, sortBy, genre) {
    // Check popularity caches first
    if (sortBy === 'popularity') {
      return this.popularityCache.get(cacheKey) || null;
    }

    // Check date-sorted caches
    if (sortBy.includes('release_date')) {
      return this.sortedCollections.get(cacheKey) || null;
    }

    // Fallback to sorted collections
    return this.sortedCollections.get(cacheKey) || null;
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

    // PRIORITY 1.5: Warm releases popularity cache (top-releases performance)
    try {
      await this.warmReleasesPopularityCache(null); // All genres
      console.log('✅ Releases popularity cache warmed');
    } catch (error) {
      console.error('❌ Failed to warm releases popularity cache:', error);
    }

    // PRIORITY 2: Pre-warm upcoming movies date collections (background)
    const upcomingDateCollections = [
      { sortBy: 'release_date_asc', genre: null },
      { sortBy: 'release_date_desc', genre: null }
    ];

    // Run these in background to avoid blocking startup
    setTimeout(async () => {
      for (const { sortBy, genre } of upcomingDateCollections) {
        try {
          await this.fetchDateSortedMovies(sortBy, 15, genre);
          console.log(`✅ Pre-warmed upcoming ${sortBy} collection`);
        } catch (error) {
          console.error(`❌ Failed to pre-warm upcoming ${sortBy}:`, error);
        }
      }
    }, 5000); // 5 second delay

    // PRIORITY 3: Pre-warm releases date collections (background)
    setTimeout(async () => {
      try {
        // Pre-warm releases newest collection using same movie pool as popularity
        const newestMovies = await this.fetchStreamingReleases('popularity', 25, null);
        this.sortedCollections.set('releases_newest_all', newestMovies);
        this.lastRefresh.set('releases_newest_all', Date.now());
        console.log('✅ Pre-warmed releases newest collection');
      } catch (error) {
        console.error('❌ Failed to pre-warm releases newest:', error);
      }
    }, 7000); // 7 second delay to avoid overlapping with upcoming collections

    console.log('Hybrid collection preloading initiated');
  }

  /**
   * Clear stale collections to free memory
   */
  clearStaleCollections() {
    const staleThreshold = this.refreshInterval * 2; // 30 minutes
    const now = Date.now();
    let cleared = 0;
    let expandedCleared = 0;

    // Clear regular stale collections
    for (const [key, lastRefresh] of this.lastRefresh.entries()) {
      if (now - lastRefresh > staleThreshold) {
        this.sortedCollections.delete(key);
        this.lastRefresh.delete(key);
        cleared++;
      }
    }

    // Clear stale popularity cache expansions
    for (const [key, cacheTime] of this.expandedCacheTime.entries()) {
      if (now - cacheTime > this.expansionTTL) {
        // Reset expansion level so cache can be re-expanded if needed
        this.cacheExpansions.delete(key);
        this.expandedCacheTime.delete(key);
        expandedCleared++;

        // Also clean up the corresponding popularity cache if it's stale
        const cacheAge = this.popularityCacheTime ? (now - this.popularityCacheTime) : Infinity;
        if (cacheAge > this.expansionTTL) {
          this.popularityCache.delete(key);
        }
      }
    }

    // Clear any orphaned expansion tracking
    for (const [key] of this.cacheExpansions.entries()) {
      if (!this.expandedCacheTime.has(key) &&
          !this.sortedCollections.has(key) &&
          !this.popularityCache.has(key)) {
        this.cacheExpansions.delete(key);
        expandedCleared++;
      }
    }

    if (cleared > 0 || expandedCleared > 0) {
      console.log(`Cleared ${cleared} stale collections and ${expandedCleared} expansion tracks`);
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