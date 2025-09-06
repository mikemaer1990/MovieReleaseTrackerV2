const express = require("express");
const router = express.Router();
const { processMoviesWithDates, filterMovies, sortMovies } = require("../services/movie-processor");
const { discoverMovies, getGenres } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");

const RESULTS_PER_PAGE = 20; // Consistent results per page

router.get("/test-top-releases", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;

  try {
    const now = toUtcMidnight(new Date());
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let allValidMovies = [];
    let tmdbPage = 1;

    // Load initial batch only (first 20 movies)
    const initialLimit = RESULTS_PER_PAGE;
    // Increase pages when filtering to account for genre filtering reducing results
    // For rating sorts, fetch more pages to get a better selection pool
    let maxPagesToFetch = 3;
    if (genre) maxPagesToFetch = 8;
    if (sortBy === 'rating') maxPagesToFetch = Math.max(maxPagesToFetch, 6);

    // Always fetch by popularity first to get a good mix of movies
    // We'll do the rating sorting client-side after filtering
    let tmdbSortBy = "popularity.desc";
    switch (sortBy) {
      case "rating":
        // Don't sort by rating server-side - we'll sort client-side after filtering
        tmdbSortBy = "popularity.desc";
        break;
      case "newest":
        // Use popularity for server-side, then sort by streamingDate client-side
        tmdbSortBy = "popularity.desc";
        break;
      case "popularity":
      default:
        tmdbSortBy = "popularity.desc";
        break;
    }

    // Keep fetching until we have enough valid movies for initial load
    while (
      allValidMovies.length < initialLimit &&
      tmdbPage <= maxPagesToFetch
    ) {
      // Build API params - include genre in TMDB call if specified
      const apiParams = {
        api_key: process.env.TMDB_API_KEY,
        page: tmdbPage,
        region: "US",
        sort_by: tmdbSortBy,
        "primary_release_date.gte": sixMonthsAgo.toISOString().split('T')[0],
        "primary_release_date.lte": now.toISOString().split('T')[0],
        with_release_type: "4|5", // Digital and Physical releases
      };

      // Add genre filter to TMDB API call for better server-side filtering
      if (genre) {
        apiParams.with_genres = genre;
      }

      const response = await discoverMovies(apiParams);

      let results = response.results;

      // Process movies with dates using the centralized service
      const processedMovies = await processMoviesWithDates(results, { type: 'releases' });

      // Filter for movies with recent streaming releases
      const validMovies = filterMovies(processedMovies, { type: 'releases' });
      
      allValidMovies = allValidMovies.concat(validMovies);
      tmdbPage++;
    }

    // Apply improved filtering and sorting for rating-based sorts
    if (sortBy === 'rating') {
      // Filter out movies with very few votes and suspicious perfect ratings
      const qualityMovies = allValidMovies.filter(movie => 
        movie.vote_count >= 10 && movie.rating <= 9.8
      );
      
      // Use quality movies if we have enough, otherwise fall back to all movies
      const moviesToSort = qualityMovies.length >= 15 ? qualityMovies : allValidMovies;
      
      // Sort purely by rating first, with vote count as secondary factor for ties
      allValidMovies = moviesToSort.sort((a, b) => {
        // Primary sort: rating (highest first)
        const ratingCompare = b.rating - a.rating;
        if (ratingCompare !== 0) return ratingCompare;
        
        // Secondary sort: vote count (more votes = higher confidence)
        const voteCompare = b.vote_count - a.vote_count;
        if (voteCompare !== 0) return voteCompare;
        
        // Tertiary sort: movie ID for consistency
        return a.id - b.id;
      });
    } else {
      // Use centralized service for other sorting types
      allValidMovies = sortMovies(allValidMovies, sortBy);
    }

    // Take only the initial batch
    const initialMovies = allValidMovies.slice(0, initialLimit);

    // Get user info for display purposes only
    let user = null;
    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };
    }

    // Get genres for filter dropdown using centralized service
    const genresResponse = await getGenres();
    const genres = genresResponse.genres || [];

    res.locals.page = "test-top-releases";
    res.render("top-releases", {
      title: "TEST: Top Streaming Releases - Movie Tracker",
      movies: initialMovies,
      user,
      followMessage,
      sortBy,
      genre,
      genres,
      initialLoad: true, // Flag to indicate this is initial load
      initialPagesUsed: tmdbPage - 1, // Track how many TMDB pages were consumed
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "rating", label: "Highest Rated" },
        { value: "newest", label: "Newest First" },
      ],
      // Add a test flag to differentiate in the template
      isTestRoute: true,
    });
  } catch (err) {
    console.error("TMDB test top releases error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;