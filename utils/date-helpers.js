// utils/date-helpers.js

/**
 * Convert date to UTC midnight for consistent comparisons
 */
function toUtcMidnight(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/**
 * Format date for display in a consistent, user-friendly format
 * @param {Date|string} date - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
function formatDisplayDate(date, options = {}) {
  if (!date) return '';
  
  try {
    // Handle date strings to avoid timezone issues
    const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    if (isNaN(dateObj.getTime())) return '';
    
    const { includeYear = true, short = false } = options;
    
    if (short) {
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(includeYear && { year: 'numeric' })
      });
    }
    
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.warn('Invalid date format:', date, error);
    return '';
  }
}

/**
 * Get the primary display date for a movie with proper fallback logic
 * @param {Object} movie - Movie object with date properties
 * @param {Object} options - Display options
 * @returns {Object} Display date information
 */
function getMovieDisplayDate(movie, options = {}) {
  const { context = 'general' } = options;
  const now = toUtcMidnight(new Date());
  
  // Parse dates consistently, avoiding timezone issues
  const theatricalDate = movie.release_date ? toUtcMidnight(new Date(movie.release_date + 'T00:00:00')) : null;
  const streamingDate = movie.streamingDateRaw ? toUtcMidnight(new Date(movie.streamingDateRaw + 'T00:00:00')) : null;
  
  // Determine primary date and type based on context and availability
  let primaryDate = null;
  let dateType = '';
  let displayText = '';
  let statusClass = '';
  
  if (context === 'releases') {
    // For releases page, prioritize streaming dates (recent releases)
    if (streamingDate) {
      primaryDate = streamingDate;
      dateType = 'streaming';
      displayText = `Available ${formatDisplayDate(streamingDate)}`;
      statusClass = 'available';
    } else if (theatricalDate) {
      primaryDate = theatricalDate;
      dateType = 'theatrical';
      displayText = `Released ${formatDisplayDate(theatricalDate)}`;
      statusClass = 'released';
    } else {
      displayText = 'Available Now';
      statusClass = 'available';
    }
  } else if (context === 'upcoming') {
    // For upcoming, show future dates with preference for streaming
    if (streamingDate && streamingDate > now) {
      primaryDate = streamingDate;
      dateType = 'streaming';
      displayText = formatDisplayDate(streamingDate);
      statusClass = 'streaming-upcoming';
    } else if (theatricalDate && theatricalDate > now) {
      primaryDate = theatricalDate;
      dateType = 'theatrical';
      displayText = `${formatDisplayDate(theatricalDate)} (Theatrical)`;
      statusClass = 'theatrical-upcoming';
    } else if (streamingDate) {
      primaryDate = streamingDate;
      dateType = 'streaming';
      displayText = formatDisplayDate(streamingDate);
      statusClass = 'streaming-past';
    } else if (theatricalDate) {
      primaryDate = theatricalDate;
      dateType = 'theatrical';
      displayText = `${formatDisplayDate(theatricalDate)} (Theatrical)`;
      statusClass = 'theatrical-past';
    } else {
      displayText = 'Coming Soon';
      statusClass = 'tba';
    }
  } else if (context === 'my-movies') {
    // For my movies, show the most relevant date
    if (streamingDate) {
      primaryDate = streamingDate;
      dateType = 'streaming';
      displayText = formatDisplayDate(streamingDate);
      statusClass = streamingDate > now ? 'streaming-upcoming' : 'streaming-available';
    } else if (theatricalDate) {
      primaryDate = theatricalDate;
      dateType = 'theatrical';
      displayText = formatDisplayDate(theatricalDate);
      statusClass = theatricalDate > now ? 'theatrical-upcoming' : 'theatrical-past';
    } else {
      displayText = 'TBA';
      statusClass = 'tba';
    }
  } else {
    // Default/search context - show most relevant date
    if (streamingDate) {
      primaryDate = streamingDate;
      dateType = 'streaming';
      displayText = formatDisplayDate(streamingDate);
      statusClass = 'streaming';
    } else if (theatricalDate) {
      primaryDate = theatricalDate;
      dateType = 'theatrical';  
      displayText = `${formatDisplayDate(movie.release_date)} (Theatrical)`;
      statusClass = 'theatrical';
    } else {
      displayText = 'TBA';
      statusClass = 'tba';
    }
  }
  
  return {
    primaryDate,
    dateType,
    displayText,
    statusClass,
    theatricalDate,
    streamingDate,
    theatricalFormatted: theatricalDate ? formatDisplayDate(movie.release_date) : null,
    streamingFormatted: streamingDate ? formatDisplayDate(movie.streamingDateRaw) : null
  };
}

/**
 * Check if a movie can be followed based on its dates
 * @param {Object} movie - Movie object with date properties
 * @param {Object} options - Context options
 * @returns {boolean} Whether movie can be followed
 */
function canFollowMovie(movie, options = {}) {
  const { context = 'general' } = options;
  const now = toUtcMidnight(new Date());
  
  const theatricalDate = movie.release_date ? toUtcMidnight(new Date(movie.release_date + 'T00:00:00')) : null;
  const streamingDate = movie.streamingDateRaw ? toUtcMidnight(new Date(movie.streamingDateRaw + 'T00:00:00')) : null;
  
  if (context === 'upcoming') {
    // For upcoming page, allow following if any future date OR no dates (trust TMDB)
    return (streamingDate && streamingDate > now) ||
           (theatricalDate && theatricalDate > now) ||
           (!streamingDate && !theatricalDate);
  } else if (context === 'search') {
    // For search, allow following for recent theatricals without streaming or future releases
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
    const theatricalInPast60Days = theatricalDate &&
      theatricalDate <= now &&
      now - theatricalDate <= SIXTY_DAYS_MS;
    
    const theatricalInFuture = theatricalDate && theatricalDate > now;
    const streamingInFuture = streamingDate && streamingDate > now;
    
    return (theatricalInPast60Days && (!streamingDate || streamingDate > now)) ||
           theatricalInFuture ||
           (!theatricalDate && streamingInFuture);
  } else if (context === 'releases') {
    // For releases page, check for recent streaming/theatrical releases
    return streamingDate || theatricalDate;
  }
  
  return true; // Default to allowing follows
}

/**
 * Get date 6 months from now
 * @param {Date} fromDate - Starting date (defaults to now)
 * @returns {Date} Date 6 months in the future
 */
function getSixMonthsFromNow(fromDate = new Date()) {
  const date = new Date(fromDate);
  date.setMonth(date.getMonth() + 6);
  return date;
}

/**
 * Get date 4 weeks from now
 * @param {Date} fromDate - Starting date (defaults to now)
 * @returns {Date} Date 4 weeks in the future
 */
function getFourWeeksFromNow(fromDate = new Date()) {
  const date = new Date(fromDate);
  date.setDate(date.getDate() + 28);
  return date;
}

module.exports = {
  toUtcMidnight,
  formatDisplayDate,
  getMovieDisplayDate,
  canFollowMovie,
  getSixMonthsFromNow,
  getFourWeeksFromNow
};
