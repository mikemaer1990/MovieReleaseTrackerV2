/**
 * Bulk Movie Processing Service
 * Optimizes API calls by processing movies in batches and eliminating redundant requests
 */

const { tmdbAxios } = require('./tmdb');
const { getCachedData, setCachedData } = require('./cache');
const { toUtcMidnight, getMovieDisplayDate, canFollowMovie } = require('../utils/date-helpers');
const movieMetadataCache = require('./movie-metadata-cache');

class BulkMovieProcessor {
  constructor() {
    this.releaseDataCache = new Map();
    this.batchSize = 20;
    this.maxConcurrentRequests = 5;
  }

  /**
   * Process multiple movies efficiently with bulk API calls
   * @param {Array} movies - Array of raw movie objects from TMDB
   * @param {Object} options - Processing options
   * @returns {Array} Array of processed movies
   */
  async processMoviesBulk(movies, options = {}) {
    if (!Array.isArray(movies) || movies.length === 0) {
      return [];
    }

    // Step 1: Check metadata cache first
    const processedFromCache = [];
    const needsFreshData = [];

    for (const movie of movies) {
      const cachedMetadata = movieMetadataCache.getMovieMetadata(movie.id);

      if (cachedMetadata && movieMetadataCache.isMetadataFresh(movie.id)) {
        // Use cached data to create processed movie
        processedFromCache.push(this.createMovieFromMetadata(cachedMetadata, options));
      } else {
        needsFreshData.push(movie);
      }
    }

    // Step 2: Process movies that need fresh data
    let freshlyProcessed = [];
    if (needsFreshData.length > 0) {
      const movieIds = needsFreshData.map(movie => movie.id);
      const uncachedIds = movieIds.filter(id => !this.releaseDataCache.has(id));

      // Fetch release data in batches for uncached movies
      if (uncachedIds.length > 0) {
        await this.fetchReleaseDataBatch(uncachedIds);
      }

      // Process movies with cached release data
      freshlyProcessed = needsFreshData.map(movie => {
        const processed = this.processMovieWithCachedData(movie, options);

        // Store in metadata cache for future use
        const releaseData = this.releaseDataCache.get(movie.id) || {};
        movieMetadataCache.setMovieMetadata(movie.id, movie, releaseData);

        return processed;
      });
    }

    // Step 3: Combine cached and freshly processed movies, maintaining original order
    const allProcessed = [...processedFromCache, ...freshlyProcessed];

    // Sort to maintain original movie order
    const originalOrder = movies.map(movie => movie.id);
    allProcessed.sort((a, b) => {
      const indexA = originalOrder.indexOf(a.id);
      const indexB = originalOrder.indexOf(b.id);
      return indexA - indexB;
    });

    return allProcessed;
  }

