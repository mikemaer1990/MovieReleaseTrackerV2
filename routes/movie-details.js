// routes/movie-details.js
const express = require("express");
const router = express.Router();
const { getStreamingReleaseDate, getMovieDetails } = require("../services/tmdb");
const { getFollowedMoviesByUserId } = require("../services/airtable");
// Caching
const { getCachedData, setCachedData } = require("../services/cache");
// Constants
const CAST_LIMIT = 10;

// Helper function to find trailer
function findTrailer(videos) {
  if (!videos?.results?.length) return null;

  // Prefer official YouTube trailers
  return (
    videos.results.find(
      (video) =>
        video.type === "Trailer" &&
        video.site === "YouTube" &&
        video.official === true
    ) ||
    videos.results.find(
      (video) => video.type === "Trailer" && video.site === "YouTube"
    )
  );
}

// Helper function to find director
function findDirector(crew) {
  return crew?.find((member) => member.job === "Director") || null;
}

// OLD VERSION
// Helper function to check if user is following movie
// async function checkIfUserFollowing(userId, movieId) {
//   if (!userId) return false;

//   const followedRecords = await getFollowedMoviesByUserId(userId);
//   const followedMovieIds = followedRecords.map((record) =>
//     Number(record.fields.TMDB_ID)
//   );
//   return followedMovieIds.includes(Number(movieId));
// }

// Fixed checkIfUserFollowing function for movie-details.js

async function checkIfUserFollowing(userId, movieId) {
  if (!userId) return false;

  const cacheKey = `followedMovies_${userId}`;
  let followedRecords = getCachedData(cacheKey);

  if (!followedRecords) {
    // Not cached - fetch from Airtable
    followedRecords = await getFollowedMoviesByUserId(userId);

    // Cache the original Airtable records (don't transform them!)
    setCachedData(cacheKey, followedRecords, 600);
  }

  // Extract movie IDs from the original Airtable structure
  const followedMovieIds = followedRecords
    .filter((record) => record && record.fields && record.fields.TMDB_ID)
    .map((record) => Number(record.fields.TMDB_ID));

  // Check if movieId is in user's followed movies
  return followedMovieIds.includes(Number(movieId));
}

// Movie detail page route
router.get("/:id", async (req, res) => {
  try {
    const movieId = req.params.id;

    // Get detailed movie information from TMDB using centralized service
    const movie = await getMovieDetails(movieId, "credits,videos");

    // Get streaming release date
    const streamingDate = await getStreamingReleaseDate(movieId);
    movie.streaming_date = streamingDate;

    // Process cast and crew
    const cast = movie.credits?.cast?.slice(0, CAST_LIMIT) || [];
    const director = findDirector(movie.credits?.crew);
    const trailer = findTrailer(movie.videos);

    // Check user authentication and following status
    let isFollowing = false;
    let user = null;

    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };

      isFollowing = await checkIfUserFollowing(req.session.userId, movieId);
    }

    // Set layout variable
    res.locals.page = "movie-details";

    res.render("movie-details", {
      movie,
      cast,
      director,
      trailer,
      isFollowing,
      user,
      title: movie.title,
    });
  } catch (error) {
    console.error("Error fetching movie details:", error);
    res.status(500).render("error", {
      message: "Movie not found",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
});

module.exports = router;
