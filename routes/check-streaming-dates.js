const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const getStreamingReleaseDate =
  require("../services/tmdb").getStreamingReleaseDate;
const sendEmail = require("../services/send-email");

const AIRTABLE_FOLLOWED_MOVIES_TABLE =
  process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE;
const cronSecret = process.env.CRON_SECRET;

router.get("/", async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send("Unauthorized");
  }

  try {
    // 1. Fetch all followed movies missing streaming dates but should have them
    const filterFormula = `AND(
      OR(
        {FollowType} = "streaming",
        {FollowType} = "both"
      ),
      NOT({StreamingDateAvailable})
    )`;

    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: { filterByFormula: filterFormula },
    });

    const moviesToCheck = response.data.records;

    if (moviesToCheck.length === 0) {
      console.log("No movies need streaming date updates.");
      return res.send("No updates needed");
    }

    // Fetch user emails for notifications
    const userIds = [
      ...new Set(moviesToCheck.flatMap((m) => m.fields.User || [])),
    ];
    const userResponses = await Promise.all(
      userIds.map(async (userId) => {
        const userRes = await airtableAxios.get(
          `${AIRTABLE_USERS_TABLE}/${userId}`
        );
        return { id: userId, email: userRes.data.fields.Email };
      })
    );
    const userIdToEmail = Object.fromEntries(
      userResponses.map((u) => [u.id, u.email])
    );

    // 2. For each movie, check streaming date from TMDB and update Airtable if found
    const updates = [];

    for (const movie of moviesToCheck) {
      try {
        const tmdbId = movie.fields.TMDB_ID;
        const streamingDateRaw = await getStreamingReleaseDate(tmdbId);

        if (streamingDateRaw) {
          // Update Airtable with streaming date and flag
          updates.push(
            airtableAxios.patch(
              `${AIRTABLE_FOLLOWED_MOVIES_TABLE}/${movie.id}`,
              {
                fields: {
                  StreamingReleaseDate: streamingDateRaw,
                  StreamingDateAvailable: true,
                },
              }
            )
          );

          // Send notification email
          const userId = movie.fields.User?.[0];
          const userEmail = userIdToEmail[userId];
          if (userEmail) {
            const subject = `📺 Streaming release date available for "${movie.fields.Title}"!`;
            const displayDate = new Date(streamingDateRaw)
              .toISOString()
              .split("T")[0];
            const htmlContent = `
              <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; background: #fff; color: #333; padding: 24px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); text-align: center;">
                <h1 style="font-size: 1.5rem; color: #0078d4; margin-bottom: 0.5rem;">📺 Streaming Release Date Added!</h1>
                <p style="font-size: 1rem; margin-bottom: 1rem;">
                  The movie <strong>${
                    movie.fields.Title
                  }</strong> now has a confirmed streaming release date: <strong>${displayDate}</strong>.
                </p>
                <p style="font-size: 1rem; margin-bottom: 1rem;">
                  We'll notify you again when it is actually released.
                </p>
                ${
                  movie.fields.PosterPath
                    ? `<img src="https://image.tmdb.org/t/p/w500${movie.fields.PosterPath}" alt="${movie.fields.Title}" style="width: 100%; max-width: 320px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 1rem;" />`
                    : ""
                }
                <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">
                  You’re receiving this email because you followed <strong>${
                    movie.fields.Title
                  }</strong> on Movie Tracker.
                </p>
              </div>
            `;

            // Fire and forget email - we don't want to fail entire job for one email error
            sendEmail({ to: userEmail, subject, htmlContent }).catch((err) => {
              console.error(
                `Failed to send streaming date email to ${userEmail}:`,
                err.message
              );
            });
          }
        }
      } catch (err) {
        console.error(
          `Error checking streaming date for TMDB ID ${movie.fields.TMDB_ID}:`,
          err.message
        );
      }
    }

    // Wait for all Airtable updates
    await Promise.all(updates);

    res.send(`Updated streaming dates for ${updates.length} movies.`);
  } catch (err) {
    console.error("Streaming dates check error:", err);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
