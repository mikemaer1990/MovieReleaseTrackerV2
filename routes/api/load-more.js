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
    const moviePaginationService = require("../../services/movie-pagination");

    const page = parseInt(req.query.page) || 2;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    const moviesPerPage = 20;

    // Parse displayed movie IDs to exclude them
    const displayedMovieIds = req.query.displayedMovieIds
      ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
      : [];

    // Use pagination service for fast response
    const paginationResult = await moviePaginationService.getReleasesSortedPage(
      sortBy,
      page,
      moviesPerPage,
      displayedMovieIds,
      genre
    );

    const pageMovies = paginationResult.movies;
    const hasMore = paginationResult.hasMore;

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

    // Create standardized response with pagination metadata
    const responseData = createLoadMoreResponse(pageMovies, html, {
      hasMore: paginationResult.hasMore,
      currentPage: page,
      moviesPerPage,
      totalCount: paginationResult.totalCount,
      collectionSize: paginationResult.collectionSize,
      source: paginationResult.source,
      synchronousExpansion: paginationResult.synchronousExpansion,
      expansionType: paginationResult.expansionType,
      displayedMovieIds: displayedMovieIds // Pass actual displayed movie IDs for accurate count
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
    const moviePaginationService = require("../../services/movie-pagination");
    
    const page = parseInt(req.query.page) || 2;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    const moviesPerPage = 20;
    
    // Parse displayed movie IDs to exclude them
    const displayedMovieIds = req.query.displayedMovieIds 
      ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
      : [];
    
    // Use pagination service for fast response
    const paginationResult = await moviePaginationService.getSortedPage(
      sortBy, 
      page, 
      moviesPerPage, 
      displayedMovieIds, 
      genre
    );

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
    const html = await renderMovieCards(req, paginationResult.movies, {
      showFollowButton: true,
      user: req.session?.userId ? { id: req.session.userId, name: req.session.userName } : null,
      followedMovieIds,
      loginRedirect: '/upcoming',
      templatePath: 'partials/_results-movie-card'
    });

    // Create standardized response with pagination metadata
    const responseData = createLoadMoreResponse(paginationResult.movies, html, {
      hasMore: paginationResult.hasMore,
      currentPage: page,
      moviesPerPage,
      totalCount: paginationResult.totalCount,
      collectionSize: paginationResult.collectionSize,
      source: paginationResult.source,
      synchronousExpansion: paginationResult.synchronousExpansion,
      expansionType: paginationResult.expansionType,
      displayedMovieIds: displayedMovieIds // Pass actual displayed movie IDs for accurate count
    });

    res.json(responseData);

  } catch (error) {
    console.error('Load-more upcoming error:', error);
    
    // Fallback to original implementation
    // Use the original load-more logic inline
    const page = parseInt(req.query.page) || 2;
    const initialPagesUsed = parseInt(req.query.initialPagesUsed) || 3;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    const moviesPerPage = 20;
    
    let pageMovies = [];
    let hasMore = false;

    try {
      // Use original adaptive expansion logic as fallback
      if (sortBy === 'release_date_asc' || sortBy === 'release_date_desc') {
        const displayedMovieIds = req.query.displayedMovieIds 
          ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
          : [];
        
        const moviesNeeded = moviesPerPage * 2;
        let collectedMovies = [];
        let tmdbPage = 1;
        let totalTmdbPages = Infinity;
        let pagesPerBatch = 10;
        
        while (collectedMovies.length < 200 && tmdbPage <= totalTmdbPages) {
          const batchEndPage = Math.min(tmdbPage + pagesPerBatch - 1, totalTmdbPages);
          
          for (let currentPage = tmdbPage; currentPage <= batchEndPage; currentPage++) {
            const response = await getExtendedUpcomingMovies(currentPage, "US", sortBy);
            const results = response.results;
            totalTmdbPages = response.total_pages;
            
            if (!results || results.length === 0) break;
            
            const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
            const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
            const newFilteredMovies = deduplicateMovies(filteredMovies, collectedMovies);
            collectedMovies.push(...newFilteredMovies);
            
            if (currentPage >= totalTmdbPages) break;
          }
          
          tmdbPage = batchEndPage + 1;
          collectedMovies = deduplicateMovies(collectedMovies, []);
          
          const newMoviesCount = collectedMovies.filter(movie => !displayedMovieIds.includes(movie.id)).length;
          if (newMoviesCount >= moviesNeeded || tmdbPage > totalTmdbPages) break;
          
          pagesPerBatch = Math.min(pagesPerBatch * 1.5, 20);
        }
        
        const deduplicatedMovies = deduplicateMovies(collectedMovies, []);
        const sortedMovies = sortMovies(deduplicatedMovies, sortBy);
        const newMovies = sortedMovies.filter(movie => !displayedMovieIds.includes(movie.id));
        
        pageMovies = newMovies.slice(0, moviesPerPage);
        hasMore = (newMovies.length > moviesPerPage) || (tmdbPage <= totalTmdbPages);
        
      } else {
        // Popularity-based sorting fallback
        const displayedMovieIds = req.query.displayedMovieIds 
          ? req.query.displayedMovieIds.split(',').map(id => parseInt(id))
          : [];

        let collectedMovies = [];
        let tmdbPage = initialPagesUsed + (page - 1);
        let totalTmdbPages = Infinity;

        while (collectedMovies.length < moviesPerPage && tmdbPage <= totalTmdbPages) {
          const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);
          totalTmdbPages = response.total_pages;

          const processedMovies = await processMoviesWithDates(response.results, { type: 'upcoming' });
          const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
          const deduplicatedFromCollection = deduplicateMovies(filteredMovies, collectedMovies);
          const newMovies = deduplicatedFromCollection.filter(movie => !displayedMovieIds.includes(movie.id));

          collectedMovies.push(...newMovies);
          tmdbPage++;
        }

        pageMovies = collectedMovies.slice(0, moviesPerPage);
        hasMore = tmdbPage <= totalTmdbPages;
      }

      // Get user's followed movies for fallback
      let followedMovieIds = [];
      if (req.session && req.session.userId) {
        try {
          const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
          followedMovieIds = followedMovies.map(record => Number(record.fields.TMDB_ID));
        } catch (error) {
          console.error('Error getting followed movies for fallback:', error);
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

    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      const errorResponse = createErrorResponse("Failed to load more upcoming movies", fallbackError);
      res.status(500).json(errorResponse);
    }
  }
});

module.exports = router;