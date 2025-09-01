// services/tmdb.js
const axios = require("axios");
const { getCachedData, setCachedData } = require("./cache");

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Create axios instance with default config
const tmdbAxios = axios.create({
  baseURL: TMDB_BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
});

/**
 * Get streaming release date for a movie
 */
async function getStreamingReleaseDate(movieId) {
  try {
    const response = await tmdbAxios.get(`/movie/${movieId}/release_dates`);
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

/**
 * Get movie details by ID with optional append_to_response
 */
async function getMovieDetails(movieId, appendToResponse = "") {
  const cacheKey = `movie_${movieId}_${appendToResponse}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const params = {};
    if (appendToResponse) params.append_to_response = appendToResponse;

    const response = await tmdbAxios.get(`/movie/${movieId}`, { params });
    setCachedData(cacheKey, response.data, 3600); // Cache for 1 hour
    return response.data;
  } catch (error) {
    console.error(`Error fetching movie details for ${movieId}:`, error);
    throw error;
  }
}

/**
 * Search movies by query
 */
async function searchMovies(query, page = 1) {
  try {
    const response = await tmdbAxios.get(`/search/movie`, {
      params: { query, page }
    });
    return response.data;
  } catch (error) {
    console.error("Error searching movies:", error);
    throw error;
  }
}

/**
 * Get upcoming movies
 */
async function getUpcomingMovies(page = 1, region = "US") {
  try {
    const response = await tmdbAxios.get(`/movie/upcoming`, {
      params: { page, region }
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching upcoming movies:", error);
    throw error;
  }
}

/**
 * Discover movies with filters
 */
async function discoverMovies(options = {}) {
  try {
    const response = await tmdbAxios.get(`/discover/movie`, { params: options });
    return response.data;
  } catch (error) {
    console.error("Error discovering movies:", error);
    throw error;
  }
}

/**
 * Get movie genres list
 */
async function getGenres() {
  const cacheKey = "movie_genres";
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const response = await tmdbAxios.get(`/genre/movie/list`);
    setCachedData(cacheKey, response.data, 86400); // Cache for 24 hours
    return response.data;
  } catch (error) {
    console.error("Error fetching genres:", error);
    throw error;
  }
}

module.exports = {
  getStreamingReleaseDate,
  getMovieDetails,
  searchMovies,
  getUpcomingMovies,
  discoverMovies,
  getGenres,
  tmdbAxios // Export for any custom needs
};
