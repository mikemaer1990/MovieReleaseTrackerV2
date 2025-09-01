const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { getMovieDisplayDate } = require("../utils/date-helpers");

router.get("/", async (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }

  try {
    const userId = req.session.userId;

    // Get followed movies (caching is handled by the service layer)
    const followedMovies = await getFollowedMoviesByUserId(userId);

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
        // Format release date properly
        let formattedReleaseDate = '';
        if (record.fields.ReleaseDate) {
          try {
            const date = new Date(record.fields.ReleaseDate);
            if (!isNaN(date.getTime())) {
              formattedReleaseDate = date.toISOString().split('T')[0];
            }
          } catch (error) {
            console.warn(`Invalid date format for movie ${record.fields.Title}:`, record.fields.ReleaseDate);
          }
        }
        
        // Create base movie object with TMDB-like structure
        const baseMovie = {
          id: tmdbId,
          title: record.fields.Title,
          releaseDate: formattedReleaseDate,
          streamingReleaseDate: record.fields.StreamingReleaseDate || null,
          posterPath: record.fields.PosterPath,
          followTypes: [],
          airtableRecords: [],
          // Add TMDB-like properties for unified date processing
          release_date: formattedReleaseDate,
          streamingDateRaw: record.fields.StreamingReleaseDate || null,
          poster_path: record.fields.PosterPath,
        };

        // Apply unified date processing
        const dateInfo = getMovieDisplayDate(baseMovie, { context: 'my-movies' });
        baseMovie.displayDate = dateInfo.displayText;
        baseMovie.dateType = dateInfo.dateType;
        baseMovie.dateStatusClass = dateInfo.statusClass;
        baseMovie.theatricalFormatted = dateInfo.theatricalFormatted;
        baseMovie.streamingFormatted = dateInfo.streamingFormatted;

        moviesMap.set(tmdbId, baseMovie);
      }

      const movie = moviesMap.get(tmdbId);
      movie.followTypes.push(followType);
      movie.airtableRecords.push({
        id: record.id,
        followType: followType,
      });
      
      // Update streaming date if this record has one and we don't have it yet
      if (!movie.streamingReleaseDate && record.fields.StreamingReleaseDate) {
        try {
          const streamingDate = new Date(record.fields.StreamingReleaseDate);
          if (!isNaN(streamingDate.getTime())) {
            movie.streamingReleaseDate = record.fields.StreamingReleaseDate;
          }
        } catch (error) {
          console.warn(`Invalid streaming date format for movie ${record.fields.Title}:`, record.fields.StreamingReleaseDate);
        }
      }
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
