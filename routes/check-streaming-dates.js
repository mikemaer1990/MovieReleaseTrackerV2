const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const { getReleaseData } = require("../services/tmdb");
const sendEmail = require("../services/send-email");
const { generateStreamingDateEmailHTML, generateTheatricalDateEmailHTML, generateDatesBatchEmailHTML } = require("../services/email-templates");

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
    const emailsSent = [];
    const movieUpdatesForEmails = []; // Collect all updates for batching
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

          // Collect updates for batched email notifications
          const userId = movie.fields.User?.[0];
          const userEmail = userIdToEmail[userId];
          
          if (userEmail && updateTypes.length > 0) {
            // Add theatrical date update ONLY if this is a theatrical or both follow
            if (updateTypes.includes('theatrical') && (followType === 'theatrical' || followType === 'both')) {
              // Parse date carefully to avoid timezone issues
              const [year, month, day] = correctTheatricalDate.split('-');
              const displayDate = new Date(year, month - 1, day)
                .toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
              
              movieUpdatesForEmails.push({
                userEmail,
                type: 'theatrical',
                title: movie.fields.Title,
                posterPath: movie.fields.PosterPath,
                theatricalDate: displayDate,
                tmdbId: movie.fields.TMDB_ID,
                followType
              });
              console.log(`[DATE-CHECK] Queued theatrical date email for "${movie.fields.Title}" (${followType} follow)`);
            } else if (updateTypes.includes('theatrical')) {
              console.log(`[DATE-CHECK] Skipping theatrical email for "${movie.fields.Title}" - user follows ${followType}, not theatrical`);
            }
            
            // Add streaming date update ONLY if this is a streaming or both follow
            if (updateTypes.includes('streaming') && (followType === 'streaming' || followType === 'both')) {
              // Parse date carefully to avoid timezone issues
              const [year, month, day] = streamingDateRaw.split('-');
              const displayDate = new Date(year, month - 1, day)
                .toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
              
              movieUpdatesForEmails.push({
                userEmail,
                type: 'streaming',
                title: movie.fields.Title,
                posterPath: movie.fields.PosterPath,
                streamingDate: displayDate,
                tmdbId: movie.fields.TMDB_ID,
                followType
              });
              console.log(`[DATE-CHECK] Queued streaming date email for "${movie.fields.Title}" (${followType} follow)`);
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
    
    // Send batched emails for date updates
    console.log(`[DATE-CHECK] Processing ${movieUpdatesForEmails.length} movie updates for batched emails...`);
    
    // Group updates by user email
    const updatesByUser = {};
    movieUpdatesForEmails.forEach(update => {
      if (!updatesByUser[update.userEmail]) {
        updatesByUser[update.userEmail] = {
          theatrical: [],
          streaming: []
        };
      }
      updatesByUser[update.userEmail][update.type].push(update);
    });
    
    const userEmails = Object.keys(updatesByUser);
    const emailPromises = [];
    let successfulEmails = 0;
    let failedEmails = 0;
    
    console.log(`[DATE-CHECK] Sending batched date update notifications to ${userEmails.length} users...`);
    
    // Send batched emails
    for (const userEmail of userEmails) {
      const userUpdates = updatesByUser[userEmail];
      const theatricalUpdates = userUpdates.theatrical;
      const streamingUpdates = userUpdates.streaming;
      const totalUpdates = theatricalUpdates.length + streamingUpdates.length;
      
      try {
        if (totalUpdates === 1) {
          // Send individual email for single update (maintains existing UX)
          const update = theatricalUpdates.length > 0 ? theatricalUpdates[0] : streamingUpdates[0];
          const isStreaming = update.type === 'streaming';
          const subject = `${isStreaming ? '📺' : '🎬'} ${isStreaming ? 'Streaming' : 'Theatrical'} date added for "${update.title}"`;
          
          const htmlContent = isStreaming 
            ? generateStreamingDateEmailHTML({
                title: update.title,
                posterPath: update.posterPath,
                streamingDate: update.streamingDate,
                tmdbId: update.tmdbId
              })
            : generateTheatricalDateEmailHTML({
                title: update.title,
                posterPath: update.posterPath,
                theatricalDate: update.theatricalDate,
                tmdbId: update.tmdbId
              });

          await sendEmail({ to: userEmail, subject, htmlContent });
          console.log(`[DATE-CHECK] Individual date email sent to ${userEmail} for "${update.title}" (${update.type})`);
          emailsSent.push(`${update.title} (${update.type})`);
          successfulEmails++;
          
        } else {
          // Send batched email for multiple updates
          const theatricalCount = theatricalUpdates.length;
          const streamingCount = streamingUpdates.length;
          
          let subjectText = '';
          if (theatricalCount > 0 && streamingCount > 0) {
            subjectText = `📅 New release dates found for ${totalUpdates} movies`;
          } else if (theatricalCount > 0) {
            subjectText = `🎬 Theatrical dates added for ${totalUpdates} movies`;
          } else {
            subjectText = `📺 Streaming dates added for ${totalUpdates} movies`;
          }

          const htmlContent = generateDatesBatchEmailHTML({
            theatricalMovies: theatricalUpdates,
            streamingMovies: streamingUpdates
          });

          await sendEmail({ to: userEmail, subject: subjectText, htmlContent });
          console.log(`[DATE-CHECK] Batch date email sent to ${userEmail} for ${totalUpdates} movies (${theatricalCount} theatrical, ${streamingCount} streaming)`);
          
          // Add all updates to the sent list
          [...theatricalUpdates, ...streamingUpdates].forEach(update => {
            emailsSent.push(`${update.title} (${update.type})`);
          });
          successfulEmails++;
        }
      } catch (err) {
        console.error(
          `[DATE-CHECK] Failed to send date update email to ${userEmail} for ${totalUpdates} movies:`,
          err.message
        );
        failedEmails++;
      }
    }
    
    if (failedEmails > 0) {
      console.error(`[DATE-CHECK] ${failedEmails} batched emails failed to send`);
    }
    
    console.log(`[DATE-CHECK] Completed! Processed: ${processedCount}, Total Updated: ${successfulUpdates}, Theatrical: ${theatricalUpdated}, Streaming: ${streamingUpdated}, Users Notified: ${successfulEmails}, Email Failures: ${failedEmails}`);

    res.json({
      success: true,
      message: `Date check completed`,
      processed: processedCount,
      totalUpdated: successfulUpdates,
      theatricalUpdated,
      streamingUpdated,
      failed: failedUpdates.length,
      usersNotified: successfulEmails,
      emailsFailed: failedEmails,
      totalMovieUpdates: emailsSent.length,
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
