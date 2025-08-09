const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("home", {
    // render home.ejs
    title: "Home",
  });
});

module.exports = router;
