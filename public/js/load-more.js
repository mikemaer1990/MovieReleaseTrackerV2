/**
 * Generic Load More Manager
 * Handles AJAX loading for any page with movie cards
 */
class LoadMoreManager {
  constructor(config) {
    this.config = {
      endpoint: config.endpoint,
      initialPage: config.initialPage || 2, // Start from page 2 since page 1 is loaded initially
      params: config.params || {},
      buttonId: config.buttonId || 'loadMoreBtn',
      gridSelector: config.gridSelector || '.results-grid',
      countSelector: config.countSelector || '#moviesCount'
    };

    this.currentPage = this.config.initialPage;
    this.isLoading = false;
    this.hasMore = true;
    this.displayedMovieIds = new Set(); // Track displayed movie IDs to prevent duplicates
    
    this.init();
  }

  init() {
    this.loadMoreBtn = document.getElementById(this.config.buttonId);
    this.moviesGrid = document.querySelector(this.config.gridSelector);
    
    if (!this.loadMoreBtn || !this.moviesGrid) {
      console.warn('Load more elements not found');
      return;
    }

    // Track initially displayed movie IDs
    this.collectDisplayedMovieIds();

    this.loadMoreBtn.addEventListener('click', () => this.loadMore());
  }

  async loadMore() {
    if (this.isLoading || !this.hasMore) return;

    this.setLoadingState(true);

    try {
      const params = new URLSearchParams({
        page: this.currentPage,
        displayedMovieIds: Array.from(this.displayedMovieIds).join(','),
        ...this.config.params
      });

      const response = await fetch(`${this.config.endpoint}?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load more movies');
      }

      // Update loading state based on expansion type
      if (data.expansionType) {
        this.setLoadingStateWithMessage(data.expansionType);
      }

      if (data.html && data.movies && data.movies.length > 0) {
        this.appendMoviesHTML(data.html);
        // Track newly displayed movie IDs
        data.movies.forEach(movie => this.displayedMovieIds.add(movie.id));
        this.currentPage += 1;
        this.updateMovieCount(data.totalLoaded);
      }

      this.hasMore = data.hasMore;

      if (!this.hasMore) {
        this.showNoMoreMovies();
      }

      // Log expansion debug info if available
      if (data.synchronousExpansion || data.expansionType) {
        console.log('Cache expansion info:', {
          synchronousExpansion: data.synchronousExpansion,
          expansionType: data.expansionType,
          moviesReturned: data.movies?.length || 0,
          totalCount: data.totalCount,
          source: data.source
        });
      }

    } catch (error) {
      console.error('Load more error:', error);
      this.showError(error.message);
    } finally {
      this.setLoadingState(false);
    }
  }

  setLoadingState(loading) {
    this.isLoading = loading;
    const loadText = this.loadMoreBtn.querySelector('.load-text');
    const loadSpinner = this.loadMoreBtn.querySelector('.load-spinner');

    if (loading) {
      this.loadMoreBtn.disabled = true;
      loadText.style.display = 'none';
      loadSpinner.style.display = 'flex';
    } else {
      this.loadMoreBtn.disabled = false;
      loadText.style.display = 'block';
      loadSpinner.style.display = 'none';
      // Reset to default text when done loading
      loadText.textContent = 'Load More Movies';
    }
  }

  setLoadingStateWithMessage(expansionType) {
    const loadText = this.loadMoreBtn.querySelector('.load-text');

    // Set different loading messages based on expansion type
    switch (expansionType) {
      case 'synchronous':
        loadText.textContent = 'Finding more movies...';
        break;
      case 'background':
        loadText.textContent = 'Expanding collection...';
        break;
      case 'cache_insufficient':
        loadText.textContent = 'Building fresh results...';
        break;
      default:
        loadText.textContent = 'Loading more movies...';
    }
  }

  appendMoviesHTML(html) {
    // Create a temporary container to parse the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Get all movie cards from the new HTML
    const newCards = tempDiv.querySelectorAll('.movie-card');
    
    // Find the load more button to insert before it
    const loadMoreContainer = this.moviesGrid.querySelector('.load-more-grid-item');
    
    // Add each card with animation class
    newCards.forEach((card, index) => {
      // Add animation class for staggered fade-in
      card.classList.add('loading-animation');
      
      // Insert before the load more button instead of appending at end
      if (loadMoreContainer) {
        this.moviesGrid.insertBefore(card, loadMoreContainer);
      } else {
        this.moviesGrid.appendChild(card);
      }
      
      // Remove animation class after animation completes to clean up DOM
      setTimeout(() => {
        card.classList.remove('loading-animation');
      }, 1500); // Wait for all animations to complete (max delay + animation duration)
    });
  }

  updateMovieCount(count) {
    const moviesCount = document.querySelector(this.config.countSelector);
    if (moviesCount) {
      moviesCount.textContent = count;
    }
  }

  showNoMoreMovies() {
    const loadText = this.loadMoreBtn.querySelector('.load-text');
    
    this.loadMoreBtn.classList.add('no-more');
    this.loadMoreBtn.disabled = true;
    loadText.textContent = 'No More Movies';
  }

  showError(message) {
    const loadText = this.loadMoreBtn.querySelector('.load-text');
    
    loadText.textContent = 'Error Loading Movies';
    
    setTimeout(() => {
      loadText.textContent = 'Load More Movies';
    }, 3000);
  }

  /**
   * Collects movie IDs from currently displayed movie cards
   */
  collectDisplayedMovieIds() {
    const movieLinks = this.moviesGrid.querySelectorAll('.movie-card a[href^="/movie/"]');
    movieLinks.forEach(link => {
      const movieId = link.href.match(/\/movie\/(\d+)/)?.[1];
      if (movieId) {
        this.displayedMovieIds.add(parseInt(movieId));
      }
    });
  }
}

// Auto-initialize based on page context
document.addEventListener('DOMContentLoaded', () => {
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  if (!loadMoreBtn) return; // No load more button on this page

  // Detect page context and configure accordingly
  const pageConfig = getPageConfig();
  if (pageConfig) {
    new LoadMoreManager(pageConfig);
  }
});

/**
 * Determines the page configuration based on current page context
 */
function getPageConfig() {
  const path = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);

  // Top releases page
  if (path === '/top-releases') {
    return {
      endpoint: '/load-more-releases',
      params: {
        sort: urlParams.get('sort') || 'popularity',
        genre: urlParams.get('genre') || '',
        initialPagesUsed: window.initialPagesUsed || 3
      }
    };
  }

  // Search results page
  if (path === '/search') {
    const query = urlParams.get('query');
    if (query) {
      return {
        endpoint: '/load-more-search',
        params: {
          query: query
        }
      };
    }
  }

  // Upcoming page
  if (path === '/upcoming') {
    const initialPagesUsed = window.initialPagesUsed || 3;
    
    return {
      endpoint: '/load-more-upcoming',
      params: {
        sort: urlParams.get('sort') || 'popularity',
        genre: urlParams.get('genre') || '',
        initialPagesUsed: initialPagesUsed
      }
    };
  }

  return null; // Unknown page
}

// Export for manual use if needed
window.LoadMoreManager = LoadMoreManager;