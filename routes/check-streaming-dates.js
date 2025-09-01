const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const getStreamingReleaseDate =
  require("../services/tmdb").getStreamingReleaseDate;
const sendEmail = require("../services/send-email");
const { generateStreamingDateEmailHTML } = require("../services/email-templates");

const AIRTABLE_FOLLOWED_MOVIES_TABLE =
  process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE;
const cronSecret = process.env.CRON_SECRET;

router.get("/", async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send("Unauthorized");
  }

  try {
    console.log('[STREAMING-CHECK] Starting streaming dates check...');
    
    // 1. Fetch all followed movies missing streaming dates but should have them
    const filterFormula = `AND(
      OR(
        {FollowType} = "streaming",
        {FollowType} = "both"
      ),
      NOT({StreamingDateAvailable})
    )`;

    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: { 
        filterByFormula: filterFormula,
        maxRecords: 100 // Limit batch size for performance
      },
    });

    const moviesToCheck = response.data.records;
    
    console.log(`[STREAMING-CHECK] Found ${moviesToCheck.length} movies to check`);

    if (moviesToCheck.length === 0) {
      console.log('[STREAMING-CHECK] No movies need streaming date updates.');
      return res.json({ 
        success: true, 
        message: 'No updates needed', 
        processed: 0,
        updated: 0 
      });
    }

    // Fetch user emails for notifications (with error handling)
    const userIds = [
      ...new Set(moviesToCheck.flatMap((m) => m.fields.User || [])),
    ];
    
    console.log(`[STREAMING-CHECK] Fetching emails for ${userIds.length} unique users`);
    
    const userIdToEmail = {};
    await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const userRes = await airtableAxios.get(
            `${AIRTABLE_USERS_TABLE}/${userId}`
          );
          userIdToEmail[userId] = userRes.data.fields.Email;
        } catch (err) {
          console.error(`[STREAMING-CHECK] Failed to fetch user ${userId}:`, err.message);
        }
      })
    );

    // 2. Process movies in batches with rate limiting
    const updates = [];
    const emailsSent = [];
    let processedCount = 0;
    
    console.log('[STREAMING-CHECK] Processing movies...');

    for (const movie of moviesToCheck) {
      try {
        const tmdbId = movie.fields.TMDB_ID;
        console.log(`[STREAMING-CHECK] Checking TMDB ID ${tmdbId} for "${movie.fields.Title}"`);
        
        const streamingDateRaw = await getStreamingReleaseDate(tmdbId);
        processedCount++;

        if (streamingDateRaw) {
          console.log(`[STREAMING-CHECK] Found streaming date for "${movie.fields.Title}": ${streamingDateRaw}`);
          
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
            const subject = `📺 Streaming date added for "${movie.fields.Title}"`;
            // Parse date carefully to avoid timezone issues
            const [year, month, day] = streamingDateRaw.split('-');
            const displayDate = new Date(year, month - 1, day)
              .toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            const htmlContent = generateStreamingDateEmailHTML({
              title: movie.fields.Title,
              posterPath: movie.fields.PosterPath,
              streamingDate: displayDate,
              tmdbId: movie.fields.TMDB_ID
            });

            // Fire and forget email - we don't want to fail entire job for one email error
            sendEmail({ to: userEmail, subject, htmlContent })
              .then(() => {
                console.log(`[STREAMING-CHECK] Email sent to ${userEmail} for "${movie.fields.Title}"`);
                emailsSent.push(movie.fields.Title);
              })
              .catch((err) => {
                console.error(
                  `[STREAMING-CHECK] Failed to send streaming date email to ${userEmail}:`,
                  err.message
                );
              });
          }
        } else {
          console.log(`[STREAMING-CHECK] No streaming date found for "${movie.fields.Title}"`);
        }
        
        // Add small delay to avoid rate limiting
        if (processedCount % 10 === 0) {
          console.log(`[STREAMING-CHECK] Processed ${processedCount}/${moviesToCheck.length} movies`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay every 10 requests
        }
        
      } catch (err) {
        console.error(
          `[STREAMING-CHECK] Error checking streaming date for TMDB ID ${movie.fields.TMDB_ID} ("${movie.fields.Title}"):`,
          err.message
        );
      }
    }

    // Wait for all Airtable updates with error handling
    console.log(`[STREAMING-CHECK] Updating ${updates.length} records in Airtable...`);
    
    const updateResults = await Promise.allSettled(updates);
    const successfulUpdates = updateResults.filter(result => result.status === 'fulfilled').length;
    const failedUpdates = updateResults.filter(result => result.status === 'rejected');
    
    if (failedUpdates.length > 0) {
      console.error(`[STREAMING-CHECK] ${failedUpdates.length} Airtable updates failed:`);
      failedUpdates.forEach(result => console.error(result.reason?.message || result.reason));
    }
    
    console.log(`[STREAMING-CHECK] Completed! Processed: ${processedCount}, Updated: ${successfulUpdates}, Emails: ${emailsSent.length}`);

    res.json({
      success: true,
      message: `Streaming dates check completed`,
      processed: processedCount,
      updated: successfulUpdates,
      failed: failedUpdates.length,
      emailsSent: emailsSent.length,
      moviesWithNewDates: emailsSent
    });
  } catch (err) {
    console.error('[STREAMING-CHECK] Fatal error:', err.message);
    console.error(err.stack);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
});

module.exports = router;
