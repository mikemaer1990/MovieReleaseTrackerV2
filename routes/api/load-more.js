const express = require("express");
const router = express.Router();
const { dataRetrievalLimiter } = require("../../middleware/rate-limiting");
const { discoverMovies, searchMovies, getExtendedUpcomingMovies } = require("../../services/tmdb");
const { toUtcMidnight } = require("../../utils/date-helpers");
const { processMoviesWithDates, filterMovies, sortMovies, deduplicateMovies } = require("../../services/movie-processor");
const { renderMovieCards, createLoadMoreResponse, createErrorResponse } = require("../../utils/template-renderer");
const { getFollowedMoviesByUserId } = require("../../services/airtable");

// Load more releases endpoint
router.get("/load-more-releases", dataRetrievalLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    const initialPagesUsed = parseInt(req.query.initialPagesUsed) || 3;
    
    const now = toUtcMidnight(new Date());
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Map our sort options to TMDB's sort_by parameter
    let tmdbSortBy = "popularity.desc";
    switch (sortBy) {
      case "rating":
        tmdbSortBy = "vote_average.desc";
        break;
      case "newest":
        tmdbSortBy = "release_date.desc";
        break;
      case "popularity":
      default:
        tmdbSortBy = "popularity.desc";
        break;
    }

    const moviesPerPage = 20;
    let allValidMovies = [];
    let tmdbPage = initialPagesUsed + (page - 1);
    let totalTmdbPages = Infinity;
    const maxPagesToFetch = 5; // Limit to prevent infinite loops

    // Keep fetching until we have enough valid movies for this page
    while (
      allValidMovies.length < moviesPerPage &&
      tmdbPage <= totalTmdbPages &&
      (tmdbPage - (initialPagesUsed + (page - 1))) < maxPagesToFetch
    ) {
      // Build API params
      const apiParams = {
        page: tmdbPage,
        region: "US",
        sort_by: tmdbSortBy,
        "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
        "primary_release_date.lte": now.toISOString().split('T')[0],
        with_release_type: "4|5", // Digital and Physical releases
        ...(genre && { with_genres: genre })
      };

      const response = await discoverMovies(apiParams);
      totalTmdbPages = response.total_pages;

      // Process movies using shared utility
      const processedMovies = await processMoviesWithDates(response.results, { type: 'releases' });
      
      // Filter movies using shared utility
      const validMovies = filterMovies(processedMovies, { type: 'releases', genre });
      
      allValidMovies = allValidMovies.concat(validMovies);
      tmdbPage++;
    }

    // Apply sorting using shared utility (only if not handled by TMDB)
    const sortedMovies = sortBy !== "popularity" ? sortMovies(allValidMovies, sortBy) : allValidMovies;

    // Take exactly the number of movies we want
    const pageMovies = sortedMovies.slice(0, moviesPerPage);

    // Determine if there are more pages available
    const hasMore = tmdbPage <= totalTmdbPages;

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(record => Number(record.fields.TMDB_ID));
      } catch (error) {
        console.error('Error getting followed movies for load-more:', error);
      }
    }

    // Render HTML using shared utility
    const html = await renderMovieCards(req, pageMovies, {
      showFollowButton: true,
      user: req.session?.userId ? { id: req.session.userId, name: req.session.userName } : null,
      followedMovieIds,
      loginRedirect: '/top-releases',
      templatePath: 'partials/_results-movie-card'
    });

    // Create standardized response
    const responseData = createLoadMoreResponse(pageMovies, html, {
      hasMore,
      currentPage: page,
      moviesPerPage
    });

    res.json(responseData);

  } catch (error) {
    const errorResponse = createErrorResponse("Failed to load more movies", error);
    res.status(500).json(errorResponse);
  }
});

// Load more search results endpoint
router.get("/load-more-search", dataRetrievalLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const query = req.query.query;

    if (!query) {
      const errorResponse = createErrorResponse("Search query is required");
      return res.status(400).json(errorResponse);
    }

    const response = await searchMovies(query, page);

    // Process movies using shared utility
    const processedMovies = await processMoviesWithDates(response.results, { type: 'search' });

    const hasMore = page < response.total_pages;

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(record => Number(record.fields.TMDB_ID));
      } catch (error) {
        console.error('Error getting followed movies for load-more:', error);
      }
    }

    // Render HTML using shared utility (passing query for context)
    const html = await renderMovieCards(req, processedMovies, { 
      query,
      showFollowButton: true,
      user: req.session?.userId ? { id: req.session.userId, name: req.session.userName } : null,
      followedMovieIds,
      loginRedirect: `/search?query=${encodeURIComponent(query)}`,
      templatePath: 'partials/_results-movie-card'
    });

    // Create standardized response
    const responseData = createLoadMoreResponse(processedMovies, html, {
      hasMore,
      currentPage: page,
      moviesPerPage: 20
    });

    res.json(responseData);

  } catch (error) {
    const errorResponse = createErrorResponse("Failed to load more search results", error);
    res.status(500).json(errorResponse);
  }
});

