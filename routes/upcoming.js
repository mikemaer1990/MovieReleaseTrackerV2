const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { processMoviesWithDates, filterMovies, sortMovies, deduplicateMovies } = require("../services/movie-processor");
const { getExtendedUpcomingMovies, getGenres } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");
router.get("/upcoming", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;
  const moviesPerPage = 20;
  const now = toUtcMidnight(new Date());

  try {
    let pageMovies = [];
    let initialPagesUsed = 0;

    // For date-based sorting: fetch more pages and sort properly
    if (sortBy === 'release_date_asc' || sortBy === 'release_date_desc') {
      // Fetch larger batch for proper date sorting
      let collectedMovies = [];
      let tmdbPage = 1;
      const maxPagesToFetch = 15; // Fetch more pages for better sorting and larger buffer
      
      while (tmdbPage <= maxPagesToFetch) {
        const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);
        const results = response.results;
        
        // Process movies with dates using the centralized service
        const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
        
        // Filter movies that can be followed
        const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
        
        collectedMovies.push(...filteredMovies);
        tmdbPage++;
        
        if (tmdbPage > response.total_pages) break;
      }
      
      // Deduplicate the entire collection
      const deduplicatedMovies = deduplicateMovies(collectedMovies, []);
      
      // Sort the entire collection properly by date
      const sortedMovies = sortMovies(deduplicatedMovies, sortBy);
      
      // Take first page from sorted results
      pageMovies = sortedMovies.slice(0, moviesPerPage);
      
      // Store how many pages we used for load-more to use the same approach
      initialPagesUsed = tmdbPage - 1;
      
    } else {
      // For non-date sorting (popularity): use existing sequential approach
      let collectedMovies = [];
      let tmdbPage = 1;
      let totalTmdbPages = 1;
      const maxPagesToFetch = 10;
      
      // Collect movies until we have enough for initial load
      while (
        collectedMovies.length < moviesPerPage &&
        tmdbPage <= maxPagesToFetch
      ) {
        const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);

        totalTmdbPages = response.total_pages;
        const results = response.results;

        // Process movies with dates using the centralized service
        const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
        
        // Filter movies that can be followed and deduplicate using shared utility
        const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
        const newFiltered = deduplicateMovies(filteredMovies, collectedMovies);

        collectedMovies.push(...newFiltered);
        tmdbPage++;

        if (tmdbPage > totalTmdbPages) break;
      }

      // Take exactly the number of movies we want
      pageMovies = collectedMovies.slice(0, moviesPerPage);
      
      // Store which TMDB pages were used for initial load in session/cache
      initialPagesUsed = tmdbPage - 1;
    }

    let user = null;
    let followedMovieIds = [];

    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };

      // Get followed movies (caching handled by service layer)
      const followedRecords = await getFollowedMoviesByUserId(req.session.userId);

      followedMovieIds = followedRecords.map((record) =>
        Number(record.fields.TMDB_ID)
      );
    }

    // Get genres for filter dropdown using centralized service
    const genresResponse = await getGenres();
    const genres = genresResponse.genres || [];

    res.locals.page = "upcoming";
    res.render("upcoming", {
      title: "Upcoming Movies - Movie Tracker",
      movies: pageMovies,
      user,
      followedMovieIds,
      followMessage,
      sortBy,
      genre,
      genres,
      query: "",
      loginRedirect: "/upcoming",
      initialLoad: true, // Flag to indicate this is initial load
      initialPagesUsed: initialPagesUsed, // Track which TMDB pages were consumed
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "release_date_asc", label: "Soonest First" },
        { value: "release_date_desc", label: "Furthest First" },
      ],
    });
  } catch (err) {
    console.error("TMDB upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
