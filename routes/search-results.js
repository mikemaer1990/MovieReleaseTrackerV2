const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const {
  getFollowedMoviesByUserId,
  followMovie,
  unfollowMovie,
} = require("../services/airtable");
const { toUtcMidnight } = require("../utils/dateHelpers");
const { sortByRelevanceAndPopularity } = require("../utils/searchHelpers");

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

    let user = null;
    let followedMovieIds = [];

    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };

      const followedRecords = await getFollowedMoviesByUserId(
        req.session.userId
      );
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

router.post("/follow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Not logged in",
    });
  }

  const { movieId, title, posterPath } = req.body;

  try {
    const releaseDate = await getStreamingReleaseDate(movieId);

    if (!releaseDate) {
      return res.status(400).json({
        success: false,
        message: "Could not find streaming or DVD release date",
      });
    }

    await followMovie(req.session.airtableRecordId, {
      TMDB_ID: Number(movieId),
      Title: title,
      ReleaseDate: releaseDate,
      PosterPath: posterPath,
      User: [req.session.airtableRecordId],
      UserID: req.session.userId,
    });

    res.json({
      success: true,
      message: `You are now following "${title}"`,
    });
  } catch (error) {
    console.error("Error following movie:", error);
    res.status(500).json({
      success: false,
      message: "Failed to follow movie",
    });
  }
});

// POST /unfollow
router.post("/unfollow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Not logged in",
    });
  }

  const { movieId } = req.body;

  try {
    const success = await unfollowMovie(req.session.userId, Number(movieId));
    if (success) {
      res.json({
        success: true,
        message: "Movie unfollowed successfully",
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Movie not found for this user",
      });
    }
  } catch (error) {
    console.error("Error unfollowing movie:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unfollow movie",
    });
  }
});

module.exports = router;
