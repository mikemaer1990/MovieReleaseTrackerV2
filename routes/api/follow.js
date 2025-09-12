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

  let { movieId, title, posterPath, followType, releaseDate, streamingDate } = req.body;
  followType = (followType || "").toLowerCase();
  
  console.log(`[DEBUG] Follow request received:`, {
    movieId,
    title,
    followType,
    releaseDate,
    streamingDate,
    frontendProvidedStreamingDate: !!streamingDate
  });
  

  if (!validFollowTypes.includes(followType)) {
    return res.status(400).json({
      success: false,
      message: "Invalid follow type.",
    });
  }

  try {
    // Use streaming date from frontend if available, otherwise fetch from TMDB as fallback
    let finalStreamingDate = streamingDate || null;
    let theatricalDate = null;
    
    if (!finalStreamingDate || !releaseDate) {
      // Get unified release data from TMDB as fallback
      const releaseData = await getReleaseData(movieId);
      
      // Use TMDB data as fallback if not provided by frontend
      theatricalDate = releaseData.usTheatrical || releaseData.primary || null;
      if (!finalStreamingDate) {
        finalStreamingDate = releaseData.streaming;
      }
    } else {
      // Use release date from frontend as theatrical date if available
      theatricalDate = releaseDate || null;
    }
    

    const followTypesToCreate =
      followType === "both" ? ["theatrical", "streaming"] : [followType];

    await Promise.all(
      followTypesToCreate.map(async (type) => {
        let specificReleaseDate = null;
        let streamingReleaseDate = null;
        
        if (type === "streaming") {
          streamingReleaseDate = finalStreamingDate;
          specificReleaseDate = null; // Don't populate ReleaseDate for streaming records
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
      debug: {
        receivedStreamingDate: streamingDate,
        finalStreamingDate,
        frontendProvidedStreamingDate: !!streamingDate
      }
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