// utils/tmdb-testing-utils.js
// Utilities for testing TMDB API responses and data accuracy

const { getMovieDetails, searchMovies, getStreamingReleaseDate } = require('../services/tmdb');

/**
 * Raw TMDB API testing utilities
 * Direct API calls to inspect raw responses
 */

/**
 * Get raw TMDB movie data without processing
 * @param {number} movieId - TMDB movie ID
 * @returns {Object} Raw API response
 */
async function getRawTMDBData(movieId) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=release_dates`;
  
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url);
    const data = await response.json();
    
    return {
      success: true,
      data,
      url,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      url,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Compare date interpretations across different parsing methods
 * @param {string} dateString - Date string from TMDB
 * @returns {Object} Comparison of different date interpretations
 */
function compareDateInterpretations(dateString) {
  if (!dateString) return null;
  
  const originalDate = new Date(dateString);
  
  return {
    original: dateString,
    interpretations: {
      // Standard JavaScript Date parsing
      jsDate: {
        value: originalDate.toISOString(),
        display: originalDate.toLocaleDateString('en-US'),
        timestamp: originalDate.getTime()
      },
      // UTC interpretation (what we currently use)
      utcMidnight: {
        value: new Date(Date.UTC(
          originalDate.getUTCFullYear(),
          originalDate.getUTCMonth(),
          originalDate.getUTCDate()
        )).toISOString(),
        display: new Date(Date.UTC(
          originalDate.getUTCFullYear(),
          originalDate.getUTCMonth(),
          originalDate.getUTCDate()
        )).toLocaleDateString('en-US')
      },
      // Local timezone interpretation
      localMidnight: {
        value: new Date(
          originalDate.getFullYear(),
          originalDate.getMonth(),
          originalDate.getDate()
        ).toISOString(),
        display: new Date(
          originalDate.getFullYear(),
          originalDate.getMonth(),
          originalDate.getDate()
        ).toLocaleDateString('en-US')
      },
      // String parsing (YYYY-MM-DD)
      stringParsed: {
        value: dateString,
        display: new Date(dateString + 'T00:00:00').toLocaleDateString('en-US')
      }
    }
  };
}

/**
 * Get release dates from all regions
 * @param {number} movieId - TMDB movie ID  
 * @returns {Object} All release dates by region
 */
async function getAllReleaseDates(movieId) {
  const rawData = await getRawTMDBData(movieId);
  
  if (!rawData.success) {
    return { error: rawData.error };
  }
  
  const movie = rawData.data;
  const releaseDates = movie.release_dates?.results || [];
  
  const regionDates = {};
  
  releaseDates.forEach(region => {
    const countryCode = region.iso_3166_1;
    regionDates[countryCode] = {
      country: countryCode,
      dates: region.release_dates.map(release => ({
        date: release.release_date,
        type: release.type,
        note: release.note || '',
        certification: release.certification || ''
      }))
    };
  });
  
  return {
    movieTitle: movie.title,
    primaryDate: movie.release_date,
    regionDates,
    interpretations: compareDateInterpretations(movie.release_date)
  };
}

/**
 * Test multiple movies for consistency
 * @param {Array} movieIds - Array of TMDB movie IDs
 * @returns {Array} Comparison results
 */
async function batchTestMovieDates(movieIds) {
  const results = [];
  
  for (const movieId of movieIds) {
    console.log(`Testing movie ${movieId}...`);
    
    try {
      const allDates = await getAllReleaseDates(movieId);
      const processedData = await getMovieDetails(movieId);
      
      results.push({
        movieId,
        title: allDates.movieTitle,
        tmdbRaw: allDates.primaryDate,
        processedDate: processedData?.release_date,
        interpretations: allDates.interpretations,
        regionCount: Object.keys(allDates.regionDates).length,
        usRelease: allDates.regionDates['US']?.dates || null
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      results.push({
        movieId,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Find date discrepancies in a list of movies
 * @param {Array} results - Results from batchTestMovieDates
 * @returns {Array} Movies with date discrepancies
 */
function findDateDiscrepancies(results) {
  return results.filter(result => {
    if (result.error || !result.interpretations) return false;
    
    const interpretations = result.interpretations.interpretations;
    const dates = Object.values(interpretations).map(i => i.display);
    const uniqueDates = [...new Set(dates)];
    
    // Flag if there are multiple different date interpretations
    return uniqueDates.length > 1;
  });
}

/**
 * Create a test suite for specific movies
 */
async function createMovieTestSuite() {
  console.log('🧪 TMDB Movie Data Test Suite');
  console.log('===============================\n');
  
  // Test some known movies with potential date issues
  const testMovies = [
    986097, // HIM - known issue
    // Add more movie IDs here as needed
  ];
  
  const results = await batchTestMovieDates(testMovies);
  const discrepancies = findDateDiscrepancies(results);
  
  console.log('📊 TEST RESULTS:');
  results.forEach(result => {
    if (result.error) {
      console.log(`❌ ${result.movieId}: ${result.error}`);
      return;
    }
    
    console.log(`\n🎬 ${result.title} (${result.movieId})`);
    console.log(`   Raw TMDB: ${result.tmdbRaw}`);
    console.log(`   Processed: ${result.processedDate}`);
    
    if (result.interpretations) {
      console.log('   Interpretations:');
      Object.entries(result.interpretations.interpretations).forEach(([method, data]) => {
        console.log(`     ${method}: ${data.display}`);
      });
    }
    
    if (result.usRelease) {
      console.log(`   US Release Types: ${result.usRelease.length} entries`);
    }
  });
  
  if (discrepancies.length > 0) {
    console.log(`\n⚠️  Found ${discrepancies.length} movies with date interpretation discrepancies`);
  } else {
    console.log('\n✅ No date discrepancies found in test suite');
  }
  
  return { results, discrepancies };
}

module.exports = {
  getRawTMDBData,
  compareDateInterpretations,
  getAllReleaseDates,
  batchTestMovieDates,
  findDateDiscrepancies,
  createMovieTestSuite
};