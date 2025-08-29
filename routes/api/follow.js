const express = require("express");
const router = express.Router();
const { getStreamingReleaseDate } = require("../../services/tmdb");
const { followMovie, unfollowMovie } = require("../../services/airtable");
const { clearCache } = require("../../services/cache");

const validFollowTypes = ["theatrical", "streaming", "both"];

// Follow movie route
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
        // Add theatrical date logic here if needed

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

    // Clear user's followed movies cache after successful follow
    clearCache(`followedMovies_${req.session.userId}`);

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

// Unfollow movie route
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
      // Clear user's followed movies cache after successful unfollow
      clearCache(`followedMovies_${req.session.userId}`);

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