// Load more upcoming movies endpoint
router.get("/load-more-upcoming", dataRetrievalLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const initialPagesUsed = parseInt(req.query.initialPagesUsed) || 3;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    const moviesPerPage = 20;
    
    let pageMovies = [];
    let hasMore = false;

    // For date-based sorting: adaptive expansion to fetch all available data
    if (sortBy === 'release_date_asc' || sortBy === 'release_date_desc') {
      // Parse displayed movie IDs to skip them
      const displayedMovieIds = req.query.displayedMovieIds 
        ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
        : [];
      
      // Adaptive expansion: fetch enough pages to ensure we have sufficient movies after filtering
      const moviesNeeded = moviesPerPage * 2; // Buffer for filtering
      let collectedMovies = [];
      let tmdbPage = 1;
      let totalTmdbPages = Infinity;
      let pagesPerBatch = 10; // Start with 10 pages per batch
      
      // Keep fetching batches until we have enough new movies or reach the end
      while (collectedMovies.length < 500 && tmdbPage <= totalTmdbPages) { // Cap at 500 movies total
        // Fetch a batch of pages
        const batchEndPage = Math.min(tmdbPage + pagesPerBatch - 1, totalTmdbPages);
        
        for (let currentPage = tmdbPage; currentPage <= batchEndPage; currentPage++) {
          const response = await getExtendedUpcomingMovies(currentPage, "US", sortBy);
          const results = response.results;
          totalTmdbPages = response.total_pages;
          
          if (!results || results.length === 0) break;
          
          // Process movies with dates using the centralized service
          const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
          
          // Filter movies that can be followed
          const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
          
          // Deduplicate new movies against already collected ones before adding
          const newFilteredMovies = deduplicateMovies(filteredMovies, collectedMovies);
          collectedMovies.push(...newFilteredMovies);
          
          if (currentPage >= totalTmdbPages) break;
        }
        
        tmdbPage = batchEndPage + 1;
        
        // Deduplicate within the collected batch after each batch
        collectedMovies = deduplicateMovies(collectedMovies, []);
        
        // Check if we have enough movies after filtering out displayed ones
        const newMoviesCount = collectedMovies.filter(movie => !displayedMovieIds.includes(movie.id)).length;
        if (newMoviesCount >= moviesNeeded || tmdbPage > totalTmdbPages) break;
        
        // Increase batch size for subsequent fetches (adaptive expansion)
        pagesPerBatch = Math.min(pagesPerBatch * 1.5, 20);
      }
      
      // Final deduplication of the entire collection
      const deduplicatedMovies = deduplicateMovies(collectedMovies, []);
      
      // Sort the entire collection properly by date
      const sortedMovies = sortMovies(deduplicatedMovies, sortBy);
      
      // Filter out already displayed movies
      const newMovies = sortedMovies.filter(movie => !displayedMovieIds.includes(movie.id));
      
      // Take next page worth of movies
      pageMovies = newMovies.slice(0, moviesPerPage);
      
      // Check if there are more movies available
      hasMore = (newMovies.length > moviesPerPage) || (tmdbPage <= totalTmdbPages);
      
    } else {
      // For non-date sorting (popularity): use existing sequential approach
      // Parse displayed movie IDs to prevent duplicates across pagination
      const displayedMovieIds = req.query.displayedMovieIds 
        ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
        : [];

      let collectedMovies = [];
      let tmdbPage = initialPagesUsed + (page - 1); // Simple sequential pagination after initial load
      let totalTmdbPages = Infinity; // Start with no limit, will be updated after first API call

      // Collect movies until we have enough for this page
      while (
        collectedMovies.length < moviesPerPage &&
        tmdbPage <= totalTmdbPages // Continue until we have enough movies or reach the real end
      ) {
        const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);

        totalTmdbPages = response.total_pages;

        // Process movies using shared utility
        const processedMovies = await processMoviesWithDates(response.results, { type: 'upcoming' });
        
        // Filter and deduplicate using shared utilities
        const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
        // First deduplicate against already collected movies in this request
        const deduplicatedFromCollection = deduplicateMovies(filteredMovies, collectedMovies);
        // Then deduplicate against previously displayed movies across all pages
        const newMovies = deduplicatedFromCollection.filter(movie => !displayedMovieIds.includes(movie.id));

        collectedMovies.push(...newMovies);
        tmdbPage++;
      }

      // Take exactly the number of movies we want
      pageMovies = collectedMovies.slice(0, moviesPerPage);

      hasMore = tmdbPage <= totalTmdbPages;
    }

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(record => Number(record.fields.TMDB_ID));
      } catch (error) {
        console.error('Error getting followed movies for load-more:', error);
      }
    }

    // Render HTML using shared utility
    const html = await renderMovieCards(req, pageMovies, {
      showFollowButton: true,
      user: req.session?.userId ? { id: req.session.userId, name: req.session.userName } : null,
      followedMovieIds,
      loginRedirect: '/upcoming',
      templatePath: 'partials/_results-movie-card'
    });

    // Create standardized response
    const responseData = createLoadMoreResponse(pageMovies, html, {
      hasMore,
      currentPage: page,
      moviesPerPage
    });

    res.json(responseData);

  } catch (error) {
    const errorResponse = createErrorResponse("Failed to load more upcoming movies", error);
    res.status(500).json(errorResponse);
  }
});

module.exports = router;