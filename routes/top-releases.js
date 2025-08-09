const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const { toUtcMidnight } = require("../utils/dateHelpers");

const RESULTS_PER_PAGE = 20; // Consistent results per page

router.get("/top-releases", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const page = parseInt(req.query.page) || 1;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;

  try {
    const now = toUtcMidnight(new Date());
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    let allValidMovies = [];
    let tmdbPage = 1;

    // Calculate how many movies we need (current page + some buffer for next page)
    const moviesNeeded = page * RESULTS_PER_PAGE + RESULTS_PER_PAGE; // Extra page for "next" detection
    const maxPagesToFetch = Math.min(10, Math.ceil(moviesNeeded / 5)); // Assume ~5 valid movies per TMDB page on average

    // Keep fetching until we have enough valid movies
    while (
      allValidMovies.length < moviesNeeded &&
      tmdbPage <= maxPagesToFetch
    ) {
      const response = await axios.get(
        `https://api.themoviedb.org/3/movie/popular`,
        {
          params: {
            api_key: process.env.TMDB_API_KEY,
            page: tmdbPage,
            region: "US",
          },
        }
      );

      let results = response.data.results;

      // Filter by genre client-side if genre is specified
      if (genre) {
        results = results.filter(
          (movie) =>
            movie.genre_ids && movie.genre_ids.includes(parseInt(genre))
        );
      }

      // Process movies with streaming dates
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

          // Only include movies that have streaming dates and are recently available
          const hasRecentStreaming =
            streamingDateMidnight &&
            streamingDateMidnight <= now &&
            streamingDateMidnight >= sixMonthsAgo;

          let displayDate = "Available Now";
          if (streamingDateMidnight) {
            displayDate = `Released ${
              streamingDateMidnight.toISOString().split("T")[0]
            }`;
          }

          return {
            ...movie,
            streamingDateRaw,
            streamingDate: streamingDateMidnight,
            theatricalDate: theatricalDateMidnight,
            displayDate,
            hasRecentStreaming,
            rating: movie.vote_average || 0,
            popularity: movie.popularity || 0,
          };
        })
      );

      // Filter for movies with recent streaming releases
      const validMovies = processedMovies.filter(
        (movie) => movie.hasRecentStreaming
      );
      allValidMovies = allValidMovies.concat(validMovies);
      tmdbPage++;
    }

    // Apply sorting to all movies
    switch (sortBy) {
      case "newest":
        allValidMovies.sort((a, b) => {
          if (!a.streamingDate && !b.streamingDate) return 0;
          if (!a.streamingDate) return 1;
          if (!b.streamingDate) return -1;
          return b.streamingDate - a.streamingDate;
        });
        break;
      case "oldest":
        allValidMovies.sort((a, b) => {
          if (!a.streamingDate && !b.streamingDate) return 0;
          if (!a.streamingDate) return 1;
          if (!b.streamingDate) return -1;
          return a.streamingDate - b.streamingDate;
        });
        break;
      case "rating":
        allValidMovies.sort((a, b) => b.rating - a.rating);
        break;
      case "popularity":
      default:
        allValidMovies.sort((a, b) => b.popularity - a.popularity);
        break;
    }

    // Paginate the results
    const startIndex = (page - 1) * RESULTS_PER_PAGE;
    const endIndex = startIndex + RESULTS_PER_PAGE;
    const paginatedMovies = allValidMovies.slice(startIndex, endIndex);

    // Determine if there's a next page and total pages
    const hasNextPage = allValidMovies.length > endIndex;
    const hasPrevPage = page > 1;

    // For total pages, we can only be certain about what we've seen
    // Show current page + 1 if we have next page data, otherwise just current page
    const totalPages = hasNextPage ? page + 1 : page;

    // Get user info for display purposes only
    let user = null;
    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };
    }

    // Get genres for filter dropdown
    const genresResponse = await axios.get(
      `https://api.themoviedb.org/3/genre/movie/list`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
        },
      }
    );
    const genres = genresResponse.data.genres || [];

    res.locals.page = "top-releases";
    res.render("top-releases", {
      title: "Top Streaming Releases - Movie Tracker",
      movies: paginatedMovies,
      user,
      followMessage,
      currentPage: page,
      totalPages: totalPages,
      hasNextPage: hasNextPage,
      hasPrevPage: hasPrevPage,
      sortBy,
      genre,
      genres,
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "rating", label: "Highest Rated" },
        { value: "newest", label: "Newest First" },
        { value: "oldest", label: "Oldest First" },
      ],
    });
  } catch (err) {
    console.error("TMDB top releases error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
