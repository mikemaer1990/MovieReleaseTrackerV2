# Current Caching & Pagination Configuration

This document provides comprehensive technical documentation for the Movie Release Tracker's advanced pagination and caching system.

## System Overview

The application implements a **hybrid pagination and caching system** with multiple optimization strategies, cache warming, and real-time expansion capabilities designed to provide instant response times while handling large datasets efficiently.

## Architecture Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend       │    │   TMDB API      │
│  (load-more.js) │────│  (pagination.js) │────│   (External)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │  Cache Layers   │              │
         │              │  - Popularity   │              │
         │              │  - Date Sorted  │              │
         │              │  - Releases     │              │
         │              │  - Metadata     │              │
         │              └─────────────────┘              │
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                        ┌─────────────────┐
                        │  User Interface │
                        │  (EJS Templates)│
                        └─────────────────┘
```

## Configuration Values

### Core Pagination Settings
| Configuration | Value | Purpose |
|---------------|-------|---------|
| `targetBatchSize` | 20 | Movies per page (standard across all endpoints) |
| `targetBatches` | 10 | Target batches for initial cache (200 movies total) |
| `maxExpansionLevel` | 10 | Maximum cache expansion cycles (unlimited scrolling) |
| `expansionTTL` | 10 minutes | TTL for expanded cache collections |
| `maxPages` | 30 | Safety limit for TMDB API calls |

### Cache TTL Settings
| Cache Type | TTL | Justification |
|------------|-----|---------------|
| Popularity Cache | 30 minutes | Stable data, infrequent changes |
| Date-sorted Cache | 5 minutes | Accuracy critical for chronological order |
| Releases Cache | 30 minutes | Streaming releases change infrequently |
| General Cache | 10 minutes | Balance between freshness and performance |
| User Data Cache | 10 minutes | Follow status and user preferences |

### API Rate Limiting
| Setting | Value | Purpose |
|---------|-------|---------|
| `rateLimitDelay` | 250ms | Compliance with TMDB API limits |
| `maxRetries` | 3 | Exponential backoff for 429 errors |
| `baseDelay` | 1000ms | Base delay for retry logic |
| `concurrentRequests` | 5 | Bulk processor concurrency limit |

## Frontend Implementation (`public/js/load-more.js`)

### LoadMoreManager Configuration
```javascript
class LoadMoreManager {
  constructor(config) {
    this.config = {
      endpoint: config.endpoint,           // API endpoint for page
      initialPage: config.initialPage || 2, // Start from page 2
      params: config.params || {},         // Page-specific parameters
      buttonId: config.buttonId || 'loadMoreBtn',
      gridSelector: config.gridSelector || '.results-grid',
      countSelector: config.countSelector || '#moviesCount'
    };

    this.displayedMovieIds = new Set();   // Deduplication tracking
  }
}
```

### Page-Specific Configuration
```javascript
// Upcoming Movies
if (path === '/upcoming') {
  return {
    endpoint: '/load-more-upcoming',
    params: {
      sort: urlParams.get('sort') || 'popularity',
      genre: urlParams.get('genre') || '',
      initialPagesUsed: window.initialPagesUsed || 3
    }
  };
}

// Top Releases
if (path === '/top-releases') {
  return {
    endpoint: '/load-more-releases',
    params: {
      sort: urlParams.get('sort') || 'popularity',
      genre: urlParams.get('genre') || '',
      initialPagesUsed: window.initialPagesUsed || 3
    }
  };
}

