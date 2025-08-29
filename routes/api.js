const express = require("express");
const router = express.Router();

// Import sub-route modules
const followRoutes = require("./api/follow");
const loadMoreRoutes = require("./api/load-more");

// Mount sub-routes
router.use("/", followRoutes);
router.use("/", loadMoreRoutes);

module.exports = router;