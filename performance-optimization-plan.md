# Performance Optimization Plan for Upcoming Movies

## Problem Summary
Current date-based sorting implementation can fetch up to 500 movies per load-more request, causing:
- 4-10 second response times
- 3MB+ memory usage per request
- TMDB API rate limit risks
- Poor user experience on slower networks

## Solution 1: Progressive Loading with Streaming Response

### Implementation:
```javascript
// New endpoint: /load-more-upcoming-stream
router.get("/load-more-upcoming-stream", dataRetrievalLimiter, async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    let moviesBatch = [];
    let tmdbPage = 1;
    const batchSize = 5; // Process 5 TMDB pages at a time
    
    while (tmdbPage <= 20 && moviesBatch.length < 20) {
      // Fetch small batches progressively
      const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);
      const processed = await processMoviesWithDates(response.results);
      
      moviesBatch.push(...processed);
      
      // Stream partial results immediately
      if (moviesBatch.length >= 10) {
        res.write(`data: ${JSON.stringify({
          type: 'batch',
          movies: moviesBatch.slice(0, 10),
          hasMore: true
        })}\n\n`);
        
        moviesBatch = moviesBatch.slice(10);
      }
      
      tmdbPage++;
      // Add small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Send final batch
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      movies: moviesBatch,
      hasMore: false
    })}\n\n`);
    
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
  } finally {
    res.end();
  }
});
```

## Solution 2: Server-Side Caching with Background Jobs

### Implementation:
```javascript
// Background job to pre-populate sorted movie cache
class MovieCacheManager {
  constructor() {
    this.cache = new Map();
    this.refreshInterval = 30 * 60 * 1000; // 30 minutes
  }

  async preloadUpcomingMovies() {
    console.log('Preloading upcoming movies cache...');
    
    const sortTypes = ['release_date_asc', 'release_date_desc', 'popularity'];
    
    for (const sortBy of sortTypes) {
      const cacheKey = `upcoming_${sortBy}`;
      
      try {
        // Fetch and process all movies in background
        const allMovies = await this.fetchAllUpcoming(sortBy);
        
        // Store in cache with pagination markers
        this.cache.set(cacheKey, {
          movies: allMovies,
          lastUpdated: new Date(),
          pages: this.createPaginationIndex(allMovies, 20)
        });
        
        console.log(`Cached ${allMovies.length} movies for sort: ${sortBy}`);
      } catch (error) {
        console.error(`Failed to cache movies for ${sortBy}:`, error);
      }
    }
  }

  getCachedPage(sortBy, page, displayedIds = []) {
    const cacheKey = `upcoming_${sortBy}`;
    const cached = this.cache.get(cacheKey);
    
    if (!cached || this.isCacheStale(cached)) {
      return null;
    }
    
    // Filter out already displayed movies
    const availableMovies = cached.movies.filter(
      movie => !displayedIds.includes(movie.id)
    );
    
    const startIndex = (page - 1) * 20;
    const pageMovies = availableMovies.slice(startIndex, startIndex + 20);
    
    return {
      movies: pageMovies,
      hasMore: startIndex + 20 < availableMovies.length,
      totalAvailable: availableMovies.length
    };
  }

  isCacheStale(cached) {
    return Date.now() - cached.lastUpdated.getTime() > this.refreshInterval;
  }
}

// Usage in load-more endpoint:
router.get("/load-more-upcoming-cached", dataRetrievalLimiter, async (req, res) => {
  const sortBy = req.query.sort || "popularity";
  const page = parseInt(req.query.page) || 2;
  const displayedIds = req.query.displayedMovieIds 
    ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
    : [];
  
  // Try cache first
  const cachedResult = movieCacheManager.getCachedPage(sortBy, page, displayedIds);
  
  if (cachedResult) {
    // Instant response from cache
    const html = await renderMovieCards(req, cachedResult.movies, options);
    return res.json({
      movies: cachedResult.movies,
      html,
      hasMore: cachedResult.hasMore,
      source: 'cache'
    });
  }
  
  // Fallback to current implementation if cache miss
  // ... existing logic
});
```

## Solution 3: Client-Side Pagination with Smart Prefetching

### Implementation:
```javascript
// Enhanced LoadMoreManager with prefetching
class SmartLoadMoreManager extends LoadMoreManager {
  constructor(config) {
    super(config);
    this.prefetchBuffer = [];
    this.prefetchInProgress = false;
  }

  async loadMore() {
    if (this.isLoading || !this.hasMore) return;

    // Check if we have prefetched data
    if (this.prefetchBuffer.length > 0) {
      const prefetchedData = this.prefetchBuffer.shift();
      this.displayMovies(prefetchedData);
      
      // Start prefetching next batch in background
      this.prefetchNext();
      return;
    }

    // Normal load if no prefetched data
    return super.loadMore();
  }

