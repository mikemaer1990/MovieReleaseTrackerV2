const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { toUtcMidnight } = require("../utils/dateHelpers");
// Caching
const { getCachedData, setCachedData } = require("../services/cache");
router.get("/upcoming", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const uiPage = parseInt(req.query.page) || 1;
  const moviesPerPage = 15;
  const maxFilteredMovies = moviesPerPage * 5; // max 5 UI pages of filtered movies
  const now = toUtcMidnight(new Date());

  try {
    let collectedMovies = [];
    let tmdbPage = 1;
    let totalTmdbPages = 1;

    while (
      collectedMovies.length < maxFilteredMovies &&
      tmdbPage <= totalTmdbPages
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
    }

    const totalPages = Math.ceil(collectedMovies.length / moviesPerPage);
    const currentPage = uiPage > totalPages ? totalPages : uiPage;
    const startIndex = (currentPage - 1) * moviesPerPage;
    const pageMovies = collectedMovies.slice(
      startIndex,
      startIndex + moviesPerPage
    );

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
      currentPage,
      totalPages,
      query: "",
    });
  } catch (err) {
    console.error("TMDB upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
