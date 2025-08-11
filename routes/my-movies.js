const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { getCachedData, setCachedData } = require("../services/cache"); // <-- Import cache

router.get("/", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }

  try {
    const userId = req.session.userId;

    // 1. Try to get followed movies from cache for this user
    const cacheKey = `followedMovies_${userId}`;

    // 1. Try to get followed movies from cache for this user
    let followedMovies = getCachedData(cacheKey);

    // 2. If no cached data, fetch from Airtable and cache it
    if (!followedMovies) {
      followedMovies = await getFollowedMoviesByUserId(userId);

      // Cache data for 10 minutes (600 seconds)
      setCachedData(cacheKey, followedMovies, 600);
    }

    // 3. Group movies by TMDB_ID to consolidate duplicates (your existing logic)
    const moviesMap = new Map();

    followedMovies.forEach((record) => {
      if (!record.fields.TMDB_ID || !record.fields.FollowType) {
        console.warn(`Skipping incomplete record ${record.id}:`, record.fields);
        return;
      }

      const tmdbId = record.fields.TMDB_ID;
      const followType = record.fields.FollowType.toLowerCase();

      if (!moviesMap.has(tmdbId)) {
        moviesMap.set(tmdbId, {
          id: tmdbId,
          title: record.fields.Title,
          releaseDate: record.fields.ReleaseDate,
          posterPath: record.fields.PosterPath,
          followTypes: [],
          airtableRecords: [],
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

    // 4. Calculate stats (your existing logic)
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

    // 5. Render page as usual
    res.render("my-movies", {
      title: "My Movies",
      movies: consolidatedMovies,
      stats,
    });
  } catch (error) {
    console.error("Error fetching followed movies:", error);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