// Search Results
if (path === '/search') {
  return {
    endpoint: '/load-more-search',
    params: {
      query: urlParams.get('query')
    }
  };
}
```

### Loading State Management
```javascript
setLoadingStateWithMessage(expansionType) {
  const loadText = this.loadMoreBtn.querySelector('.load-text');

  switch (expansionType) {
    case 'synchronous':
      loadText.textContent = 'Finding more movies...';
      break;
    case 'background':
      loadText.textContent = 'Expanding collection...';
      break;
    case 'cache_insufficient':
      loadText.textContent = 'Building fresh results...';
      break;
    default:
      loadText.textContent = 'Loading more movies...';
  }
}
```

## Backend Implementation (`services/movie-pagination.js`)

### Core Configuration
```javascript
class MoviePaginationService {
  constructor() {
    // Cache refresh and cleanup
    this.refreshInterval = 15 * 60 * 1000;        // 15 minutes
    this.maxPages = 30;                           // Safety limit
    this.popularityWarmPages = 5;                 // Base pages for popularity

    // Pagination configuration
    this.targetBatchSize = 20;                    // Standard page size
    this.targetBatches = 10;                      // Target 200 movies

    // Cache expansion settings
    this.maxExpansionLevel = 10;                  // Unlimited scrolling
    this.expansionTTL = 10 * 60 * 1000;         // 10 minutes

    // Cache collections
    this.popularityCache = new Map();             // 30-minute TTL
    this.sortedCollections = new Map();           // 5-minute TTL
    this.releasesPopularityCache = new Map();     // 30-minute TTL
    this.cacheExpansions = new Map();             // Expansion tracking
    this.expansionInProgress = new Map();         // Concurrency control
  }
}
```

### Cache Warming Strategy
```javascript
async preloadCollections() {
  console.log('🚀 Initializing performance optimizations...');
  console.log('Preloading movie collections with hybrid strategy...');

  // Priority 1: Instant startup (popularity caches)
  await Promise.all([
    this.warmPopularityCache(null),        // Upcoming movies
    this.warmReleasesPopularityCache(null) // Streaming releases
  ]);

  // Priority 2: Background warming (5-second delay)
  setTimeout(async () => {
    await Promise.all([
      this.fetchDateSortedMovies('release_date_asc', 15, null),
      this.fetchDateSortedMovies('release_date_desc', 15, null)
    ]);
  }, 5000);

  // Priority 3: Extended collections (7-second delay)
  setTimeout(async () => {
    await this.fetchStreamingReleases('popularity', 25, null);
  }, 7000);
}
```

### Cache Expansion Logic
```javascript
shouldExpandCache(cacheKey, requestedPage, pageSize, totalMovies) {
  // Proactive expansion with 2-page buffer
  const requiredMovies = requestedPage * pageSize;
  const bufferMovies = (requestedPage + 2) * pageSize;
  const hasProactiveBuffer = totalMovies >= bufferMovies;

  if (hasProactiveBuffer) {
    return false; // Current cache has sufficient buffer
  }

  // Check expansion limits
  const currentLevel = this.cacheExpansions.get(cacheKey) || 0;
  if (currentLevel >= this.maxExpansionLevel) {
    return false; // Already at maximum expansion
  }

  // Check if expansion already in progress
  if (this.expansionInProgress.get(cacheKey)) {
    return false; // Already expanding
  }

  return true; // Expansion needed and possible
}
```

### Progressive Expansion Strategy
```javascript
async expandCache(cacheKey, sortBy, genre = null) {
  const currentLevel = this.cacheExpansions.get(cacheKey) || 0;

  // Calculate new page count based on expansion level
  const basePages = sortBy === 'popularity' ? this.popularityWarmPages : 8;
  const newPageCount = basePages + (currentLevel + 1) * 10;

  // Progression: 5→15→25→35 (popularity) or 8→18→28→38 (dates)
  console.log(`Expanding cache ${cacheKey} from level ${currentLevel} to ${currentLevel + 1} (${newPageCount} pages)`);

  // Perform expansion...
  this.cacheExpansions.set(cacheKey, currentLevel + 1);
}
```

## API Endpoints (`routes/api/load-more.js`)

### Endpoint Configuration
```javascript
// Load More Releases (/load-more-releases)
router.get("/load-more-releases", dataRetrievalLimiter, async (req, res) => {
  const page = parseInt(req.query.page) || 2;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;
  const moviesPerPage = 20;

  const paginationResult = await moviePaginationService.getReleasesSortedPage(
    sortBy, page, moviesPerPage, displayedMovieIds, genre
  );

  // Response includes expansion metadata
  const responseData = createLoadMoreResponse(pageMovies, html, {
    hasMore: paginationResult.hasMore,
    currentPage: page,
    moviesPerPage,
    totalCount: paginationResult.totalCount,
    collectionSize: paginationResult.collectionSize,
    source: paginationResult.source,
    synchronousExpansion: paginationResult.synchronousExpansion,
    expansionType: paginationResult.expansionType
  });
});
```

### Error Handling Configuration
```javascript
// 429 Rate Limiting Handling
if (error.response?.status === 429) {
  const retryAfter = error.response.headers['retry-after'] || 60;
  return res.status(429).json({
    success: false,
    message: 'Too many requests to movie database. Please try again in a moment.',
    retryAfter: parseInt(retryAfter),
    rateLimited: true,
    movies: [],
    hasMore: true // Encourage retry
  });
}
```

## Cache Types & Strategies

### 1. Popularity Cache (`popularityCache`)
- **Purpose**: Instant response for most popular upcoming movies
- **TTL**: 30 minutes
- **Size**: 200 movies (10 batches)
- **Warming**: Startup priority 1
- **Usage**: `/upcoming?sort=popularity`

### 2. Date-Sorted Collections (`sortedCollections`)
- **Purpose**: Chronologically accurate movie listings
- **TTL**: 5 minutes (accuracy critical)
- **Size**: Variable based on TMDB availability
- **Warming**: Background (5-second delay)
- **Usage**: `/upcoming?sort=release_date_asc|desc`

### 3. Releases Cache (`releasesPopularityCache`)
- **Purpose**: Streaming/digital releases from past 6 months
- **TTL**: 30 minutes
- **Size**: 200 movies (10 batches)
- **Warming**: Startup priority 1
- **Usage**: `/top-releases?sort=popularity`

### 4. Metadata Cache (`movie-metadata-cache.js`)
- **Purpose**: Lightweight movie details caching
- **Size**: 1000 movies (LRU eviction)
- **TTL**: 1 hour persistent, 30 minutes memory
- **Features**: Access tracking, batch processing integration

## Memory Management

### Automatic Cleanup
```javascript
// Stale collection cleanup (every 30 minutes)
setInterval(() => {
  this.cleanupStaleCollections();
}, 30 * 60 * 1000);

