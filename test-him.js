// test-him.js
// Quick test script for the HIM movie date issue

require('dotenv').config();
const { testHIMMovie } = require('./utils/movie-data-tester');

async function main() {
  try {
    await testHIMMovie();
  } catch (error) {
    console.error('Error testing HIM movie:', error);
  }
}

main();