// services/tmdb.js
const axios = require("axios");
const TMDB_API_KEY = process.env.TMDB_API_KEY;

async function getStreamingReleaseDate(movieId) {
  const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}/release_dates`, {
    params: { api_key: TMDB_API_KEY }
  });

  const releases = response.data.results.find(r => r.iso_3166_1 === "US"); // or change to your region
  if (!releases) return null;

  // Look for digital (type 4) or physical (type 5) release
  const homeRelease = releases.release_dates.find(r =>
    [4, 5].includes(r.type)
  );

  return homeRelease ? homeRelease.release_date.split("T")[0] : null;
}

module.exports = { getStreamingReleaseDate };
