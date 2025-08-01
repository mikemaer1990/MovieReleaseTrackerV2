const express = require("express");
const router = express.Router();
const axios = require("axios");
const { getStreamingReleaseDate } = require("../services/tmdb");
const {
  getFollowedMoviesByUserId,
  followMovie,
  unfollowMovie,
} = require("../services/airtable");

function relevanceScore(title, query) {
  title = title.toLowerCase();
  query = query.toLowerCase();

  if (title === query) return 100;
  if (title.startsWith(query)) return 80;
  if (title.includes(query)) return 50;
  return 0;
}

router.get("/", (req, res) => {
  res.render("index", {
    title: "Home",
    query: "",
    movies: [],
    user: null,
    followedMovieIds: [],
    followMessage: null,
  });
});

router.get("/search", async (req, res) => {
  const query = req.query.query;
  const followMessage = req.query.followMessage || null;

  if (!query) return res.redirect("/");

  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/search/movie`,
      {
        params: {
          api_key: process.env.TMDB_API_KEY,
          query: query,
        },
      },
    );

    let results = response.data.results;

    results.sort((a, b) => {
      const relevanceDiff =
        relevanceScore(b.title, query) - relevanceScore(a.title, query);
      if (relevanceDiff !== 0) return relevanceDiff;
      return b.popularity - a.popularity;
    });

    // Grab streaming release dates
    const movies = await Promise.all(
      results.map(async (movie) => {
        const streamingDate = await getStreamingReleaseDate(movie.id); // this can be null if unavailable
        return {
          ...movie,
          streamingDate,
        };
      }),
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
        req.session.userId,
      );
      followedMovieIds = followedRecords.map((record) =>
        Number(record.fields.TMDB_ID),
      );
    }

    // set layout var
    res.locals.page = "search";
    console.log(movies);
    res.render("index", {
      title: "Movie Tracker",
      query,
      movies, // now includes .streamingDate
      user,
      followedMovieIds,
      followMessage,
    });
  } catch (err) {
    console.error("TMDB search error:", err);
    res.status(500).send("Something went wrong");
  }
});

router.post("/follow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Not logged in" });
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

    res.json({ success: true, message: `You are now following "${title}"` });
  } catch (error) {
    console.error("Error following movie:", error);
    res.status(500).json({ success: false, message: "Failed to follow movie" });
  }
});

// POST /unfollow
router.post("/unfollow", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Not logged in" });
  }

  const { movieId } = req.body;

  try {
    const success = await unfollowMovie(req.session.userId, Number(movieId));
    if (success) {
      res.json({ success: true, message: "Movie unfollowed successfully" });
    } else {
      res
        .status(404)
        .json({ success: false, message: "Movie not found for this user" });
    }
  } catch (error) {
    console.error("Error unfollowing movie:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to unfollow movie" });
  }
});

// router.get("/my-movies", async (req, res) => {
//   if (!req.session.userId) {
//     return res.redirect("/auth/login");
//   }

//   try {
//     console.log("User Airtable Record ID:", req.session.userId);
//     const followedMovies = await getFollowedMoviesByUserId(req.session.userId);

//     // Map fields to simpler objects for the view
//     const movies = followedMovies.map(record => ({
//       id: record.fields.TMDB_ID,
//       title: record.fields.Title,
//       releaseDate: record.fields.ReleaseDate
//     }));

//     res.render("my-movies", {
//       title: "My Movies",
//       user: {
//         id: req.session.userId,
//         airtableRecordId: req.session.airtableRecordId
//       },
//       movies
//     });
//   } catch (error) {
//     console.error("Error fetching followed movies:", error);
//     res.status(500).send("Internal server error");
//   }
// });

module.exports = router;
