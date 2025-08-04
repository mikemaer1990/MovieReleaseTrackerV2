// services/tmdb.js
const axios = require("axios");
const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function getStreamingReleaseDate(movieId) {
  try {
    const response = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieId}/release_dates`,
      {
        params: { api_key: TMDB_API_KEY },
      }
    );

    const results = response.data.results;

    if (!Array.isArray(results) || results.length === 0) return null;

    // Try to get releases for your region (US), else fallback to first available region
    let releases = results.find((r) => r.iso_3166_1 === "US");

    if (!releases) releases = results[0]; // fallback

    if (!releases || !Array.isArray(releases.release_dates)) return null;

    // Filter for digital (4) or physical (5) release types
    const homeReleases = releases.release_dates
      .filter((r) => [4, 5].includes(r.type))
      .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));

    if (homeReleases.length === 0) return null;

    // Return earliest streaming release date in YYYY-MM-DD format
    return homeReleases[0].release_date.split("T")[0];
  } catch (error) {
    console.error("Error fetching streaming release date:", error);
    return null;
  }
}

module.exports = { getStreamingReleaseDate };