cleanupStaleCollections() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [key, timestamp] of this.collectionTimes.entries()) {
    if (now - timestamp > maxAge) {
      this.sortedCollections.delete(key);
      this.collectionTimes.delete(key);
      console.log(`Cleaned up stale collection: ${key}`);
    }
  }
}
```

### LRU Eviction (Metadata Cache)
```javascript
// LRU eviction when cache exceeds 1000 movies
evictLRU() {
  while (this.cache.size >= this.maxSize) {
    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}
```

## Performance Optimization Features

### 1. Startup Cache Warming
- **Goal**: Instant response times for first page loads
- **Strategy**: Warm most popular caches immediately on startup
- **Coverage**: Popularity caches for upcoming and streaming movies

### 2. Background Expansion
- **Goal**: Seamless unlimited scrolling
- **Strategy**: Expand cache in background before user reaches end
- **Trigger**: 2-page buffer (proactive expansion)

### 3. Intelligent Routing
- **Goal**: Optimal performance per sort type
- **Strategy**: Different caching strategies based on data characteristics
- **Implementation**: Popularity (cached) vs. Dates (real-time)

### 4. API Rate Limiting
- **Goal**: TMDB API compliance and reliability
- **Strategy**: 250ms delays, exponential backoff, concurrent limits
- **Features**: Retry logic, error recovery, graceful degradation

## Monitoring & Debugging

### Cache Status Logging
```javascript
// Cache warming progress
console.log(`Cache warming progress: ${filteredMovies.length} filtered movies from ${page} pages (target: ${targetMovies})`);

// Expansion notifications
console.log(`Expanding cache ${cacheKey} from level ${currentLevel} to ${currentLevel + 1} (${newPageCount} pages)`);

// Performance metrics
console.log(`Cache hit: ${cacheKey} (${movies.length} movies, ${Date.now() - startTime}ms)`);
```

### Frontend Debug Information
```javascript
// Expansion debug info in console
if (data.synchronousExpansion || data.expansionType) {
  console.log('Cache expansion info:', {
    synchronousExpansion: data.synchronousExpansion,
    expansionType: data.expansionType,
    moviesReturned: data.movies?.length || 0,
    totalCount: data.totalCount,
    source: data.source
  });
}
```

## Configuration Tuning Guidelines

### Increasing Cache Size
To increase initial cache size, modify `targetBatches`:
```javascript
// In services/movie-pagination.js
this.targetBatches = 15; // 15 * 20 = 300 movies instead of 200
```

### Adjusting Expansion Levels
To allow more expansion cycles:
```javascript
// In services/movie-pagination.js
this.maxExpansionLevel = 20; // Allow 20 expansion levels instead of 10
```

### Modifying TTL Values
```javascript
// Different TTL for different cache types
const popularityTTL = 45 * 60 * 1000; // 45 minutes instead of 30
const dateTTL = 3 * 60 * 1000;        // 3 minutes instead of 5
```

### API Rate Limiting Adjustments
```javascript
// In services/movie-pagination.js
await new Promise(resolve => setTimeout(resolve, 150)); // 150ms instead of 250ms
```

## Troubleshooting Common Issues

### Cache Miss Performance
- **Symptom**: Slow response times on certain pages
- **Solution**: Increase cache warming coverage or reduce TTL for freshness
- **Monitoring**: Check cache hit/miss ratios in logs

### Memory Usage
- **Symptom**: High memory consumption
- **Solution**: Reduce cache sizes or increase cleanup frequency
- **Monitoring**: Monitor collection sizes and cleanup logs

### API Rate Limiting
- **Symptom**: 429 errors from TMDB API
- **Solution**: Increase delays between API calls or reduce concurrent requests
- **Monitoring**: Check retry logic activation in logs

### Expansion Failures
- **Symptom**: Load more stops working after many pages
- **Solution**: Check expansion level limits and memory cleanup
- **Monitoring**: Track expansion level progression in logs

This configuration provides a balance between performance, memory usage, and API compliance while supporting unlimited scrolling and instant response times for the most common use cases.