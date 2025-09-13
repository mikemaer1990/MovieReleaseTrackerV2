const { getReleaseData, getMovieDetails } = require("./tmdb");
const { toUtcMidnight, getMovieDisplayDate, canFollowMovie } = require("../utils/date-helpers");
const bulkMovieProcessor = require("./bulk-movie-processor");

/**
 * Movie Processing Service
 * Handles common movie data processing, date calculations, and filtering logic
 * Used across different endpoints to eliminate code duplication
 */

/**
 * Process a single movie with streaming dates and metadata
 * @param {Object} movie - Raw movie object from TMDB
 * @param {Object} options - Processing options
 * @returns {Object} Processed movie with additional properties
 */
async function processMovieWithDates(movie, options = {}) {
  const now = toUtcMidnight(new Date());
  
  // Fetch all release data with single API call
  const releaseData = await getReleaseData(movie.id);
  
  // Prioritize US theatrical date over primary release date
  const theatricalDateString = releaseData.usTheatrical || releaseData.primary || movie.release_date;
  const streamingDateRaw = releaseData.streaming;
  
  const theatricalDate = theatricalDateString ? new Date(theatricalDateString + 'T00:00:00') : null;
  const streamingDate = streamingDateRaw ? new Date(streamingDateRaw + 'T00:00:00') : null;

  // Convert to midnight for consistent comparisons
  const streamingDateMidnight = streamingDate ? toUtcMidnight(streamingDate) : null;
  const theatricalDateMidnight = theatricalDate ? toUtcMidnight(theatricalDate) : null;

  // Base processed movie object
  const processedMovie = {
    ...movie,
    release_date: theatricalDateString || movie.release_date, // Use proper theatrical date string directly
    streamingDateRaw,
    streamingDate: streamingDateMidnight,
    theatricalDate: theatricalDateMidnight,
    rating: movie.vote_average || 0,
    popularity: movie.popularity || 0,
    vote_count: movie.vote_count || 0,
  };

  // Calculate quality score: rating weighted by popularity (logarithmic to prevent popularity dominance)
  processedMovie.qualityScore = processedMovie.rating * Math.log(processedMovie.popularity + 1);

  // Use unified date handling for all contexts
  const dateInfo = getMovieDisplayDate(processedMovie, { context: options.type || 'general' });
  
  // Add unified date display properties
  processedMovie.displayDate = dateInfo.displayText;
  processedMovie.dateType = dateInfo.dateType;
  processedMovie.dateStatusClass = dateInfo.statusClass;
  processedMovie.theatricalFormatted = dateInfo.theatricalFormatted;
  processedMovie.streamingFormatted = dateInfo.streamingFormatted;
  
  // Add unified follow logic
  processedMovie.canFollow = canFollowMovie(processedMovie, { context: options.type || 'general' });

  // Add context-specific properties for backward compatibility
  if (options.type === 'releases') {
    processedMovie.hasRecentStreaming = streamingDateMidnight !== null;
  }

  return processedMovie;
}

/**
 * Process an array of movies with dates and metadata
 * Uses bulk processing for better performance when available
 * @param {Array} movies - Array of raw movie objects from TMDB
 * @param {Object} options - Processing options
 * @returns {Array} Array of processed movies
 */
async function processMoviesWithDates(movies, options = {}) {
  // Use bulk processor for better performance when processing multiple movies
  if (Array.isArray(movies) && movies.length > 3) {
    try {
      return await bulkMovieProcessor.processMoviesBulk(movies, options);
    } catch (error) {
      console.warn('Bulk processing failed, falling back to individual processing:', error);
      // Fall back to individual processing
    }
  }

  // Original individual processing for small arrays or as fallback
  return Promise.all(
    movies.map(movie => processMovieWithDates(movie, options))
  );
}

/**
 * Filter movies based on specific criteria
 * @param {Array} movies - Array of processed movies
 * @param {Object} filterOptions - Filtering criteria
 * @returns {Array} Filtered movies
 */
