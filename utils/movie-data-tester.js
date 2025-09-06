// utils/movie-data-tester.js
// Testing framework for movie data accuracy and consistency

const { getMovieDetails, searchMovies, getStreamingReleaseDate } = require('../services/tmdb');
const { formatDisplayDate } = require('./date-helpers');

/**
 * Movie Data Testing Framework
 * Tests for date accuracy, data consistency, and external source validation
 */

/**
 * Test a specific movie's data accuracy
 * @param {number|string} movieId - TMDB movie ID
 * @param {Object} options - Testing options
 * @returns {Object} Test results
 */
async function testMovieData(movieId, options = {}) {
  const { 
    expectedTheatricalDate = null,
    expectedStreamingDate = null,
    testTimezone = true,
    verbose = false 
  } = options;
  
  const results = {
    movieId,
    title: '',
    tests: {
      dataRetrieval: { passed: false, message: '' },
      dateConsistency: { passed: false, message: '' },
      timezoneHandling: { passed: false, message: '' },
      externalValidation: { passed: false, message: '' }
    },
    data: {
      theatrical: null,
      streaming: null,
      raw: null
    },
    recommendations: []
  };

  try {
    // Test 1: Basic data retrieval
    if (verbose) console.log(`\n🔍 Testing movie ID: ${movieId}`);
    
    const movieDetails = await getMovieDetails(movieId);
    if (!movieDetails) {
      results.tests.dataRetrieval.message = 'Failed to retrieve movie data from TMDB';
      return results;
    }
    
    results.title = movieDetails.title;
    results.data.raw = movieDetails;
    results.tests.dataRetrieval.passed = true;
    results.tests.dataRetrieval.message = 'Movie data retrieved successfully';
    
    if (verbose) console.log(`📽️  Movie: ${movieDetails.title}`);

    // Test 2: Date consistency check
    const theatricalDate = movieDetails.release_date;
    const streamingDate = await getStreamingReleaseDate(movieId);
    
    results.data.theatrical = theatricalDate;
    results.data.streaming = streamingDate;
    
    if (verbose) {
      console.log(`📅 Theatrical: ${theatricalDate || 'N/A'}`);
      console.log(`📺 Streaming: ${streamingDate || 'N/A'}`);
    }

    // Check for date consistency issues
    if (theatricalDate && streamingDate) {
      const theatricalMs = new Date(theatricalDate).getTime();
      const streamingMs = new Date(streamingDate).getTime();
      
      if (streamingMs < theatricalMs) {
        results.tests.dateConsistency.message = 'WARNING: Streaming date is before theatrical date';
        results.recommendations.push('Verify streaming date accuracy - typically releases digitally after theatrical');
      } else {
        results.tests.dateConsistency.passed = true;
        results.tests.dateConsistency.message = 'Date order is logical (streaming after theatrical)';
      }
    } else {
      results.tests.dateConsistency.passed = true;
      results.tests.dateConsistency.message = 'Date consistency check skipped (missing dates)';
    }

    // Test 3: Timezone handling validation
    if (testTimezone && theatricalDate) {
      const parsedDate = new Date(theatricalDate);
      const utcDate = new Date(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), parsedDate.getUTCDate());
      const localDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
      
      const utcString = utcDate.toISOString().split('T')[0];
      const localString = localDate.toISOString().split('T')[0];
      
      if (verbose) {
        console.log(`🌍 UTC interpretation: ${utcString}`);
        console.log(`📍 Local interpretation: ${localString}`);
      }
      
      if (utcString !== localString) {
        results.tests.timezoneHandling.message = `Potential timezone issue: UTC=${utcString}, Local=${localString}`;
        results.recommendations.push('Date may vary by timezone - verify with multiple sources');
      } else {
        results.tests.timezoneHandling.passed = true;
        results.tests.timezoneHandling.message = 'No timezone discrepancy detected';
      }
    }

    // Test 4: External validation (if expected dates provided)
    if (expectedTheatricalDate || expectedStreamingDate) {
      const issues = [];
      
      if (expectedTheatricalDate && theatricalDate) {
        const expected = new Date(expectedTheatricalDate).toISOString().split('T')[0];
        const actual = new Date(theatricalDate).toISOString().split('T')[0];
        
        if (expected !== actual) {
          issues.push(`Theatrical: Expected ${expected}, Got ${actual}`);
        }
      }
      
      if (expectedStreamingDate && streamingDate) {
        const expected = new Date(expectedStreamingDate).toISOString().split('T')[0];
        const actual = new Date(streamingDate).toISOString().split('T')[0];
        
        if (expected !== actual) {
          issues.push(`Streaming: Expected ${expected}, Got ${actual}`);
        }
      }
      
      if (issues.length === 0) {
        results.tests.externalValidation.passed = true;
        results.tests.externalValidation.message = 'Dates match external sources';
      } else {
        results.tests.externalValidation.message = `Date mismatches: ${issues.join(', ')}`;
        results.recommendations.push('Cross-reference with official sources (IMDb, official sites)');
      }
    } else {
      results.tests.externalValidation.passed = true;
      results.tests.externalValidation.message = 'No external validation requested';
    }

  } catch (error) {
    results.tests.dataRetrieval.message = `Error during testing: ${error.message}`;
    console.error('Movie data testing error:', error);
  }

  return results;
}

