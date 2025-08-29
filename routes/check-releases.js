const express = require("express");
const router = express.Router();
const airtableAxios = require("../services/airtable").airtableAxios;
const sendEmail = require("../services/send-email");
const AIRTABLE_FOLLOWED_MOVIES_TABLE =
  process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;
const cronSecret = process.env.CRON_SECRET;

router.get("/", async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send("Unauthorized");
  }
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // Date part only in YYYY-MM-DD format
    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: {
        filterByFormula: `IS_SAME({ReleaseDate}, '${todayStr}', 'day')`,
      },
    });
    const followedMovies = response.data.records;

    // Step 1: Gather unique User record IDs
    const userIds = [
      ...new Set(followedMovies.flatMap((movie) => movie.fields.User || [])),
    ];

    // Step 2: Fetch user emails from the Users table
    const userResponses = await Promise.all(
      userIds.map(async (userId) => {
        const userRes = await airtableAxios.get(
          `${process.env.AIRTABLE_USERS_TABLE}/${userId}`
        );
        return {
          id: userId,
          email: userRes.data.fields.Email,
        };
      })
    );

    // Step 3: Create a lookup map from User ID to Email
    const userIdToEmail = Object.fromEntries(
      userResponses.map((user) => [user.id, user.email])
    );

    // Step 4: Build the dueReleases array with actual emails
    const dueReleases = followedMovies.map((movie) => {
      const userId = movie.fields.User?.[0]; // assuming only one user per movie
      const userEmail = userIdToEmail[userId];
      return {
        id: movie.fields.TMDB_ID,
        title: movie.fields.Title,
        releaseDate: movie.fields.ReleaseDate,
        posterPath: movie.fields.PosterPath,
        userEmail,
      };
    });

    console.log(`Sending ${dueReleases.length} emails...`);
    // call your Brevo email sender here using dueReleases
    await Promise.all(
      dueReleases.map(async (release) => {
        if (!release.userEmail) return;

        const subject = `🎬 "${release.title}" is out today!`;
        const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 480px; margin: 0 auto; background: #fff; color: #333; padding: 24px; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); text-align: center;">
          <h1 style="font-size: 1.5rem; color: #0078d4; margin-bottom: 0.5rem;">🎬 It's Release Day!</h1>
          <p style="font-size: 1rem; margin-bottom: 1rem;">
            <strong>${release.title}</strong> is officially out today (${
          release.releaseDate
        })!
          </p>
          ${
            release.posterPath
              ? `
            <img src="https://image.tmdb.org/t/p/w500${release.posterPath}"
              alt="${release.title}"
              style="width: 100%; max-width: 320px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 1rem;" />
          `
              : ""
          }
          <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">
            You’re receiving this email because you followed <strong>${
              release.title
            }</strong> on Movie Tracker.
          </p>
        </div>
      `;

        try {
          await sendEmail({ to: release.userEmail, subject, htmlContent });
        } catch (err) {
          console.error(
            `Failed to send email to ${release.userEmail}:`,
            err.message
          );
        }
      })
    );

    return res.send("Done");
  } catch (err) {
    console.error("Release check error:", err);
    return res.status(500).send("Internal server error");
  }
});

module.exports = router;
