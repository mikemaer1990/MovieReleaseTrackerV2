const express = require("express");
const router = express.Router();
const { userActionLimiter } = require("../../middleware/rate-limiting");
const { getReleaseData } = require("../../services/tmdb");
const { followMovie, unfollowMovie } = require("../../services/airtable");
const { clearCache } = require("../../services/cache");

const validFollowTypes = ["theatrical", "streaming", "both"];

// Follow movie route
router.post("/follow", userActionLimiter, async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      success: false,
      message: "Not logged in",
    });
  }

  let { movieId, title, posterPath, followType, releaseDate } = req.body;
  followType = (followType || "").toLowerCase();
  

  if (!validFollowTypes.includes(followType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid follow type.",
    });
  }

  try {
    // Get unified release data (theatrical, streaming, primary dates)
    const releaseData = await getReleaseData(movieId);
    
    // Prioritize US theatrical date over primary release date
    const theatricalDate = releaseData.usTheatrical || releaseData.primary || null;
    const streamingDate = releaseData.streaming;
    

    const followTypesToCreate =
      followType === "both" ? ["theatrical", "streaming"] : [followType];

    await Promise.all(
      followTypesToCreate.map(async (type) => {
        let specificReleaseDate = null;
        let streamingReleaseDate = null;
        
        if (type === "streaming") {
          streamingReleaseDate = streamingDate;
          specificReleaseDate = streamingDate;
        } else if (type === "theatrical") {
          specificReleaseDate = theatricalDate;
        }
        

        await followMovie(req.session.airtableRecordId, {
          TMDB_ID: Number(movieId),
          Title: title,
          ReleaseDate: specificReleaseDate,
          PosterPath: posterPath,
          User: [req.session.airtableRecordId],
          UserID: req.session.userId,
          FollowType: type,
          StreamingDateAvailable: type === "streaming" && Boolean(streamingReleaseDate),
          StreamingReleaseDate: streamingReleaseDate,
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
router.post("/unfollow", userActionLimiter, async (req, res) => {
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