const express = require('express');
const router = express.Router();
const airtableAxios = require('../services/airtable').airtableAxios;
const sendEmail = require('../services/sendEmail');
const AIRTABLE_FOLLOWED_MOVIES_TABLE = process.env.AIRTABLE_FOLLOWED_MOVIES_TABLE;
const cronSecret = process.env.CRON_SECRET;

router.get('/', async (req, res) => {
  if (req.query.key !== cronSecret) {
    return res.status(401).send('Unauthorized');
  }
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Date part only in YYYY-MM-DD format
    const response = await airtableAxios.get(AIRTABLE_FOLLOWED_MOVIES_TABLE, {
      params: {
        filterByFormula: `IS_SAME({ReleaseDate}, '${todayStr}', 'day')`
      }
    });
    const followedMovies = response.data.records;

    // Step 1: Gather unique User record IDs
    const userIds = [...new Set(followedMovies.flatMap(movie => movie.fields.User || []))];

    // Step 2: Fetch user emails from the Users table
    const userResponses = await Promise.all(userIds.map(async userId => {
      const userRes = await airtableAxios.get(`${process.env.AIRTABLE_USERS_TABLE}/${userId}`);
      return {
        id: userId,
        email: userRes.data.fields.Email
      };
    }));

    // Step 3: Create a lookup map from User ID to Email
    const userIdToEmail = Object.fromEntries(userResponses.map(user => [user.id, user.email]));

    // Step 4: Build the dueReleases array with actual emails
    const dueReleases = followedMovies.map(movie => {
      const userId = movie.fields.User?.[0]; // assuming only one user per movie
      const userEmail = userIdToEmail[userId];
      return {
        id: movie.fields.TMDB_ID,
        title: movie.fields.Title,
        releaseDate: movie.fields.ReleaseDate,
        posterPath: movie.fields.PosterPath,
        userEmail
      };
    });

    console.log(dueReleases)
    // call your Brevo email sender here using dueReleases
    await Promise.all(dueReleases.map(async release => {
      if (!release.userEmail) return;

      const subject = `🎬 "${release.title}" is out today!`;
      const htmlContent = `
        <h2>It's release day!</h2>
        <p><strong>${release.title}</strong> is officially out today: ${release.releaseDate}.</p>
        ${release.posterPath ? `<img src="https://image.tmdb.org/t/p/w500${release.posterPath}" alt="${release.title}" style="max-width: 300px;" />` : ''}
        <p>Thanks for using Movie Tracker. You’re receiving this because you followed this movie.</p>
      `;

      try {
        await sendEmail({ to: release.userEmail, subject, htmlContent });
        console.log(`Email sent to ${release.userEmail} for ${release.title}`);
      } catch (err) {
        console.error(`Failed to send email to ${release.userEmail}:`, err.message);
      }
    }));

    
    return res.json({ success: true, count: dueReleases.length });
  } catch (err) {
    console.error('Release check error:', err);
    return res.status(500).send('Internal server error');
  }
});

module.exports = router;
