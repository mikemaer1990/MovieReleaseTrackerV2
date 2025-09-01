const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { processMoviesWithDates, filterMovies, deduplicateMovies } = require("../services/movie-processor");
const { getUpcomingMovies } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");
router.get("/upcoming", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const moviesPerPage = 20;
  const initialMoviesToLoad = moviesPerPage; // Load only first batch initially
  const now = toUtcMidnight(new Date());

  try {
    let collectedMovies = [];
    let tmdbPage = 1;
    let totalTmdbPages = 1;

    // Collect movies until we have enough for initial load
    while (
      collectedMovies.length < moviesPerPage &&
      tmdbPage <= 5 // Allow up to 5 pages for initial collection
    ) {
      const response = await getUpcomingMovies(tmdbPage, "US");

      totalTmdbPages = response.total_pages;
      const results = response.results;

      // Process movies with dates using the centralized service
      const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
      
      // Filter movies that can be followed and deduplicate using shared utility
      const filteredMovies = filterMovies(processedMovies, { type: 'upcoming' });
      const newFiltered = deduplicateMovies(filteredMovies, collectedMovies);

      collectedMovies.push(...newFiltered);
      tmdbPage++;

      if (tmdbPage > totalTmdbPages) break;
    }

    // Take exactly the number of movies we want
    const pageMovies = collectedMovies.slice(0, moviesPerPage);
    
    // Store which TMDB pages were used for initial load in session/cache
    const initialPagesUsed = tmdbPage - 1;

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

    res.locals.page = "upcoming";
    res.render("upcoming", {
      title: "Upcoming Movies - Movie Tracker",
      movies: pageMovies,
      user,
      followedMovieIds,
      followMessage,
      query: "",
      loginRedirect: "/upcoming",
      initialLoad: true, // Flag to indicate this is initial load
      initialPagesUsed: initialPagesUsed // Track which TMDB pages were consumed
    });
  } catch (err) {
    console.error("TMDB upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
