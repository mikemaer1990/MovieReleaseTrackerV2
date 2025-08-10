// routes/movie-details.js
const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const {
  getFollowedMoviesByUserId,
  followMovie,
  unfollowMovie,
} = require("../services/airtable");

// Constants
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const CAST_LIMIT = 10;

// Helper function to get movie from TMDB
async function getMovieFromTMDB(movieId, appendToResponse = "") {
  const response = await axios.get(`${TMDB_BASE_URL}/movie/${movieId}`, {
    params: {
      api_key: process.env.TMDB_API_KEY,
      ...(appendToResponse && { append_to_response: appendToResponse }),
    },
  });
  return response.data;
}

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

// Helper function to check if user is following movie
async function checkIfUserFollowing(userId, movieId) {
  if (!userId) return false;

  const followedRecords = await getFollowedMoviesByUserId(userId);
  const followedMovieIds = followedRecords.map((record) =>
    Number(record.fields.TMDB_ID)
  );
  return followedMovieIds.includes(Number(movieId));
}

// Movie detail page route
router.get("/:id", async (req, res) => {
  try {
    const movieId = req.params.id;

    // Get detailed movie information from TMDB
    const movie = await getMovieFromTMDB(movieId, "credits,videos");

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
