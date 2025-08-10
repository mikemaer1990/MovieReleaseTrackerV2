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

      const followedRecords = await getFollowedMoviesByUserId(
        req.session.userId
      );
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
    });
  } catch (err) {
    console.error("TMDB upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

const validFollowTypes = ["theatrical", "streaming", "both"];

router.post("/follow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Not logged in",
    });
  }

  let { movieId, title, posterPath, followType } = req.body;
  followType = (followType || "").toLowerCase();

  if (!validFollowTypes.includes(followType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid follow type.",
    });
  }

  try {
    const followTypesToCreate =
      followType === "both" ? ["theatrical", "streaming"] : [followType];

    await Promise.all(
      followTypesToCreate.map(async (type) => {
        let releaseDate = null;
        if (type === "streaming") {
          releaseDate = await getStreamingReleaseDate(movieId);
        }
        // Add theatrical date if you want

        await followMovie(req.session.airtableRecordId, {
          TMDB_ID: Number(movieId),
          Title: title,
          ReleaseDate: releaseDate,
          PosterPath: posterPath,
          User: [req.session.airtableRecordId],
          UserID: req.session.userId,
          FollowType: type,
          StreamingDateAvailable: type === "streaming" && Boolean(releaseDate),
          StreamingReleaseDate:
            type === "streaming" ? releaseDate || null : null,
        });
      })
    );

    res.json({
      success: true,
      message: `You are now following "${title}" (${followType}).`,
    });
  } catch (error) {
    console.error("Error following movie:", error);
    res.status(500).json({
      success: false,
      message: "Failed to follow movie",
    });
  }
});

router.post("/unfollow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Not logged in",
    });
  }

  const { movieId, followType } = req.body;

  try {
    const success = await unfollowMovie(
      req.session.userId,
      Number(movieId),
      followType
    );

    if (success) {
      res.json({
        success: true,
        message: `Movie unfollowed successfully (${followType || "all types"})`,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Movie follow record not found for this user and follow type",
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
