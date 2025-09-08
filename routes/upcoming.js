const express = require("express");
const router = express.Router();
const { getFollowedMoviesByUserId } = require("../services/airtable");
const { processMoviesWithDates, filterMovies, sortMovies, deduplicateMovies } = require("../services/movie-processor");
const { getExtendedUpcomingMovies, getGenres } = require("../services/tmdb");
const moviePaginationService = require("../services/movie-pagination");
router.get("/upcoming", async (req, res) => {
  const followMessage = req.query.followMessage || null;
  const sortBy = req.query.sort || "popularity";
  const genre = req.query.genre || null;
  const moviesPerPage = 20;

  try {
    let pageMovies = [];
    let initialPagesUsed = 0;

    // Try pagination service first for better performance
    try {
      const paginationResult = await moviePaginationService.getSortedPage(
        sortBy, 
        1, // First page
        moviesPerPage, 
        [], // No excluded IDs on initial load
        genre
      );

      pageMovies = paginationResult.movies;
      
      // For pagination service, we use a different tracking method
      initialPagesUsed = 1; // Pagination service handles this internally
      
    } catch (paginationError) {
      console.warn('Pagination service failed, falling back to original method:', paginationError);
      
      // Fallback to original implementation
      if (sortBy === 'release_date_asc' || sortBy === 'release_date_desc') {
        // Date-based sorting fallback
        let collectedMovies = [];
        let tmdbPage = 1;
        const maxPagesToFetch = 15;
        
        while (tmdbPage <= maxPagesToFetch) {
          const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);
          const results = response.results;
          
          const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
          const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
          
          collectedMovies.push(...filteredMovies);
          tmdbPage++;
          
          if (tmdbPage > response.total_pages) break;
        }
        
        const deduplicatedMovies = deduplicateMovies(collectedMovies, []);
        const sortedMovies = sortMovies(deduplicatedMovies, sortBy);
        
        pageMovies = sortedMovies.slice(0, moviesPerPage);
        initialPagesUsed = tmdbPage - 1;
        
      } else {
        // Popularity-based sorting fallback
        let collectedMovies = [];
        let tmdbPage = 1;
        const maxPagesToFetch = 10;
        
        while (collectedMovies.length < moviesPerPage && tmdbPage <= maxPagesToFetch) {
          const response = await getExtendedUpcomingMovies(tmdbPage, "US", sortBy);
          const results = response.results;

          const processedMovies = await processMoviesWithDates(results, { type: 'upcoming' });
          const filteredMovies = filterMovies(processedMovies, { type: 'upcoming', genre });
          const newFiltered = deduplicateMovies(filteredMovies, collectedMovies);

          collectedMovies.push(...newFiltered);
          tmdbPage++;

          if (tmdbPage > response.total_pages) break;
        }

        pageMovies = collectedMovies.slice(0, moviesPerPage);
        initialPagesUsed = tmdbPage - 1;
      }
    }

    let user = null;
    let followedMovieIds = [];

    if (req.session.userId) {
      user = {
        id: req.session.userId,
        name: req.session.userName || req.session.userEmail,
        airtableRecordId: req.session.airtableRecordId,
      };

      // Get followed movies (caching handled by service layer)
      const followedRecords = await getFollowedMoviesByUserId(req.session.userId);

      followedMovieIds = followedRecords.map((record) =>
        Number(record.fields.TMDB_ID)
      );
    }

    // Get genres for filter dropdown using centralized service
    const genresResponse = await getGenres();
    const genres = genresResponse.genres || [];

    res.locals.page = "upcoming";
    res.render("upcoming", {
      title: "Upcoming Movies - Movie Tracker",
      movies: pageMovies,
      user,
      followedMovieIds,
      followMessage,
      sortBy,
      genre,
      genres,
      query: "",
      loginRedirect: "/upcoming",
      initialLoad: true,
      initialPagesUsed: initialPagesUsed,
      sortOptions: [
        { value: "popularity", label: "Most Popular" },
        { value: "release_date_asc", label: "Soonest First" },
        { value: "release_date_desc", label: "Furthest First" },
      ],
    });
  } catch (err) {
    console.error("Upcoming movies error:", err);
    res.status(500).send("Something went wrong");
  }
});

module.exports = router;
