const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
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
      case "oldest":
        tmdbSortBy = "release_date.asc";
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

      const response = await axios.get(
        `https://api.themoviedb.org/3/discover/movie`,
        { params: apiParams }
      );

      let results = response.data.results;

      // Process movies with streaming dates
      const processedMovies = await Promise.all(
        results.map(async (movie) => {
          const streamingDateRaw = await getStreamingReleaseDate(movie.id);
          const streamingDate = streamingDateRaw
            ? new Date(streamingDateRaw)
            : null;
          
          // Get the actual theatrical release date from movie details API
          // since discover API returns streaming date when filtering by release_type
          let theatricalDate = null;
          try {
            const movieDetails = await axios.get(
              `https://api.themoviedb.org/3/movie/${movie.id}`,
              { params: { api_key: process.env.TMDB_API_KEY } }
            );
            theatricalDate = movieDetails.data.release_date
              ? new Date(movieDetails.data.release_date)
              : null;
          } catch (error) {
            console.error(`Error fetching theatrical date for movie ${movie.id}:`, error);
            // Fallback to discover API date - but note this might be streaming date due to our filter
            theatricalDate = movie.release_date ? new Date(movie.release_date) : null;
          }

          const streamingDateMidnight = streamingDate
            ? toUtcMidnight(streamingDate)
            : null;
          const theatricalDateMidnight = theatricalDate
            ? toUtcMidnight(theatricalDate)
            : null;

          // For top streaming releases, only include movies with actual streaming dates
          const hasRecentStreaming = streamingDateMidnight;

          let displayDate = "Available Now";
          if (streamingDateMidnight) {
            displayDate = `Released ${
              streamingDateMidnight.toISOString().split("T")[0]
            }`;
          }

          return {
            ...movie,
            release_date: theatricalDate ? theatricalDate.toISOString().split('T')[0] : null, // Use proper theatrical date
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

    // Apply sorting to all movies with secondary sort key for consistency
    switch (sortBy) {
      case "newest":
        allValidMovies.sort((a, b) => {
          if (!a.streamingDate && !b.streamingDate) return a.id - b.id;
          if (!a.streamingDate) return 1;
          if (!b.streamingDate) return -1;
          const dateCompare = b.streamingDate - a.streamingDate;
          return dateCompare !== 0 ? dateCompare : a.id - b.id;
        });
        break;
      case "oldest":
        allValidMovies.sort((a, b) => {
          if (!a.streamingDate && !b.streamingDate) return a.id - b.id;
          if (!a.streamingDate) return 1;
          if (!b.streamingDate) return -1;
          const dateCompare = a.streamingDate - b.streamingDate;
          return dateCompare !== 0 ? dateCompare : a.id - b.id;
        });
        break;
      case "rating":
        allValidMovies.sort((a, b) => {
          const ratingCompare = b.rating - a.rating;
          return ratingCompare !== 0 ? ratingCompare : a.id - b.id;
        });
        break;
      case "popularity":
      default:
        allValidMovies.sort((a, b) => {
          const popularityCompare = b.popularity - a.popularity;
          return popularityCompare !== 0 ? popularityCompare : a.id - b.id;
        });
        break;
    }

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
        { value: "oldest", label: "Oldest First" },
      ],
    });
  } catch (err) {
    console.error("TMDB top releases error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
