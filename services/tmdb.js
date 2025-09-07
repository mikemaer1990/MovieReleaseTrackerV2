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
 * Get unified release data for a movie (theatrical, streaming, primary dates)
 * Single API call to fetch all release date information efficiently
 */
async function getReleaseData(movieId) {
  try {
    const response = await tmdbAxios.get(`/movie/${movieId}/release_dates`);
    const results = response.data.results;

    // Get primary release date from basic movie info
    let primaryDate = null;
    try {
      const movieDetails = await tmdbAxios.get(`/movie/${movieId}`);
      primaryDate = movieDetails.data.release_date;
    } catch (error) {
      console.error(`Error fetching primary date for movie ${movieId}:`, error);
    }

    if (!Array.isArray(results) || results.length === 0) {
      return {
        usTheatrical: null,
        streaming: null,
        primary: primaryDate
      };
    }

    // Look specifically for US releases
    const usReleases = results.find(r => r.iso_3166_1 === "US");
    
    let usTheatrical = null;
    let streaming = null;

    if (usReleases && Array.isArray(usReleases.release_dates)) {
      // Extract US theatrical dates (types 2 = limited theatrical, 3 = wide theatrical)
      const theatricalReleases = usReleases.release_dates
        .filter(r => [2, 3].includes(r.type))
        .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
      
      if (theatricalReleases.length > 0) {
        usTheatrical = theatricalReleases[0].release_date.split("T")[0];
      }

      // Extract streaming dates (types 4 = digital, 5 = physical)
      const streamingReleases = usReleases.release_dates
        .filter(r => [4, 5].includes(r.type))
        .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
      
      if (streamingReleases.length > 0) {
        streaming = streamingReleases[0].release_date.split("T")[0];
      }
    }

    return {
      usTheatrical,
      streaming,
      primary: primaryDate
    };

  } catch (error) {
    console.error(`Error fetching release data for movie ${movieId}:`, error);
    return {
      usTheatrical: null,
      streaming: null,
      primary: null
    };
  }
}

/**
 * Get streaming release date for a movie (backward compatibility wrapper)
 */
async function getStreamingReleaseDate(movieId) {
  const releaseData = await getReleaseData(movieId);
  return releaseData.streaming;
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
  getReleaseData,
  getStreamingReleaseDate,
  getMovieDetails,
  searchMovies,
  getUpcomingMovies,
  discoverMovies,
  getGenres,
  tmdbAxios // Export for any custom needs
};
