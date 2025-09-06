const express = require("express");
const router = express.Router();
const { processMoviesWithDates, filterMovies, sortMovies } = require("../services/movie-processor");
const { discoverMovies, getGenres } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");

const RESULTS_PER_PAGE = 20; // Consistent results per page

router.get("/top-releases", async (req, res) => {
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
    const maxPagesToFetch = genre ? 8 : 3;

    // Map our sort options to TMDB's sort_by parameter
    let tmdbSortBy = "popularity.desc";
    switch (sortBy) {
      case "rating":
        tmdbSortBy = "vote_average.desc";
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

    // Apply sorting using the centralized service
    allValidMovies = sortMovies(allValidMovies, sortBy);

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

    res.locals.page = "top-releases";
    res.render("top-releases", {
      title: "Top Streaming Releases - Movie Tracker",
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
    });
  } catch (err) {
    console.error("TMDB top releases error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
