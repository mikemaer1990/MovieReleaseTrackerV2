const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const { getReleaseData } = require("../services/tmdb");
const sendEmail = require("../services/send-email");
const { generateStreamingDateEmailHTML, generateTheatricalDateEmailHTML } = require("../services/email-templates");

const AIRTABLE_FOLLOWED_MOVIES_TABLE =
  process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;
const AIRTABLE_USERS_TABLE = process.env.AIRTABLE_USERS_TABLE;
const cronSecret = process.env.CRON_SECRET;

router.get("/", async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send("Unauthorized");
  }

  try {
    console.log('[DATE-CHECK] Starting date check for movies missing theatrical or streaming dates...');
    
    // 1. Fetch all followed movies that might be missing dates
    // - Missing theatrical dates (ReleaseDate is empty)
    // - Missing streaming dates for streaming/both follows (StreamingDateAvailable is false)
    const filterFormula = `OR(
      {ReleaseDate} = BLANK(),
      AND(
        OR(
          {FollowType} = "streaming",
          {FollowType} = "both"
        ),
        NOT({StreamingDateAvailable})
      )
    )`;

    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: { 
        filterByFormula: filterFormula,
        maxRecords: 100 // Limit batch size for performance
      },
    });

    const moviesToCheck = response.data.records;
    
    console.log(`[DATE-CHECK] Found ${moviesToCheck.length} movies to check`);

    if (moviesToCheck.length === 0) {
      console.log('[DATE-CHECK] No movies need date updates.');
      return res.json({ 
        success: true, 
        message: 'No updates needed', 
        processed: 0,
        theatricalUpdated: 0,
        streamingUpdated: 0 
      });
    }

    // Fetch user emails for notifications (with error handling)
    const userIds = [
      ...new Set(moviesToCheck.flatMap((m) => m.fields.User || [])),
    ];
    
    console.log(`[DATE-CHECK] Fetching emails for ${userIds.length} unique users`);
    
    const userIdToEmail = {};
    await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const userRes = await airtableAxios.get(
            `${AIRTABLE_USERS_TABLE}/${userId}`
          );
          userIdToEmail[userId] = userRes.data.fields.Email;
        } catch (err) {
          console.error(`[DATE-CHECK] Failed to fetch user ${userId}:`, err.message);
        }
      })
    );

    // 2. Process movies in batches with rate limiting
    const updates = [];
    const emailPromises = [];
    const emailsSent = [];
    let processedCount = 0;
    let theatricalUpdated = 0;
    let streamingUpdated = 0;
    
    console.log('[DATE-CHECK] Processing movies...');

    for (const movie of moviesToCheck) {
      try {
        const tmdbId = movie.fields.TMDB_ID;
        console.log(`[DATE-CHECK] Checking TMDB ID ${tmdbId} for "${movie.fields.Title}"`);
        
        const releaseData = await getReleaseData(tmdbId);
        const correctTheatricalDate = releaseData.usTheatrical || releaseData.primary;
        const streamingDateRaw = releaseData.streaming;
        processedCount++;

        const currentTheatricalDate = movie.fields.ReleaseDate;
        const followType = movie.fields.FollowType;
        const hasStreamingDateAvailable = movie.fields.StreamingDateAvailable;
        
        const fieldsToUpdate = {};
        let needsUpdate = false;
        let updateTypes = [];

        // Check if theatrical date needs updating
        if (correctTheatricalDate && !currentTheatricalDate) {
          fieldsToUpdate.ReleaseDate = correctTheatricalDate;
          needsUpdate = true;
          updateTypes.push('theatrical');
          theatricalUpdated++;
          console.log(`[DATE-CHECK] Found theatrical date for "${movie.fields.Title}": ${correctTheatricalDate}`);
        }

        // Check if streaming date needs updating (for streaming/both follows)
        if ((followType === 'streaming' || followType === 'both') && streamingDateRaw && !hasStreamingDateAvailable) {
          fieldsToUpdate.StreamingReleaseDate = streamingDateRaw;
          fieldsToUpdate.StreamingDateAvailable = true;
          needsUpdate = true;
          updateTypes.push('streaming');
          streamingUpdated++;
          console.log(`[DATE-CHECK] Found streaming date for "${movie.fields.Title}": ${streamingDateRaw}`);
        }
        
        if (needsUpdate) {
          // Update Airtable with new dates
          updates.push(
            airtableAxios.patch(
              `${AIRTABLE_FOLLOWED_MOVIES_TABLE}/${movie.id}`,
              { fields: fieldsToUpdate }
            )
          );

          // Send notification emails for date updates - but only if the follow type matches the update
          const userId = movie.fields.User?.[0];
          const userEmail = userIdToEmail[userId];
          
          if (userEmail && updateTypes.length > 0) {
            // Send theatrical date email ONLY if this is a theatrical or both follow
            if (updateTypes.includes('theatrical') && (followType === 'theatrical' || followType === 'both')) {
              const subject = `🎬 Theatrical date added for "${movie.fields.Title}"`;
              // Parse date carefully to avoid timezone issues
              const [year, month, day] = correctTheatricalDate.split('-');
              const displayDate = new Date(year, month - 1, day)
                .toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
              const htmlContent = generateTheatricalDateEmailHTML({
                title: movie.fields.Title,
                posterPath: movie.fields.PosterPath,
                theatricalDate: displayDate,
                tmdbId: movie.fields.TMDB_ID
              });

              // Add email to promises array for tracking
              const emailPromise = sendEmail({ to: userEmail, subject, htmlContent })
                .then(() => {
                  console.log(`[DATE-CHECK] Theatrical date email sent to ${userEmail} for "${movie.fields.Title}" (${followType} follow)`);
                  emailsSent.push(`${movie.fields.Title} (theatrical)`);
                  return { success: true, type: 'theatrical', movie: movie.fields.Title };
                })
                .catch((err) => {
                  console.error(
                    `[DATE-CHECK] Failed to send theatrical date email to ${userEmail}:`,
                    err.message
                  );
                  return { success: false, type: 'theatrical', movie: movie.fields.Title, error: err.message };
                });
              emailPromises.push(emailPromise);
            } else if (updateTypes.includes('theatrical')) {
              console.log(`[DATE-CHECK] Skipping theatrical email for "${movie.fields.Title}" - user follows ${followType}, not theatrical`);
            }
            
            // Send streaming date email ONLY if this is a streaming or both follow
            if (updateTypes.includes('streaming') && (followType === 'streaming' || followType === 'both')) {
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

              // Add email to promises array for tracking
              const emailPromise = sendEmail({ to: userEmail, subject, htmlContent })
                .then(() => {
                  console.log(`[DATE-CHECK] Streaming date email sent to ${userEmail} for "${movie.fields.Title}" (${followType} follow)`);
                  emailsSent.push(`${movie.fields.Title} (streaming)`);
                  return { success: true, type: 'streaming', movie: movie.fields.Title };
                })
                .catch((err) => {
                  console.error(
                    `[DATE-CHECK] Failed to send streaming date email to ${userEmail}:`,
                    err.message
                  );
                  return { success: false, type: 'streaming', movie: movie.fields.Title, error: err.message };
                });
              emailPromises.push(emailPromise);
            } else if (updateTypes.includes('streaming')) {
              console.log(`[DATE-CHECK] Skipping streaming email for "${movie.fields.Title}" - user follows ${followType}, not streaming`);
            }
          }
        } else {
          const missingTypes = [];
          if (!currentTheatricalDate && !correctTheatricalDate) missingTypes.push('theatrical');
          if ((followType === 'streaming' || followType === 'both') && !hasStreamingDateAvailable && !streamingDateRaw) missingTypes.push('streaming');
          
          if (missingTypes.length > 0) {
            console.log(`[DATE-CHECK] No ${missingTypes.join(' or ')} date found for "${movie.fields.Title}"`);
          } else {
            console.log(`[DATE-CHECK] "${movie.fields.Title}" already has all available dates`);
          }
        }
        
        // Add small delay to avoid rate limiting
        if (processedCount % 10 === 0) {
          console.log(`[DATE-CHECK] Processed ${processedCount}/${moviesToCheck.length} movies`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay every 10 requests
        }
        
      } catch (err) {
        console.error(
          `[DATE-CHECK] Error checking dates for TMDB ID ${movie.fields.TMDB_ID} ("${movie.fields.Title}"):`,
          err.message
        );
      }
    }

    // Wait for all Airtable updates with error handling
    console.log(`[DATE-CHECK] Updating ${updates.length} records in Airtable...`);
    
    const updateResults = await Promise.allSettled(updates);
    const successfulUpdates = updateResults.filter(result => result.status === 'fulfilled').length;
    const failedUpdates = updateResults.filter(result => result.status === 'rejected');
    
    if (failedUpdates.length > 0) {
      console.error(`[DATE-CHECK] ${failedUpdates.length} Airtable updates failed:`);
      failedUpdates.forEach(result => console.error(result.reason?.message || result.reason));
    }
    
    // Wait for all emails to complete
    console.log(`[DATE-CHECK] Waiting for ${emailPromises.length} emails to complete...`);
    
    const emailResults = await Promise.allSettled(emailPromises);
    const successfulEmails = emailResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;
    const failedEmails = emailResults.filter(result => 
      result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
    );
    
    if (failedEmails.length > 0) {
      console.error(`[DATE-CHECK] ${failedEmails.length} emails failed to send`);
    }
    
    console.log(`[DATE-CHECK] Completed! Processed: ${processedCount}, Total Updated: ${successfulUpdates}, Theatrical: ${theatricalUpdated}, Streaming: ${streamingUpdated}, Emails Sent: ${successfulEmails}, Email Failures: ${failedEmails.length}`);

    res.json({
      success: true,
      message: `Date check completed`,
      processed: processedCount,
      totalUpdated: successfulUpdates,
      theatricalUpdated,
      streamingUpdated,
      failed: failedUpdates.length,
      emailsSent: successfulEmails,
      emailsFailed: failedEmails.length,
      moviesWithNewDates: emailsSent
    });
  } catch (err) {
    console.error('[DATE-CHECK] Fatal error:', err.message);
    console.error(err.stack);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
});

module.exports = router;
