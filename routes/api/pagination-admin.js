const express = require("express");
const router = express.Router();
const moviePaginationService = require("../../services/movie-pagination");

// Admin endpoint to view pagination service statistics
router.get("/pagination-stats", (req, res) => {
  try {
    const stats = moviePaginationService.getCacheStats();
    
    // Add server info
    const serverStats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    };
    
    res.json({
      timestamp: new Date().toISOString(),
      paginationService: stats,
      server: serverStats
    });
  } catch (error) {
    console.error('Error getting pagination stats:', error);
    res.status(500).json({ error: 'Failed to get pagination statistics' });
  }
});

// Admin endpoint to preload collections
router.post("/pagination-preload", async (req, res) => {
  try {
    console.log('Manual preload triggered from admin endpoint');
    await moviePaginationService.preloadCollections();
    
    const stats = moviePaginationService.getCacheStats();
    res.json({
      success: true,
      message: 'Collections preloaded successfully',
      stats: stats
    });
  } catch (error) {
    console.error('Error preloading collections:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to preload collections',
      message: error.message 
    });
  }
});

// Admin endpoint to clear stale collections
router.post("/pagination-cleanup", (req, res) => {
  try {
    moviePaginationService.clearStaleCollections();
    
    const stats = moviePaginationService.getCacheStats();
    res.json({
      success: true,
      message: 'Stale collections cleared',
      stats: stats
    });
  } catch (error) {
    console.error('Error clearing stale collections:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to clear stale collections',
      message: error.message 
    });
  }
});

module.exports = router;