const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { processMoviesWithDates, filterMovies } = require("../services/movie-processor");
const { searchMovies } = require("../services/tmdb");
const { sortByRelevanceAndPopularity } = require("../utils/search-helpers");
router.get("/search", async (req, res) => {
  const query = req.query.query;
  const followMessage = req.query.followMessage || null;

  if (!query) return res.redirect("/");

  try {
    // Load only the first page for initial load using centralized service
    const response = await searchMovies(query, 1);
    let results = response.results;

    results.sort((a, b) => sortByRelevanceAndPopularity(a, b, query));

    // Process movies with dates using the centralized service
    const processedMovies = await processMoviesWithDates(results, { type: 'search' });
    
    // Filter movies that can be followed
    const movies = filterMovies(processedMovies, { type: 'search' });

    let user = null;
    let followedMovieIds = [];
    let followedMovies = [];

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
      followedMovies = followedRecords;
    }

    // set layout var
    res.locals.page = "search";
    res.render("search-results", {
      title: "Movie Tracker",
      query,
      movies,
      user,
      followedMovieIds,
      followedMovies,
      followMessage,
      loginRedirect: `/search?query=${query}`,
      initialLoad: true, // Flag to indicate this is initial load
    });
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
