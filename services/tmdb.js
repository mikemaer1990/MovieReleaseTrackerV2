// services/tmdb.js
const axios = require("axios");
const { getCachedData, setCachedData } = require("./cache");
const { toUtcMidnight, getSixMonthsFromNow } = require("../utils/date-helpers");

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
 * Retry wrapper with exponential backoff for 429 rate limiting
 * @param {Function} apiCall - The API call function to retry
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000)
 */
async function withRetry(apiCall, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      // Check if it's a 429 rate limit error
      if (error.response?.status === 429 && attempt < maxRetries) {
        // Extract retry-after header if available, otherwise use exponential backoff
        const retryAfter = error.response.headers['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter) * 1000 // Convert seconds to milliseconds
          : baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s

        console.warn(`[TMDB RETRY] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // For non-429 errors or max retries reached, throw immediately
      throw error;
    }
  }

  // This should never be reached, but just in case
  throw lastError;
}

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
    const result = await withRetry(async () => {
      const params = {};
      if (appendToResponse) params.append_to_response = appendToResponse;

      const response = await tmdbAxios.get(`/movie/${movieId}`, { params });
      return response.data;
    });

    setCachedData(cacheKey, result, 3600); // Cache for 1 hour
    return result;
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
 * Get extended upcoming movies (0-6 months ahead) using discover endpoint
 * Uses TMDB server-side sorting for accurate results
 */
async function getExtendedUpcomingMovies(page = 1, region = "US", sortBy = "popularity") {
  try {
    const now = toUtcMidnight(new Date());
    const sixMonthsFromNow = getSixMonthsFromNow(now);
    
    // Map our sort options to TMDB's sort_by parameter
    let tmdbSortBy = "popularity.desc";
    switch (sortBy) {
      case "release_date_asc":
        tmdbSortBy = "primary_release_date.asc";
        break;
      case "release_date_desc":
        tmdbSortBy = "primary_release_date.desc";
        break;
      case "popularity":
        tmdbSortBy = "popularity.desc";
        break;
      default:
        tmdbSortBy = "popularity.desc";
        break;
    }
    
    let allMovies = [];
    let totalPages = 1;
    
    // Use discover endpoint with proper TMDB server-side sorting
    const response = await tmdbAxios.get(`/discover/movie`, {
      params: {
        page,
        region,
        'primary_release_date.gte': now.toISOString().split('T')[0],
        'primary_release_date.lte': sixMonthsFromNow.toISOString().split('T')[0],
        sort_by: tmdbSortBy,
        'with_runtime.gte': 60, // Filter out movies shorter than 60 minutes
        without_companies: '2|7|527|1771|33400', // Filter out major Russian/Indian production companies
        'with_original_language': 'en|es|fr|de|it|ja|ko|pt|zh', // Include major international languages, exclude Russian (ru) and Hindi (hi)
        'vote_count.gte': 0 // No minimum vote requirement
      }
    });
    
    // Filter out movies without poster images and unwanted languages/origins
    allMovies = (response.data.results || []).filter(movie => {
      // Must have poster
      if (!movie.poster_path || movie.poster_path.trim() === '') return false;
      
      // Filter out Russian and Indian content
      const originalLanguage = movie.original_language;
      const excludedLanguages = ['ru', 'hi', 'te', 'ta', 'ml', 'kn', 'bn', 'ur', 'pa'];
      
      return !excludedLanguages.includes(originalLanguage);
    });
    totalPages = response.data.total_pages || 1;
    
    return {
      page,
      results: allMovies,
      total_pages: totalPages,
      total_results: allMovies.length * totalPages // Approximate
    };
    
  } catch (error) {
    console.error("Error fetching extended upcoming movies:", error);
    throw error;
  }
}

/**
 * Discover movies with filters
 * Now includes automatic retry logic for rate limiting (429)
 */
async function discoverMovies(options = {}) {
  try {
    return await withRetry(async () => {
      const response = await tmdbAxios.get(`/discover/movie`, { params: options });
      return response.data;
    });
  } catch (error) {
    console.error("Error discovering movies:", error);
    throw error;
  }
}


module.exports = {
  getReleaseData,
  getStreamingReleaseDate,
  getMovieDetails,
  searchMovies,
  getUpcomingMovies,
  getExtendedUpcomingMovies,
  discoverMovies,
  tmdbAxios // Export for any custom needs
};
