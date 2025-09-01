const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.locals.page = "home";
  res.render("home", { title: "Movie Release Tracker" });
});

module.exports = router;
