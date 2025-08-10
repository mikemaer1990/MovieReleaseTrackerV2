const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");

router.get("/", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }

  try {
    const followedMovies = await getFollowedMoviesByUserId(req.session.userId);

    // Group movies by TMDB_ID to consolidate duplicates
    const moviesMap = new Map();

    followedMovies.forEach((record) => {
      const tmdbId = record.fields.TMDB_ID;
      const followType = record.fields.FollowType.toLowerCase();

      if (!moviesMap.has(tmdbId)) {
        moviesMap.set(tmdbId, {
          id: tmdbId,
          title: record.fields.Title,
          releaseDate: record.fields.ReleaseDate,
          posterPath: record.fields.PosterPath,
          followTypes: [],
          airtableRecords: [], // Keep track of Airtable record IDs for deletion
        });
      }

      const movie = moviesMap.get(tmdbId);
      movie.followTypes.push(followType);
      movie.airtableRecords.push({
        id: record.id,
        followType: followType,
      });
    });

    const consolidatedMovies = Array.from(moviesMap.values());

    // Calculate stats
    const totalMovies = consolidatedMovies.length;
    const theatricalCount = consolidatedMovies.filter((m) =>
      m.followTypes.includes("theatrical")
    ).length;
    const streamingCount = consolidatedMovies.filter((m) =>
      m.followTypes.includes("streaming")
    ).length;
    const bothCount = consolidatedMovies.filter(
      (m) =>
        m.followTypes.includes("theatrical") &&
        m.followTypes.includes("streaming")
    ).length;

    const stats = {
      total: totalMovies,
      theatrical: theatricalCount,
      streaming: streamingCount,
      both: bothCount,
    };

    res.locals.page = "my-movies";
    res.render("my-movies", {
      title: "My Movies",
      movies: consolidatedMovies,
      stats: stats,
    });
  } catch (error) {
    console.error("Error fetching followed movies:", error);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
