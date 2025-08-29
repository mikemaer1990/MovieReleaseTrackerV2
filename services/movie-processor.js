const { getStreamingReleaseDate } = require("./tmdb");
const { toUtcMidnight } = require("../utils/date-helpers");

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
  
  // Fetch streaming date
  const streamingDateRaw = await getStreamingReleaseDate(movie.id);
  const streamingDate = streamingDateRaw ? new Date(streamingDateRaw) : null;
  const theatricalDate = movie.release_date ? new Date(movie.release_date) : null;

  // Convert to midnight for consistent comparisons
  const streamingDateMidnight = streamingDate ? toUtcMidnight(streamingDate) : null;
  const theatricalDateMidnight = theatricalDate ? toUtcMidnight(theatricalDate) : null;

  // Base processed movie object
  const processedMovie = {
    ...movie,
    streamingDateRaw,
    streamingDate: streamingDateMidnight,
    theatricalDate: theatricalDateMidnight,
    rating: movie.vote_average || 0,
    popularity: movie.popularity || 0,
  };

  // Add context-specific properties based on options
  if (options.type === 'releases') {
    processedMovie.hasRecentStreaming = streamingDateMidnight || theatricalDateMidnight;
    processedMovie.displayDate = streamingDateMidnight 
      ? `Released ${streamingDateMidnight.toISOString().split("T")[0]}`
      : "Available Now";
  }

  if (options.type === 'search') {
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const theatricalInPast60Days = theatricalDateMidnight &&
      theatricalDateMidnight <= now &&
      now - theatricalDateMidnight <= SIXTY_DAYS_MS;

    const theatricalInFuture = theatricalDateMidnight && theatricalDateMidnight > now;
    const streamingInFuture = streamingDateMidnight && streamingDateMidnight > now;

    processedMovie.canFollow = 
      (theatricalInPast60Days && (!streamingDateMidnight || streamingDateMidnight > now)) ||
      theatricalInFuture ||
      (!theatricalDateMidnight && streamingInFuture);

    processedMovie.displayDate = streamingDateMidnight
      ? streamingDateMidnight.toISOString().split("T")[0]
      : theatricalDateMidnight
        ? theatricalDateMidnight.toISOString().split("T")[0] + " (Theatrical)"
        : "Coming Soon";
  }

  if (options.type === 'upcoming') {
    processedMovie.canFollow = 
      (streamingDateMidnight && streamingDateMidnight > now) ||
      (theatricalDateMidnight && theatricalDateMidnight > now);

    processedMovie.displayDate = streamingDateMidnight
      ? streamingDateMidnight.toISOString().split("T")[0]
      : theatricalDateMidnight
        ? theatricalDateMidnight.toISOString().split("T")[0] + " (Theatrical)"
        : "Coming Soon";
  }

  return processedMovie;
}

/**
 * Process an array of movies with dates and metadata
 * @param {Array} movies - Array of raw movie objects from TMDB
 * @param {Object} options - Processing options
 * @returns {Array} Array of processed movies
 */
async function processMoviesWithDates(movies, options = {}) {
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
  const { type, genre } = filterOptions;

  let filtered = movies;

  // Apply type-specific filtering
  if (type === 'releases') {
    filtered = filtered.filter(movie => movie.hasRecentStreaming);
  } else if (type === 'search' || type === 'upcoming') {
    filtered = filtered.filter(movie => movie.canFollow);
  }

  // Apply genre filtering if specified
  if (genre) {
    filtered = filtered.filter(movie => 
      movie.genre_ids && movie.genre_ids.includes(parseInt(genre))
    );
  }

  return filtered;
}

/**
 * Apply sorting to processed movies
 * @param {Array} movies - Array of processed movies
 * @param {string} sortBy - Sort criteria ('popularity', 'rating', 'newest', 'oldest')
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

    case "oldest":
      return moviesCopy.sort((a, b) => {
        if (!a.streamingDate && !b.streamingDate) return a.id - b.id;
        if (!a.streamingDate) return 1;
        if (!b.streamingDate) return -1;
        const dateCompare = a.streamingDate - b.streamingDate;
        return dateCompare !== 0 ? dateCompare : a.id - b.id;
      });

    case "rating":
      return moviesCopy.sort((a, b) => {
        const ratingCompare = b.rating - a.rating;
        return ratingCompare !== 0 ? ratingCompare : a.id - b.id;
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