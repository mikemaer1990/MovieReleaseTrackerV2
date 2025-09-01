const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const sendEmail = require("../services/send-email");
const { generateReleaseEmailHTML } = require("../services/email-templates");
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

    console.log(`[RELEASE-CHECK] Sending ${dueReleases.length} release notification emails...`);
    
    const emailResults = [];
    const emailsSent = [];
    let emailsFailed = 0;
    
    // Send emails with detailed tracking
    await Promise.allSettled(
      dueReleases.map(async (release) => {
        if (!release.userEmail) {
          console.log(`[RELEASE-CHECK] No email for user, skipping "${release.title}"`);
          return;
        }

        const isStreaming = release.followType === "streaming";
        const releaseTypeText = isStreaming ? "streaming" : "in theaters";
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

        try {
          await sendEmail({ to: release.userEmail, subject, htmlContent });
          console.log(`[RELEASE-CHECK] Email sent to ${release.userEmail} for "${release.title}" (${release.followType})`);
          emailsSent.push(`${release.title} (${release.followType})`);
        } catch (err) {
          console.error(
            `[RELEASE-CHECK] Failed to send email to ${release.userEmail} for "${release.title}":`,
            err.message
          );
          emailsFailed++;
        }
      })
    );

    console.log(`[RELEASE-CHECK] Completed! Theatrical: ${theatricalMovies.length}, Streaming: ${streamingMovies.length}, Emails sent: ${emailsSent.length}, Failed: ${emailsFailed}`);

    return res.json({
      success: true,
      message: 'Release check completed',
      date: todayStr,
      theatrical: theatricalMovies.length,
      streaming: streamingMovies.length,
      totalEmails: emailsSent.length,
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
