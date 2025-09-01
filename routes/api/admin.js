const express = require('express');
const router = express.Router();
const monitor = require('../../services/rate-limit-monitor');

const requireAdmin = (req, res, next) => {
  if (!req.query.admin_secret || req.query.admin_secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

const requireAdminPage = (req, res, next) => {
  if (!req.query.admin_secret || req.query.admin_secret !== process.env.ADMIN_SECRET) {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'Admin access required',
      statusCode: 403
    });
  }
  next();
};

router.get('/rate-limit-stats', requireAdmin, (req, res) => {
  try {
    const stats = monitor.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting rate limit stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stats'
    });
  }
});

router.post('/reset-rate-limit-stats', requireAdmin, (req, res) => {
  try {
    monitor.resetStats();
    res.json({
      success: true,
      message: 'Rate limit stats reset successfully'
    });
  } catch (error) {
    console.error('Error resetting rate limit stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset stats'
    });
  }
});

// Dashboard page
router.get('/dashboard', requireAdminPage, (req, res) => {
  res.render('admin-dashboard', {
    title: 'Rate Limiting Dashboard',
    layout: false // Don't use the main layout for admin dashboard
  });
});

module.exports = router;