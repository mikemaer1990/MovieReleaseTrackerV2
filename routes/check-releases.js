const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const sendEmail = require("../services/send-email");
const { generateReleaseEmailHTML, generateReleaseBatchEmailHTML } = require("../services/email-templates");
const AIRTABLE_FOLLOWED_MOVIES_TABLE = "FollowedMovies";
const cronSecret = process.env.CRON_SECRET;

router.get("/", async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send("Unauthorized");
  }
  try {
    console.log('[RELEASE-CHECK] Starting daily release check...');
    
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // Date part only in YYYY-MM-DD format
    
    console.log(`[RELEASE-CHECK] Checking releases for ${todayStr}`);

    // Check for both theatrical and streaming releases today
    const [theatricalResponse, streamingResponse] = await Promise.all([
      // Theatrical releases (using ReleaseDate)
      airtableAxios.get("FollowedMovies", {
        params: {
          filterByFormula: `AND(IS_SAME({ReleaseDate}, '${todayStr}', 'day'), {FollowType} = 'theatrical')`,
        },
      }),
      // Streaming releases (using StreamingReleaseDate)
      airtableAxios.get("FollowedMovies", {
        params: {
          filterByFormula: `AND(IS_SAME({StreamingReleaseDate}, '${todayStr}', 'day'), {FollowType} = 'streaming')`,
        },
      }),
    ]);

    const theatricalMovies = theatricalResponse.data.records;
    const streamingMovies = streamingResponse.data.records;
    const followedMovies = [...theatricalMovies, ...streamingMovies];
    
    console.log(`[RELEASE-CHECK] Found ${theatricalMovies.length} theatrical releases and ${streamingMovies.length} streaming releases`);
    
    if (followedMovies.length === 0) {
      console.log('[RELEASE-CHECK] No releases due today.');
      return res.json({ 
        success: true, 
        message: 'No releases due today', 
        date: todayStr,
        theatrical: 0,
        streaming: 0,
        totalEmails: 0,
        releases: []
      });
    }

    // Step 1: Gather unique User record IDs
    const userIds = [
      ...new Set(followedMovies.flatMap((movie) => movie.fields.User || [])),
    ];

    console.log(`[RELEASE-CHECK] Fetching emails for ${userIds.length} unique users`);
    
    // Step 2: Fetch user emails from the Users table with error handling
    const userIdToEmail = {};
    await Promise.allSettled(
      userIds.map(async (userId) => {
        try {
          const userRes = await airtableAxios.get(
            `${process.env.AIRTABLE_USERS_TABLE}/${userId}`
          );
          userIdToEmail[userId] = userRes.data.fields.Email;
        } catch (err) {
          console.error(`[RELEASE-CHECK] Failed to fetch user ${userId}:`, err.message);
        }
      })
    );

    // Step 4: Build the dueReleases array with actual emails
    const dueReleases = followedMovies.map((movie) => {
      const userId = movie.fields.User?.[0]; // assuming only one user per movie
      const userEmail = userIdToEmail[userId];
      const isStreaming = movie.fields.FollowType === "streaming";
      return {
        id: movie.fields.TMDB_ID,
        title: movie.fields.Title,
        releaseDate: isStreaming
          ? movie.fields.StreamingReleaseDate
          : movie.fields.ReleaseDate,
        posterPath: movie.fields.PosterPath,
        userEmail,
        followType: movie.fields.FollowType,
      };
    });

    // Group releases by user email for batched notifications
    const releasesByUser = {};
    dueReleases.forEach((release) => {
      if (!release.userEmail) {
        console.log(`[RELEASE-CHECK] No email for user, skipping "${release.title}"`);
        return;
      }
      
      if (!releasesByUser[release.userEmail]) {
        releasesByUser[release.userEmail] = [];
      }
      releasesByUser[release.userEmail].push(release);
    });

    const userEmails = Object.keys(releasesByUser);
    console.log(`[RELEASE-CHECK] Sending batched release notifications to ${userEmails.length} users...`);
    
    const emailResults = [];
    const emailsSent = [];
    let emailsFailed = 0;
    
    // Send batched emails with detailed tracking
    await Promise.allSettled(
      userEmails.map(async (userEmail) => {
        const userReleases = releasesByUser[userEmail];
        const movieCount = userReleases.length;
        
        try {
          if (movieCount === 1) {
            // Send individual email for single movie (maintains existing UX)
            const release = userReleases[0];
            const isStreaming = release.followType === "streaming";
            const emoji = isStreaming ? "📺" : "🎬";

            const subject = `${emoji} "${release.title}" is ${
              isStreaming ? "available for streaming" : "now in theaters"
            }!`;
            
            const htmlContent = generateReleaseEmailHTML({
              title: release.title,
              posterPath: release.posterPath,
              releaseDate: release.releaseDate,
              followType: release.followType,
              tmdbId: release.id
            });

            await sendEmail({ to: userEmail, subject, htmlContent });
            console.log(`[RELEASE-CHECK] Individual email sent to ${userEmail} for "${release.title}" (${release.followType})`);
            emailsSent.push(`${release.title} (${release.followType})`);
            
          } else {
            // Send batched email for multiple movies
            const theatricalCount = userReleases.filter(r => r.followType === 'theatrical').length;
            const streamingCount = userReleases.filter(r => r.followType === 'streaming').length;
            
            let subjectEmojis = '';
            let subjectText = '';
            
            if (theatricalCount > 0 && streamingCount > 0) {
              subjectEmojis = '🎬📺';
              subjectText = `${movieCount} of your movies are available today!`;
            } else if (theatricalCount > 0) {
              subjectEmojis = '🎬';
              subjectText = `${movieCount} of your movies are now in theaters!`;
            } else {
              subjectEmojis = '📺';
              subjectText = `${movieCount} of your movies are available for streaming!`;
            }

            const subject = `${subjectEmojis} ${subjectText}`;
            
            const htmlContent = generateReleaseBatchEmailHTML({
              movies: userReleases,
              date: todayStr
            });

            await sendEmail({ to: userEmail, subject, htmlContent });
            console.log(`[RELEASE-CHECK] Batch email sent to ${userEmail} for ${movieCount} movies (${theatricalCount} theatrical, ${streamingCount} streaming)`);
            
            // Add all movies to the sent list
            userReleases.forEach(release => {
              emailsSent.push(`${release.title} (${release.followType})`);
            });
          }
        } catch (err) {
          console.error(
            `[RELEASE-CHECK] Failed to send email to ${userEmail} for ${movieCount} movies:`,
            err.message
          );
          emailsFailed++;
        }
      })
    );

    console.log(`[RELEASE-CHECK] Completed! Theatrical: ${theatricalMovies.length}, Streaming: ${streamingMovies.length}, Users notified: ${userEmails.length}, Movie notifications: ${emailsSent.length}, Failed: ${emailsFailed}`);

    return res.json({
      success: true,
      message: 'Release check completed',
      date: todayStr,
      theatrical: theatricalMovies.length,
      streaming: streamingMovies.length,
      usersNotified: userEmails.length,
      totalMovieNotifications: emailsSent.length,
      emailsFailed,
      releases: emailsSent,
      theatricalReleases: theatricalMovies.map(m => m.fields.Title),
      streamingReleases: streamingMovies.map(m => m.fields.Title)
    });
  } catch (err) {
    console.error('[RELEASE-CHECK] Fatal error:', err.message);
    console.error(err.stack);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
});

module.exports = router;