function filterMovies(movies, filterOptions = {}) {
  const { type, genre, minVoteCount, maxRating } = filterOptions;

  let filtered = movies;

  // Apply type-specific filtering
  if (type === 'releases') {
    filtered = filtered.filter(movie => movie.hasRecentStreaming);
  } else if (type === 'upcoming') {
    filtered = filtered.filter(movie => movie.canFollow);
  }
  // For search results, don't filter by canFollow - show all results
  // The canFollow property is still set correctly for the follow buttons

  // Apply genre filtering if specified
  if (genre) {
    filtered = filtered.filter(movie => 
      movie.genre_ids && movie.genre_ids.includes(parseInt(genre))
    );
  }

  // Apply minimum vote count filtering if specified (for rating-based sorting)
  if (minVoteCount && typeof minVoteCount === 'number') {
    filtered = filtered.filter(movie => movie.vote_count >= minVoteCount);
  }

  // Apply maximum rating filtering if specified (eliminates suspicious perfect ratings)
  if (maxRating && typeof maxRating === 'number') {
    filtered = filtered.filter(movie => movie.rating <= maxRating);
  }

  return filtered;
}

/**
 * Apply sorting to processed movies
 * @param {Array} movies - Array of processed movies
 * @param {string} sortBy - Sort criteria ('popularity', 'rating', 'newest')
 * @returns {Array} Sorted movies
 */
function sortMovies(movies, sortBy = 'popularity') {
  const moviesCopy = [...movies];

  switch (sortBy) {
    case "newest":
      return moviesCopy.sort((a, b) => {
        if (!a.streamingDate && !b.streamingDate) return a.id - b.id;
        if (!a.streamingDate) return 1;
        if (!b.streamingDate) return -1;
        const dateCompare = b.streamingDate - a.streamingDate;
        return dateCompare !== 0 ? dateCompare : a.id - b.id;
      });

    case "release_date_asc":
      return moviesCopy.sort((a, b) => {
        const dateA = new Date(a.release_date || '9999-12-31');
        const dateB = new Date(b.release_date || '9999-12-31');
        const dateCompare = dateA - dateB;
        return dateCompare !== 0 ? dateCompare : a.id - b.id;
      });

    case "release_date_desc":
      return moviesCopy.sort((a, b) => {
        const dateA = new Date(a.release_date || '1900-01-01');
        const dateB = new Date(b.release_date || '1900-01-01');
        const dateCompare = dateB - dateA;
        return dateCompare !== 0 ? dateCompare : a.id - b.id;
      });

    case "vote_average":
      return moviesCopy.sort((a, b) => {
        // Pure TMDB rating sort (requires minimum vote count for reliability)
        if (a.vote_count < 10 && b.vote_count >= 10) return 1;
        if (b.vote_count < 10 && a.vote_count >= 10) return -1;
        const ratingCompare = b.rating - a.rating;
        return ratingCompare !== 0 ? ratingCompare : a.id - b.id;
      });

    case "rating":
      return moviesCopy.sort((a, b) => {
        // Use quality score (rating weighted by popularity) instead of raw rating
        const qualityCompare = b.qualityScore - a.qualityScore;
        return qualityCompare !== 0 ? qualityCompare : a.id - b.id;
      });

    case "popularity":
    default:
      return moviesCopy.sort((a, b) => {
        const popularityCompare = b.popularity - a.popularity;
        return popularityCompare !== 0 ? popularityCompare : a.id - b.id;
      });
  }
}

/**
 * Remove duplicate movies from an array (useful for collection-based pagination)
 * @param {Array} movies - Array of movies
 * @param {Array} existingMovies - Array of movies to check against
 * @returns {Array} Deduplicated movies
 */
function deduplicateMovies(movies, existingMovies = []) {
  return movies.filter(movie => 
    !existingMovies.some(existing => existing.id === movie.id)
  );
}

module.exports = {
  processMovieWithDates,
  processMoviesWithDates,
  filterMovies,
  sortMovies,
  deduplicateMovies
};