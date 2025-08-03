const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId, unfollowMovie } = require("../services/airtable");

router.get("/", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  try {
    const followedMovies = await getFollowedMoviesByUserId(req.session.userId);

    const movies = followedMovies.map(record => ({
      id: record.fields.TMDB_ID,
      title: record.fields.Title,
      releaseDate: record.fields.ReleaseDate,
      posterPath: record.fields.PosterPath
    }));
    // set layout var
    res.locals.page = 'my-movies';
    res.render("my-movies", {
      title: "My Movies",
      movies,
    });

  } catch (error) {
    console.error("Error fetching followed movies:", error);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
