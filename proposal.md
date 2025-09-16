     ╭───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
     │ Fix Chronological Order Breaking After 200+ Movies                                                                        │
     │                                                                                                                           │
     │ Root Cause: Two different cache expansion methods that conflict:                                                          │
     │ 1. Initial cache uses fetchStreamingReleases('newest', pages, genre) - works correctly                                    │
     │ 2. Cache expansion uses inline incremental building - breaks chronological order                                          │
     │                                                                                                                           │
     │ Solution: Replace inconsistent inline cache expansion with proven fetchStreamingReleases() method.                        │
     │                                                                                                                           │
     │ Changes Required:                                                                                                         │
     │                                                                                                                           │
     │ File: services/movie-pagination.js (lines 891-937)                                                                        │
     │                                                                                                                           │
     │ Before: Inline cache expansion with manual API calls and accumulation                                                     │
     │ // Expand releases cache with incremental building (like upcoming)                                                        │
     │ for (let page = 1; page <= newPageCount; page++) {                                                                        │
     │   // Manual discoverMovies() calls + accumulation                                                                         │
     │ }                                                                                                                         │
     │ const sorted = sortMovies(expandedMovies, 'newest');                                                                      │
     │                                                                                                                           │
     │ After: Use proven fetchStreamingReleases() method                                                                         │
     │ // Expand releases cache using proven method (like initial warming)                                                       │
     │ expandedMovies = await this.fetchStreamingReleases('newest', newPageCount, genre);                                        │
     │                                                                                                                           │
     │ Why This Fix Works:                                                                                                       │
     │                                                                                                                           │
     │ 1. Consistency: Uses same data source as initial cache warming                                                            │
     │ 2. Proven Method: fetchStreamingReleases() already handles chronological sorting correctly                                │
     │ 3. Simplified Logic: Removes complex inline accumulation that causes ordering issues                                      │
     │ 4. API Reliability: Uses popularity-based TMDB fetching with client-side sorting (more reliable than TMDB's date sorting) │
     │                                                                                                                           │
     │ Expected Results:                                                                                                         │
     │                                                                                                                           │
     │ - ✅ Chronological order maintained throughout entire pagination                                                           │
     │ - ✅ No more out-of-order movies after 200+ results                                                                        │
     │ - ✅ Consistent behavior between initial cache and expansions                                                              │
     │ - ✅ Faster expansion (reuses optimized method)                                                                            │
     ╰───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯

> will this break things taht are currently working with both routes?

● Great question! Let me analyze the impact on all existing functionality to ensure this fix won't break anything currently working.

Impact Analysis: What This Fix Affects

Current Usage of Cache Expansion

Let me check what routes currently use the cache expansion logic:

1. Top Releases (/top-releases with sort=newest)
2. Upcoming Page (uses different cache expansion - won't be affected)
3. Load-More APIs (/load-more-releases, /load-more-upcoming)

Risk Assessment

❌ POTENTIAL RISK: The fix changes the cache expansion behavior from:

- Current: Manual API calls with sort_by: "release_date.desc"
- Proposed: Using fetchStreamingReleases('newest', newPageCount, genre)

🔍 Key Difference: fetchStreamingReleases() uses:

- TMDB API with sort_by: "popularity.desc"
- Then applies client-side sorting with applyUnifiedFiltering()

What Could Break

1. Movie Pool Differences: The two methods might fetch slightly different sets of movies from TMDB
2. Performance Impact: fetchStreamingReleases() includes additional processing steps
3. Genre Filtering: Need to ensure genre filtering works identically

Safer Alternative Approach

Instead of completely replacing the expansion method, I should:

1. Fix the root issue: The problem is that movies from different TMDB pages with sort_by: "release_date.desc" have overlapping dates
2. Keep the same data source: Continue using the same API calls
3. Fix the sorting: Apply sorting after EACH page instead of only at the end

This would:

- ✅ Maintain exact same movie pool
- ✅ Keep same performance characteristics
- ✅ Fix the chronological order issue
- ✅ Minimal risk of breaking existing functionality

Would you prefer the safer approach that fixes the sorting logic while keeping the same data source, or should we proceed with the more comprehensive fix using fetchStreamingReleases()?
