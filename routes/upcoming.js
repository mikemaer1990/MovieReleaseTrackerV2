const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { toUtcMidnight } = require("../utils/date-helpers");
// Caching
const { getCachedData, setCachedData } = require("../services/cache");
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
      const results = response.data.results;

      const processedMovies = await Promise.all(
        results.map(async (movie) => {
          const streamingDateRaw = await getStreamingReleaseDate(movie.id);
          const streamingDate = streamingDateRaw
            ? new Date(streamingDateRaw)
            : null;
          const theatricalDate = movie.release_date
            ? new Date(movie.release_date)
            : null;

          const streamingDateMidnight = streamingDate
            ? toUtcMidnight(streamingDate)
            : null;
          const theatricalDateMidnight = theatricalDate
            ? toUtcMidnight(theatricalDate)
            : null;

          const canFollow =
            (streamingDateMidnight && streamingDateMidnight > now) ||
            (theatricalDateMidnight && theatricalDateMidnight > now);

          let displayDate = "Coming Soon";
          if (streamingDateMidnight) {
            displayDate = streamingDateMidnight.toISOString().split("T")[0];
          } else if (theatricalDateMidnight) {
            displayDate =
              theatricalDateMidnight.toISOString().split("T")[0] +
              " (Theatrical)";
          }

          return {
            ...movie,
            streamingDateRaw,
            canFollow,
            displayDate,
          };
        })
      );

      const newFiltered = processedMovies.filter(
        (movie) =>
          movie.canFollow &&
          !collectedMovies.some((colMovie) => colMovie.id === movie.id)
      );

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

      const cacheKey = `followedMovies_${req.session.userId}`;
      let followedRecords = getCachedData(cacheKey);
      if (!followedRecords) {
        followedRecords = await getFollowedMoviesByUserId(req.session.userId);
        setCachedData(cacheKey, followedRecords, 600); // 10 mins TTL
      }

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
