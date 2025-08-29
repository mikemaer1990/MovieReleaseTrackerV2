const express = require("express");
const router = express.Router();
const axios = require("axios");
const { toUtcMidnight } = require("../../utils/date-helpers");
const { processMoviesWithDates, filterMovies, sortMovies } = require("../../services/movie-processor");
const { renderMovieCards, createLoadMoreResponse, createErrorResponse } = require("../../utils/template-renderer");
const { getFollowedMoviesByUserId } = require("../../services/airtable");

// Load more releases endpoint
router.get("/load-more-releases", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const sortBy = req.query.sort || "popularity";
    const genre = req.query.genre || null;
    
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
      case "oldest":
        tmdbSortBy = "release_date.asc";
        break;
      case "popularity":
      default:
        tmdbSortBy = "popularity.desc";
        break;
    }

    // Fetch the next page directly from TMDB
    const response = await axios.get(
      `https://api.themoviedb.org/3/discover/movie`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          page: page,
          region: "US",
          sort_by: tmdbSortBy,
          "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
          "primary_release_date.lte": now.toISOString().split('T')[0],
          with_release_type: "4|5", // Digital and Physical releases
          ...(genre && { with_genres: genre })
        },
      }
    );

    // Process movies using shared utility
    const processedMovies = await processMoviesWithDates(response.data.results, { type: 'releases' });
    
    // Filter movies using shared utility
    const validMovies = filterMovies(processedMovies, { type: 'releases', genre });
    
    // Apply sorting using shared utility (only if not handled by TMDB)
    const sortedMovies = sortBy !== "popularity" ? sortMovies(validMovies, sortBy) : validMovies;

    // Determine if there are more pages available
    const hasMore = page < response.data.total_pages && page < 100;

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(movie => Number(movie.TMDB_ID));
      } catch (error) {
        console.error('Error getting followed movies for load-more:', error);
      }
    }

    // Render HTML using shared utility
    const html = await renderMovieCards(req, sortedMovies, {
      showFollowButton: true,
      user: req.session?.userId ? { id: req.session.userId, name: req.session.userName } : null,
      followedMovieIds,
      loginRedirect: '/top-releases',
      templatePath: 'partials/_results-movie-card'
    });

    // Create standardized response
    const responseData = createLoadMoreResponse(sortedMovies, html, {
      hasMore,
      currentPage: page,
      moviesPerPage: 20
    });

    res.json(responseData);

  } catch (error) {
    const errorResponse = createErrorResponse("Failed to load more movies", error);
    res.status(500).json(errorResponse);
  }
});

// Load more search results endpoint
router.get("/load-more-search", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const query = req.query.query;

    if (!query) {
      const errorResponse = createErrorResponse("Search query is required");
      return res.status(400).json(errorResponse);
    }

    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query: query,
          page: page,
        },
      }
    );

    // Process movies using shared utility
    const processedMovies = await processMoviesWithDates(response.data.results, { type: 'search' });

    const hasMore = page < response.data.total_pages;

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(movie => Number(movie.TMDB_ID));
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
router.get("/load-more-upcoming", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 2;
    const initialPagesUsed = parseInt(req.query.initialPagesUsed) || 3;
    const moviesPerPage = 20;

    let collectedMovies = [];
    let tmdbPage = initialPagesUsed + ((page - 2) * 3) + 1; // Start after initial pages + offset for this load more request
    let totalTmdbPages = 1;

    // Collect movies until we have enough for this page
    while (
      collectedMovies.length < moviesPerPage &&
      tmdbPage <= (initialPagesUsed + ((page - 1) * 3) + 3) // Allow up to 3 pages per load more
    ) {
      const response = await axios.get(
        `https://api.themoviedb.org/3/movie/upcoming`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            page: tmdbPage,
            region: "US",
          },
        }
      );

      totalTmdbPages = response.data.total_pages;

      // Process movies using shared utility
      const processedMovies = await processMoviesWithDates(response.data.results, { type: 'upcoming' });
      
      // Filter and deduplicate using shared utilities
      const filteredMovies = filterMovies(processedMovies, { type: 'upcoming' });
      const newMovies = filteredMovies.filter(movie => 
        !collectedMovies.some(existing => existing.id === movie.id)
      );

      collectedMovies.push(...newMovies);
      tmdbPage++;

      if (tmdbPage > totalTmdbPages || tmdbPage > 100) break;
    }

    // Take exactly the number of movies we want
    const pageMovies = collectedMovies.slice(0, moviesPerPage);

    const hasMore = tmdbPage <= totalTmdbPages && tmdbPage <= 100;

    // Get user's followed movies for proper follow button rendering
    let followedMovieIds = [];
    if (req.session && req.session.userId) {
      try {
        const followedMovies = await getFollowedMoviesByUserId(req.session.userId);
        followedMovieIds = followedMovies.map(movie => Number(movie.TMDB_ID));
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