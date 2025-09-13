/**
 * Sort Comparison Tool
 * Admin interface for validating sorting accuracy and performance
 */

const express = require('express');
const router = express.Router();
const { sortTester } = require('../../utils/sort-testing');
const { getExtendedUpcomingMovies } = require('../../services/tmdb');
const { processMoviesWithDates, filterMovies, sortMovies } = require('../../services/movie-processor');
const moviePaginationService = require('../../services/movie-pagination');

// Middleware to protect admin routes
router.use((req, res, next) => {
  const adminSecret = req.query.secret || req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

/**
 * GET /admin/sort-comparison
 * Main comparison interface
 */
router.get('/sort-comparison', async (req, res) => {
  const sortBy = req.query.sort || 'popularity';
  const genre = req.query.genre || null;
  const pageCount = parseInt(req.query.pages) || 5;
  const testPages = parseInt(req.query.testPages) || 30;

  try {
    console.log(`Starting sort comparison: ${sortBy}, pages: ${pageCount} vs ${testPages}`);

    // Clear previous test results
    sortTester.clearResults();

    const results = {
      sortBy,
      genre,
      pageCount,
      testPages,
      optimizedMethod: null,
      originalMethod: null,
      comparison: null,
      performance: null,
      timestamp: new Date().toISOString()
    };

    // Method 1: Optimized approach (limited pages)
    const optimizedPerf = await sortTester.measurePerformance(async () => {
      return await getOptimizedResults(sortBy, pageCount, genre);
    }, `Optimized Method (${pageCount} pages)`);

    results.optimizedMethod = {
      movies: optimizedPerf.result || [],
      performance: {
        executionTime: optimizedPerf.executionTime,
        memoryDelta: optimizedPerf.memoryDelta
      }
    };

    // Method 2: Original approach (full pages)
    const originalPerf = await sortTester.measurePerformance(async () => {
      return await getOriginalResults(sortBy, testPages, genre);
    }, `Original Method (${testPages} pages)`);

    results.originalMethod = {
      movies: originalPerf.result || [],
      performance: {
        executionTime: originalPerf.executionTime,
        memoryDelta: originalPerf.memoryDelta
      }
    };

    // Compare results
    results.comparison = sortTester.compareResults(
      results.optimizedMethod.movies,
      results.originalMethod.movies,
      'id'
    );

    // Validate sorting accuracy
    if (sortBy === 'popularity') {
      results.optimizedValidation = sortTester.validatePopularityOrder(results.optimizedMethod.movies);
      results.originalValidation = sortTester.validatePopularityOrder(results.originalMethod.movies);
    } else if (sortBy.includes('release_date')) {
      const direction = sortBy.includes('desc') ? 'desc' : 'asc';
      results.optimizedValidation = sortTester.validateDateOrder(results.optimizedMethod.movies, direction);
      results.originalValidation = sortTester.validateDateOrder(results.originalMethod.movies, direction);
    }

    // Data completeness check
    results.dataQuality = {
      optimized: sortTester.validateDataCompleteness(results.optimizedMethod.movies),
      original: sortTester.validateDataCompleteness(results.originalMethod.movies)
    };

    // Performance summary
    results.performance = sortTester.getPerformanceSummary();

    res.json(results);

  } catch (error) {
    console.error('Sort comparison error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /admin/sort-comparison/ui
 * HTML interface for visual comparison
 */
router.get('/sort-comparison/ui', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sort Comparison Tool</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .controls { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .controls input, .controls select { margin: 5px; padding: 8px; }
            .results { display: flex; gap: 20px; }
            .method { flex: 1; border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
            .method h3 { margin-top: 0; }
            .movie-list { max-height: 400px; overflow-y: auto; }
            .movie-item { padding: 8px; border-bottom: 1px solid #eee; font-size: 14px; }
            .movie-item:nth-child(even) { background: #f9f9f9; }
            .performance { background: #e8f5e8; padding: 10px; border-radius: 4px; margin: 10px 0; }
            .error { background: #ffe6e6; color: #d00; padding: 10px; border-radius: 4px; }
            .success { background: #e6ffe6; color: #090; padding: 10px; border-radius: 4px; }
            .comparison-stats { background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .loading { text-align: center; padding: 40px; color: #666; }
            button { background: #007cba; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
            button:hover { background: #005a8b; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 Sort Comparison Tool</h1>

            <div class="controls">
                <h3>Test Configuration</h3>
                <label>Sort By:</label>
                <select id="sortBy">
                    <option value="popularity">Popularity</option>
                    <option value="release_date_asc">Release Date (Asc)</option>
                    <option value="release_date_desc">Release Date (Desc)</option>
                </select>

                <label>Optimized Pages:</label>
                <input type="number" id="pageCount" value="5" min="1" max="10">

                <label>Test Pages:</label>
                <input type="number" id="testPages" value="15" min="5" max="30">

                <label>Admin Secret:</label>
                <input type="password" id="adminSecret" placeholder="Enter admin secret">

                <button onclick="runComparison()">Run Comparison</button>
            </div>

            <div id="loading" class="loading" style="display: none;">
                Running comparison... This may take a few minutes.
            </div>

            <div id="results" style="display: none;">
                <div class="comparison-stats" id="comparisonStats"></div>

                <div class="results">
                    <div class="method">
                        <h3>🚀 Optimized Method</h3>
                        <div id="optimizedPerf" class="performance"></div>
                        <div id="optimizedMovies" class="movie-list"></div>
                    </div>

                    <div class="method">
                        <h3>🐌 Original Method</h3>
                        <div id="originalPerf" class="performance"></div>
                        <div id="originalMovies" class="movie-list"></div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            async function runComparison() {
                const sortBy = document.getElementById('sortBy').value;
                const pageCount = document.getElementById('pageCount').value;
                const testPages = document.getElementById('testPages').value;
                const adminSecret = document.getElementById('adminSecret').value;

                if (!adminSecret) {
                    alert('Please enter admin secret');
                    return;
                }

                document.getElementById('loading').style.display = 'block';
                document.getElementById('results').style.display = 'none';

                try {
                    const response = await fetch(
                        \`/admin/sort-comparison?sort=\${sortBy}&pages=\${pageCount}&testPages=\${testPages}&secret=\${adminSecret}\`
                    );

                    if (!response.ok) {
                        throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
                    }

                    const data = await response.json();
                    displayResults(data);
                } catch (error) {
                    document.getElementById('loading').innerHTML =
                        \`<div class="error">Error: \${error.message}</div>\`;
                }
            }

            function displayResults(data) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('results').style.display = 'block';

                // Performance comparison
                const optimizedTime = data.optimizedMethod.performance.executionTime.toFixed(2);
                const originalTime = data.originalMethod.performance.executionTime.toFixed(2);
                const improvement = ((originalTime - optimizedTime) / originalTime * 100).toFixed(1);

                document.getElementById('optimizedPerf').innerHTML =
                    \`⏱️ \${optimizedTime}ms | 📊 \${data.optimizedMethod.movies.length} movies\`;

                document.getElementById('originalPerf').innerHTML =
                    \`⏱️ \${originalTime}ms | 📊 \${data.originalMethod.movies.length} movies\`;

                // Comparison stats
                document.getElementById('comparisonStats').innerHTML = \`
                    <h3>📈 Comparison Results</h3>
                    <div class="\${improvement > 0 ? 'success' : 'error'}">
                        Performance: \${improvement}% improvement (\${optimizedTime}ms vs \${originalTime}ms)
                    </div>
                    <div class="\${data.comparison.accuracy > 90 ? 'success' : 'error'}">
                        Accuracy: \${data.comparison.accuracy.toFixed(1)}% order match
                    </div>
                    <div>Movies in common: \${data.optimizedMethod.movies.length - data.comparison.set1Only.length}</div>
                    <div>Optimized only: \${data.comparison.set1Only.length} movies</div>
                    <div>Original only: \${data.comparison.set2Only.length} movies</div>
                \`;

                // Movie lists
                displayMovieList('optimizedMovies', data.optimizedMethod.movies, data.sortBy);
                displayMovieList('originalMovies', data.originalMethod.movies, data.sortBy);
            }

            function displayMovieList(elementId, movies, sortBy) {
                const element = document.getElementById(elementId);
                element.innerHTML = movies.slice(0, 50).map((movie, index) => {
                    const sortValue = sortBy === 'popularity' ?
                        \`Pop: \${movie.popularity?.toFixed(1) || 'N/A'}\` :
                        \`Date: \${movie.release_date || 'N/A'}\`;

                    return \`
                        <div class="movie-item">
                            <strong>#\${index + 1}</strong> \${movie.title}
                            <br><small>\${sortValue} | ID: \${movie.id}</small>
                        </div>
                    \`;
                }).join('');

                if (movies.length > 50) {
                    element.innerHTML += \`<div class="movie-item"><em>... and \${movies.length - 50} more</em></div>\`;
                }
            }
        </script>
    </body>
    </html>
  `;

  res.send(html);
});

/**
 * Get optimized results (limited pages)
 */
async function getOptimizedResults(sortBy, pageCount, genre) {
  const movies = [];

  for (let page = 1; page <= pageCount; page++) {
    const response = await getExtendedUpcomingMovies(page, "US", sortBy);
    if (response.results && response.results.length > 0) {
      const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
      const filtered = filterMovies(processed, { type: 'upcoming', genre });
      movies.push(...filtered);
    }

    // Small delay to be nice to TMDB
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Sort the results
  return sortMovies(movies, sortBy);
}

/**
 * Get original results (full pages)
 */
async function getOriginalResults(sortBy, pageCount, genre) {
  const movies = [];

  for (let page = 1; page <= pageCount; page++) {
    const response = await getExtendedUpcomingMovies(page, "US", sortBy);
    if (response.results && response.results.length > 0) {
      const processed = await processMoviesWithDates(response.results, { type: 'upcoming' });
      const filtered = filterMovies(processed, { type: 'upcoming', genre });
      movies.push(...filtered);
    }

    // Small delay to be nice to TMDB
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // Sort the results
  return sortMovies(movies, sortBy);
}

module.exports = router;