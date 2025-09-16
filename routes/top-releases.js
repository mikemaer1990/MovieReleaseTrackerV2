const express = require("express");
const router = express.Router();
const { processMoviesWithDates, filterMovies, sortMovies } = require("../services/movie-processor");
const { discoverMovies, getGenres } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");
const moviePaginationService = require("../services/movie-pagination");

const RESULTS_PER_PAGE = 20; // Consistent results per page

router.get("/top-releases", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;

  try {
    // Use pagination service for fast, cached response
    const paginationResult = await moviePaginationService.getReleasesSortedPage(
      sortBy,
      1, // First page
      RESULTS_PER_PAGE,
      [], // No displayed movie IDs to exclude
      genre
    );

    const initialMovies = paginationResult.movies;

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
      hasMore: paginationResult.hasMore, // Use pagination service metadata
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "newest", label: "Latest Released" },
      ],
    });
  } catch (err) {
    console.error("TMDB top releases error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
