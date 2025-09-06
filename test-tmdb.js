// test-tmdb.js  
// Test script to run comprehensive TMDB date testing

require('dotenv').config();
const { createMovieTestSuite } = require('./utils/tmdb-testing-utils');

async function main() {
  try {
    await createMovieTestSuite();
  } catch (error) {
    console.error('Error running TMDB test suite:', error);
  }
}

main();