/**
 * Test multiple movies for data consistency
 * @param {Array} movieList - Array of movie objects with {id, title, expectedDates}
 * @returns {Array} Array of test results
 */
async function testMultipleMovies(movieList) {
  const results = [];
  
  for (const movie of movieList) {
    console.log(`\n🎬 Testing: ${movie.title || movie.id}`);
    const result = await testMovieData(movie.id, {
      expectedTheatricalDate: movie.expectedTheatricalDate,
      expectedStreamingDate: movie.expectedStreamingDate,
      verbose: true
    });
    results.push(result);
    
    // Brief delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * Generate a summary report of test results
 * @param {Array} results - Array of test results from testMovieData
 * @returns {Object} Summary report
 */
function generateTestReport(results) {
  const report = {
    totalTested: results.length,
    passedAll: 0,
    failedDataRetrieval: 0,
    dateInconsistencies: 0,
    timezoneIssues: 0,
    externalMismatches: 0,
    recommendations: new Set()
  };

  results.forEach(result => {
    const tests = result.tests;
    let allPassed = true;

    if (!tests.dataRetrieval.passed) {
      report.failedDataRetrieval++;
      allPassed = false;
    }
    if (!tests.dateConsistency.passed) {
      report.dateInconsistencies++;
      allPassed = false;
    }
    if (!tests.timezoneHandling.passed) {
      report.timezoneIssues++;
      allPassed = false;
    }
    if (!tests.externalValidation.passed) {
      report.externalMismatches++;
      allPassed = false;
    }

    if (allPassed) report.passedAll++;

    // Collect unique recommendations
    result.recommendations.forEach(rec => report.recommendations.add(rec));
  });

  report.recommendations = Array.from(report.recommendations);
  return report;
}

/**
 * Quick test for the HIM movie date issue
 */
async function testHIMMovie() {
  console.log('🎯 Testing HIM movie date discrepancy...\n');
  
  // Test the specific HIM movie that's showing incorrect date
  const result = await testMovieData(986097, {
    expectedTheatricalDate: '2025-09-19', // What you expect it should be
    verbose: true
  });
  
  console.log('\n📊 TEST RESULTS:');
  console.log('================');
  Object.entries(result.tests).forEach(([testName, testResult]) => {
    const status = testResult.passed ? '✅' : '❌';
    console.log(`${status} ${testName}: ${testResult.message}`);
  });
  
  if (result.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    result.recommendations.forEach(rec => console.log(`  • ${rec}`));
  }
  
  return result;
}

module.exports = {
  testMovieData,
  testMultipleMovies,
  generateTestReport,
  testHIMMovie
};