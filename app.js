const express = require("express");
const path = require("path");
const session = require("express-session");
const dotenv = require("dotenv");
const expressLayouts = require("express-ejs-layouts");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Trust proxy for Render deployment
if (process.env.NODE_ENV === "production") {
  app.set('trust proxy', 1);
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  })
);

// Set view engine and layout middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout"); // layout.ejs in views/

// Serve static assets
app.use(express.static(path.join(__dirname, "public")));

// Make session data available in all views
app.use((req, res, next) => {
  res.locals.isLoggedIn = !!req.session.userId;

  // Create a user object if logged in
  if (req.session.userId) {
    res.locals.user = {
      name: req.session.userName || null,
      email: req.session.userEmail || null,
      id: req.session.userId,
    };
  } else {
    res.locals.user = null;
  }

  res.locals.page = "";
  next();
});

// Routes
const indexRoutes = require("./routes/index");
const searchResultsRouter = require("./routes/search-results");
const upcomingRouter = require("./routes/upcoming");
const authRoutes = require("./routes/auth");
const myMoviesRouter = require("./routes/my-movies");
const checkReleases = require("./routes/check-releases");
const movieDetailsRoutes = require("./routes/movie-details");
const topReleasesRouter = require("./routes/top-releases");
const checkStreamingDatesRouter = require("./routes/check-streaming-dates");

// ADD: Centralized API routes
const apiRoutes = require("./routes/api");

app.use("/", indexRoutes);
app.use("/", searchResultsRouter);
app.use("/", upcomingRouter);
app.use("/auth", authRoutes);
app.use("/my-movies", myMoviesRouter);
app.use("/jobs/check-releases", checkReleases);
app.use("/movie", movieDetailsRoutes);
app.use("/", topReleasesRouter);
app.use("/jobs/check-streaming-dates", checkStreamingDatesRouter);

// Mount API routes (this handles /follow and /unfollow)
app.use("/", apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render("404", {
    title: "404 - Not Found",
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
