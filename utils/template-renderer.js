/**
 * Template Rendering Utilities
 * Handles EJS partial rendering for API responses
 * Eliminates code duplication across load-more endpoints
 */

/**
 * Render movie cards using EJS partials
 * @param {Object} req - Express request object (needed for app.render)
 * @param {Array} movies - Array of movie objects to render
 * @param {Object} options - Rendering options
 * @returns {Promise<string>} Rendered HTML string
 */
async function renderMovieCards(req, movies, options = {}) {
  const {
    showFollowButton = false,
    user = null,
    followedMovieIds = [],
    query = '',
    loginRedirect = '/',
    templatePath = 'partials/_results-movie-card'
  } = options;

  const promises = movies.map(movie => {
    return new Promise((resolve, reject) => {
      req.app.render(templatePath, { 
        movie, 
        showFollowButton,
        user,
        followedMovieIds,
        query,
        loginRedirect
      }, (err, html) => {
        if (err) {
          reject(err);
        } else {
          resolve(html);
        }
      });
    });
  });
  
  try {
    const htmlParts = await Promise.all(promises);
    return htmlParts.join('');
  } catch (error) {
    console.error('Failed to render movie cards:', error);
    throw new Error('Template rendering failed');
  }
}

/**
 * Create a standard API response for load-more endpoints
 * @param {Array} movies - Array of movie objects
 * @param {string} html - Rendered HTML string
 * @param {Object} paginationInfo - Pagination information
 * @returns {Object} Standardized API response
 */
function createLoadMoreResponse(movies, html, paginationInfo = {}) {
  const {
    hasMore = false,
    currentPage = 1,
    moviesPerPage = 20
  } = paginationInfo;

  return {
    movies,
    html,
    hasMore,
    currentPage,
    totalLoaded: (currentPage - 1) * moviesPerPage + movies.length
  };
}

/**
 * Create a standard error response for load-more endpoints
 * @param {string} message - Error message
 * @param {Error} error - Original error object (optional)
 * @returns {Object} Standardized error response
 */
function createErrorResponse(message, error = null) {
  if (error) {
    console.error(`Load more error: ${message}`, error);
  }
  
  return {
    error: message,
    movies: [],
    hasMore: false
  };
}

module.exports = {
  renderMovieCards,
  createLoadMoreResponse,
  createErrorResponse
};