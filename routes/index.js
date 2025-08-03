const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("index", {
    title: "Home",
    query: "",
    movies: [],
    followedMovieIds: [],
    followMessage: null,
  });
});

module.exports = router;