  /**
   * Fetch release data for multiple movies in parallel batches
   * @param {Array} movieIds - Array of movie IDs
   */
  async fetchReleaseDataBatch(movieIds) {
    const batches = this.createBatches(movieIds, this.maxConcurrentRequests);

    for (const batch of batches) {
      const promises = batch.map(movieId => this.fetchSingleReleaseData(movieId));
      await Promise.all(promises);

      // Small delay to respect TMDB rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Fetch release data for a single movie and cache it
   * @param {number} movieId - Movie ID
   */
  async fetchSingleReleaseData(movieId) {
    try {
      // Use append_to_response to get both basic details and release dates in one call
      const response = await tmdbAxios.get(`/movie/${movieId}`, {
        params: {
          append_to_response: 'release_dates'
        }
      });

      const movieData = response.data;
      const releaseResults = movieData.release_dates?.results || [];

      // Process release data
      const releaseData = this.processReleaseData(releaseResults, movieData.release_date);

      // Cache the result with 30-minute TTL
      this.releaseDataCache.set(movieId, releaseData);

      // Also cache in the main cache system
      setCachedData(`release_data_${movieId}`, releaseData, 1800);

    } catch (error) {
      console.error(`Error fetching release data for movie ${movieId}:`, error);
      // Cache empty result to prevent repeated failed requests
      const emptyReleaseData = {
        usTheatrical: null,
        streaming: null,
        primary: null
      };
      this.releaseDataCache.set(movieId, emptyReleaseData);
    }
  }

  /**
   * Process release dates from TMDB release_dates response
   * @param {Array} releaseResults - Release dates results from TMDB
   * @param {string} primaryDate - Primary release date
   * @returns {Object} Processed release data
   */
  processReleaseData(releaseResults, primaryDate) {
    if (!Array.isArray(releaseResults) || releaseResults.length === 0) {
      return {
        usTheatrical: null,
        streaming: null,
        primary: primaryDate
      };
    }

    // Look specifically for US releases
    const usReleases = releaseResults.find(r => r.iso_3166_1 === "US");

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
  }

  /**
   * Create processed movie from cached metadata
   * @param {Object} metadata - Cached metadata from movieMetadataCache
   * @param {Object} options - Processing options
   * @returns {Object} Processed movie
   */
  createMovieFromMetadata(metadata, options = {}) {
    const now = toUtcMidnight(new Date());

    const theatricalDateString = metadata.usTheatrical || metadata.primary || metadata.release_date;
    const streamingDateRaw = metadata.streaming;

    const theatricalDate = theatricalDateString ? new Date(theatricalDateString + 'T00:00:00') : null;
    const streamingDate = streamingDateRaw ? new Date(streamingDateRaw + 'T00:00:00') : null;

    const streamingDateMidnight = streamingDate ? toUtcMidnight(streamingDate) : null;
    const theatricalDateMidnight = theatricalDate ? toUtcMidnight(theatricalDate) : null;

    // Create movie object from cached metadata
    const processedMovie = {
      id: metadata.id,
      title: metadata.title,
      poster_path: metadata.poster_path,
      release_date: theatricalDateString || metadata.release_date,
      genre_ids: metadata.genre_ids,
      overview: metadata.overview,
      streamingDateRaw,
      streamingDate: streamingDateMidnight,
      theatricalDate: theatricalDateMidnight,
      rating: metadata.vote_average,
      popularity: metadata.popularity,
      vote_count: metadata.vote_count,
      vote_average: metadata.vote_average,
      qualityScore: metadata.qualityScore,
    };

    // Use unified date handling
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
      // Only include movies that have streaming dates AND have already been released for streaming
      processedMovie.hasRecentStreaming = streamingDateMidnight !== null && streamingDateMidnight <= now;
    }

    return processedMovie;
  }

  /**
   * Process a single movie with cached release data
   * @param {Object} movie - Raw movie object from TMDB
   * @param {Object} options - Processing options
   * @returns {Object} Processed movie
   */
  processMovieWithCachedData(movie, options = {}) {
    const now = toUtcMidnight(new Date());

    // Get cached release data
    let releaseData = this.releaseDataCache.get(movie.id);
    if (!releaseData) {
      // Fallback to main cache
      releaseData = getCachedData(`release_data_${movie.id}`);
      if (releaseData) {
        this.releaseDataCache.set(movie.id, releaseData);
      }
    }

    // If no cached data, use basic movie data
    if (!releaseData) {
      releaseData = {
        usTheatrical: null,
        streaming: null,
        primary: movie.release_date
      };
    }

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
      release_date: theatricalDateString || movie.release_date,
      streamingDateRaw,
      streamingDate: streamingDateMidnight,
      theatricalDate: theatricalDateMidnight,
      rating: movie.vote_average || 0,
      popularity: movie.popularity || 0,
      vote_count: movie.vote_count || 0,
    };

    // Calculate quality score
    processedMovie.qualityScore = processedMovie.rating * Math.log(processedMovie.popularity + 1);

    // Use unified date handling
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
      // Only include movies that have streaming dates AND have already been released for streaming
      processedMovie.hasRecentStreaming = streamingDateMidnight !== null && streamingDateMidnight <= now;
    }

    return processedMovie;
  }

  /**
   * Create batches from an array
   * @param {Array} array - Array to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array} Array of batches
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Clear the in-memory cache (useful for testing or memory management)
   */
  clearCache() {
    this.releaseDataCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.releaseDataCache.size,
      memoryUsage: this.releaseDataCache.size * 0.5, // Rough estimate in KB
    };
  }
}

// Create singleton instance
const bulkMovieProcessor = new BulkMovieProcessor();

module.exports = bulkMovieProcessor;