  async prefetchNext() {
    if (this.prefetchInProgress) return;
    
    this.prefetchInProgress = true;
    
    try {
      const nextPage = this.currentPage + this.prefetchBuffer.length;
      const params = new URLSearchParams({
        page: nextPage,
        displayedMovieIds: Array.from(this.displayedMovieIds).join(','),
        ...this.config.params
      });
      
      const response = await fetch(`${this.config.endpoint}?${params}`);
      const data = await response.json();
      
      if (data.movies && data.movies.length > 0) {
        this.prefetchBuffer.push(data);
      }
    } catch (error) {
      console.warn('Prefetch failed:', error);
    } finally {
      this.prefetchInProgress = false;
    }
  }
}
```

## Solution 4: Database-Style Pagination

### Implementation:
```javascript
// Create a temporary in-memory "database" for sorted movies
class MoviePaginationService {
  constructor() {
    this.sortedCollections = new Map();
    this.lastRefresh = new Map();
  }

  async getSortedPage(sortBy, page, pageSize = 20, excludeIds = []) {
    const collectionKey = `upcoming_${sortBy}`;
    
    // Check if we need to refresh this collection
    if (this.needsRefresh(collectionKey)) {
      await this.refreshCollection(collectionKey, sortBy);
    }
    
    const collection = this.sortedCollections.get(collectionKey);
    if (!collection) {
      throw new Error('Collection not available');
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
      currentPage: page
    };
  }

  async refreshCollection(collectionKey, sortBy) {
    console.log(`Refreshing collection: ${collectionKey}`);
    
    // Fetch all movies for this sort type
    const allMovies = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= 50) { // Cap at 50 pages
      try {
        const response = await getExtendedUpcomingMovies(page, "US", sortBy);
        const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
        const filtered = filterMovies(processed, { type: 'upcoming' });
        
        allMovies.push(...filtered);
        
        hasMore = page < response.total_pages;
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        break;
      }
    }
    
    // Deduplicate and sort
    const deduplicated = deduplicateMovies(allMovies, []);
    const sorted = sortMovies(deduplicated, sortBy);
    
    // Store in memory
    this.sortedCollections.set(collectionKey, sorted);
    this.lastRefresh.set(collectionKey, Date.now());
    
    console.log(`Collection ${collectionKey} refreshed with ${sorted.length} movies`);
  }

  needsRefresh(collectionKey) {
    const lastRefresh = this.lastRefresh.get(collectionKey);
    if (!lastRefresh) return true;
    
    const refreshInterval = 15 * 60 * 1000; // 15 minutes
    return Date.now() - lastRefresh > refreshInterval;
  }
}
```

## Performance Comparison

| Solution | Response Time | Memory Usage | API Calls | Complexity |
|----------|---------------|--------------|-----------|------------|
| Current | 4-10s | 3MB+ | 10-20 | Medium |
| Streaming | 1-2s initial | 500KB | 10-20 | High |
| Caching | <100ms | 10MB (shared) | 0 (after warm) | Medium |
| Smart Prefetch | <100ms | 1MB | Same (async) | Medium |
| Pagination Service | <50ms | 15MB (shared) | 0 (after warm) | Low |

## Recommended Implementation Order

1. **Immediate**: Implement Solution 4 (Pagination Service) - Lowest complexity, highest impact
2. **Short-term**: Add Solution 3 (Smart Prefetching) for better UX
3. **Medium-term**: Implement Solution 2 (Background Caching) for scalability
4. **Long-term**: Consider Solution 1 (Streaming) for real-time updates

## Monitoring & Metrics

### Key Performance Indicators:
```javascript
// Add to existing endpoints
const performanceMetrics = {
  requestStartTime: Date.now(),
  tmdbApiCalls: 0,
  moviesProcessed: 0,
  memoryUsage: process.memoryUsage(),
  cacheHitRate: 0
};

// Log at request completion
console.log('Load-more performance:', {
  duration: Date.now() - performanceMetrics.requestStartTime,
  apiCalls: performanceMetrics.tmdbApiCalls,
  moviesProcessed: performanceMetrics.moviesProcessed,
  memoryDelta: process.memoryUsage().heapUsed - performanceMetrics.memoryUsage.heapUsed
});
```

## Success Criteria

- **Response Time**: < 500ms for cached requests, < 2s for fresh requests
- **Memory Usage**: < 500KB per request
- **API Efficiency**: < 5 TMDB calls per load-more request
- **User Experience**: Perceived load time < 200ms with prefetching