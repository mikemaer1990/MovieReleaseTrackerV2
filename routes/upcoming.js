const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { getGenres } = require("../services/tmdb");
const moviePaginationService = require("../services/movie-pagination");
router.get("/upcoming", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;
  const moviesPerPage = 20;

  try {
    console.log(`[UPCOMING] Request: sort=${sortBy}, genre=${genre}`);

    // HYBRID PAGINATION SERVICE - handles all optimization logic internally
    const paginationResult = await moviePaginationService.getSortedPage(
      sortBy,
      1, // First page
      moviesPerPage,
      [], // No excluded IDs on initial load
      genre
    );

    const pageMovies = paginationResult.movies;
    console.log(`[UPCOMING] Served ${pageMovies.length} movies via ${paginationResult.source || 'hybrid-service'}`);

    // All fallback and optimization logic is now handled by the hybrid pagination service

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
      initialLoad: true,
      initialPagesUsed: 1, // Hybrid service abstracts this
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "release_date_asc", label: "Soonest First" },
        { value: "release_date_desc", label: "Furthest First" },
      ],
    });
  } catch (err) {
    console.error("Upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
