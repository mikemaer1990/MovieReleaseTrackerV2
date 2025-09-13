/**
 * Sort Testing Utilities
 * Provides tools for validating movie sorting accuracy and performance
 */

const { performance } = require('perf_hooks');

class SortTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Validate popularity sorting order
   * @param {Array} movies - Array of movies to validate
   * @returns {Object} Validation results
   */
  validatePopularityOrder(movies) {
    const results = {
      isValid: true,
      errors: [],
      score: 0,
      total: movies.length - 1
    };

    for (let i = 0; i < movies.length - 1; i++) {
      const current = movies[i];
      const next = movies[i + 1];

      // Check if popularity is in descending order
      if (current.popularity < next.popularity) {
        results.isValid = false;
        results.errors.push({
          index: i,
          current: {
            id: current.id,
            title: current.title,
            popularity: current.popularity
          },
          next: {
            id: next.id,
            title: next.title,
            popularity: next.popularity
          },
          issue: 'Popularity order violation'
        });
      } else {
        results.score++;
      }
    }

    results.accuracy = results.total > 0 ? (results.score / results.total) * 100 : 100;
    return results;
  }

  /**
   * Validate date sorting order (ascending or descending)
   * @param {Array} movies - Array of movies to validate
   * @param {string} direction - 'asc' or 'desc'
   * @returns {Object} Validation results
   */
  validateDateOrder(movies, direction = 'asc') {
    const results = {
      isValid: true,
      errors: [],
      score: 0,
      total: movies.length - 1
    };

    for (let i = 0; i < movies.length - 1; i++) {
      const current = movies[i];
      const next = movies[i + 1];

      if (!current.release_date || !next.release_date) {
        continue; // Skip movies without dates
      }

      const currentDate = new Date(current.release_date);
      const nextDate = new Date(next.release_date);

      let orderCorrect = false;
      if (direction === 'asc') {
        orderCorrect = currentDate <= nextDate;
      } else {
        orderCorrect = currentDate >= nextDate;
      }

      if (!orderCorrect) {
        results.isValid = false;
        results.errors.push({
          index: i,
          current: {
            id: current.id,
            title: current.title,
            release_date: current.release_date
          },
          next: {
            id: next.id,
            title: next.title,
            release_date: next.release_date
          },
          issue: `Date order violation (${direction})`
        });
      } else {
        results.score++;
      }
    }

    results.accuracy = results.total > 0 ? (results.score / results.total) * 100 : 100;
    return results;
  }

  /**
   * Measure performance of a function
   * @param {Function} fn - Function to measure
   * @param {string} label - Label for the measurement
   * @returns {Object} Performance results
   */
  async measurePerformance(fn, label = 'Function') {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    try {
      const result = await fn();
      const endTime = performance.now();
      const endMemory = process.memoryUsage();

      const performanceResult = {
        label,
        executionTime: endTime - startTime,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external
        },
        result,
        success: true
      };

      this.testResults.push(performanceResult);
      return performanceResult;
    } catch (error) {
      const endTime = performance.now();

      const errorResult = {
        label,
        executionTime: endTime - startTime,
        error: error.message,
        success: false
      };

      this.testResults.push(errorResult);
      return errorResult;
    }
  }

  /**
   * Compare two movie result sets
   * @param {Array} set1 - First set of movies
   * @param {Array} set2 - Second set of movies
   * @param {string} compareBy - Field to compare ('id', 'title', 'popularity', 'release_date')
   * @returns {Object} Comparison results
   */
  compareResults(set1, set2, compareBy = 'id') {
    const comparison = {
      identical: true,
      differences: [],
      set1Only: [],
      set2Only: [],
      orderDifferences: [],
      accuracy: 0
    };

    // Create maps for quick lookup
    const set1Map = new Map();
    const set2Map = new Map();

    set1.forEach((movie, index) => {
      set1Map.set(movie[compareBy], { movie, index });
    });

    set2.forEach((movie, index) => {
      set2Map.set(movie[compareBy], { movie, index });
    });

    // Find movies only in set1
    for (const [key, data] of set1Map) {
      if (!set2Map.has(key)) {
        comparison.set1Only.push(data.movie);
        comparison.identical = false;
      }
    }

    // Find movies only in set2
    for (const [key, data] of set2Map) {
      if (!set1Map.has(key)) {
        comparison.set2Only.push(data.movie);
        comparison.identical = false;
      }
    }

    // Compare order for common movies
    let correctOrder = 0;
    const minLength = Math.min(set1.length, set2.length);

    for (let i = 0; i < minLength; i++) {
      const movie1 = set1[i];
      const movie2 = set2[i];

      if (movie1[compareBy] === movie2[compareBy]) {
        correctOrder++;
      } else {
        comparison.orderDifferences.push({
          position: i,
          set1: { [compareBy]: movie1[compareBy], title: movie1.title },
          set2: { [compareBy]: movie2[compareBy], title: movie2.title }
        });
        comparison.identical = false;
      }
    }

    comparison.accuracy = minLength > 0 ? (correctOrder / minLength) * 100 : 100;

    return comparison;
  }

  /**
   * Generate performance summary
   * @returns {Object} Summary of all test results
   */
  getPerformanceSummary() {
    const successful = this.testResults.filter(r => r.success);
    const failed = this.testResults.filter(r => !r.success);

    const avgExecutionTime = successful.length > 0
      ? successful.reduce((sum, r) => sum + r.executionTime, 0) / successful.length
      : 0;

    return {
      totalTests: this.testResults.length,
      successful: successful.length,
      failed: failed.length,
      averageExecutionTime: avgExecutionTime,
      results: this.testResults
    };
  }

  /**
   * Clear all test results
   */
  clearResults() {
    this.testResults = [];
  }

  /**
   * Validate movie data completeness
   * @param {Array} movies - Movies to validate
   * @returns {Object} Data quality results
   */
  validateDataCompleteness(movies) {
    const results = {
      total: movies.length,
      complete: 0,
      issues: []
    };

    movies.forEach((movie, index) => {
      const issues = [];

      if (!movie.id) issues.push('Missing ID');
      if (!movie.title) issues.push('Missing title');
      if (!movie.release_date) issues.push('Missing release date');
      if (movie.popularity === undefined || movie.popularity === null) issues.push('Missing popularity');
      if (!movie.poster_path) issues.push('Missing poster');

      if (issues.length === 0) {
        results.complete++;
      } else {
        results.issues.push({
          index,
          movie: { id: movie.id, title: movie.title },
          issues
        });
      }
    });

    results.completeness = results.total > 0 ? (results.complete / results.total) * 100 : 100;
    return results;
  }
}

// Export singleton instance
const sortTester = new SortTester();

module.exports = {
  SortTester,
  sortTester
};