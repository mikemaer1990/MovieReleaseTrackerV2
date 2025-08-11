const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { toUtcMidnight } = require("../utils/dateHelpers");
const { sortByRelevanceAndPopularity } = require("../utils/searchHelpers");
// Caching
const { getCachedData, setCachedData } = require("../services/cache");
router.get("/search", async (req, res) => {
  const query = req.query.query;
  const followMessage = req.query.followMessage || null;
  const page = parseInt(req.query.page) || 1; // Add pagination support

  if (!query) return res.redirect("/");

  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query: query,
          page: page, // Add page parameter
        },
      }
    );

    let results = response.data.results;

    results.sort((a, b) => sortByRelevanceAndPopularity(a, b, query));

    // Grab streaming release dates and pre-calculate date-related info
    const now = toUtcMidnight(new Date());
    const movies = await Promise.all(
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

        const now = toUtcMidnight(new Date());
        const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

        const theatricalInPast60Days =
          theatricalDateMidnight &&
          theatricalDateMidnight <= now &&
          now - theatricalDateMidnight <= SIXTY_DAYS_MS;

        const theatricalInFuture =
          theatricalDateMidnight && theatricalDateMidnight > now;

        const streamingInFuture =
          streamingDateMidnight && streamingDateMidnight > now;

        const canFollow =
          (theatricalInPast60Days &&
            (!streamingDateMidnight || streamingDateMidnight > now)) ||
          theatricalInFuture ||
          (!theatricalDateMidnight && streamingInFuture);

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
        setCachedData(cacheKey, followedRecords, 600); // cache for 10 mins
      }

      followedMovieIds = followedRecords.map((record) =>
        Number(record.fields.TMDB_ID)
      );
    }

    // set layout var
    res.locals.page = "search";
    res.render("search-results", {
      title: "Movie Tracker",
      query,
      movies,
      user,
      followedMovieIds,
      followMessage,
      currentPage: page, // Add pagination data
      totalPages: response.data.total_pages,
      totalResults: response.data.total_results,
    });
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
