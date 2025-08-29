# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Start the development server:
```bash
node app.js
```

The server runs on port 3000 by default (configurable via PORT environment variable).

## Application Architecture

This is a Node.js/Express.js movie release tracking web application with the following architecture:

### Core Stack
- **Backend**: Express.js with EJS templating engine
- **Database**: Airtable (Users and FollowedMovies tables)
- **External API**: The Movie Database (TMDB) API for movie data
- **Caching**: NodeCache with 10-minute TTL for performance optimization
- **Authentication**: Express sessions (session-based auth, not JWT)

### Directory Structure
```
├── app.js                 # Main Express application entry point
├── routes/               # Express route handlers
│   ├── index.js         # Home page
│   ├── auth.js          # Login/register/logout
│   ├── api.js           # Follow/unfollow API endpoints
│   ├── search-results.js # Movie search functionality
│   ├── upcoming.js      # Upcoming movie releases
│   ├── my-movies.js     # User's followed movies
│   └── movie-details.js # Individual movie pages
├── services/            # Business logic layer
│   ├── airtable.js      # Airtable database operations
│   ├── tmdb.js          # TMDB API integration
│   └── cache.js         # NodeCache wrapper
├── views/               # EJS templates
│   ├── layout.ejs       # Main layout template
│   └── partials/        # Reusable view components
└── public/              # Static assets (CSS, JS, images)
    └── js/              # Client-side JavaScript
```

## Key Services

### Airtable Service (`services/airtable.js`)
- **Purpose**: Handles all database operations for Users and FollowedMovies
- **Caching**: Implements cache-aside pattern for `getFollowedMoviesByUserId`
- **Key Functions**:
  - `getUsersByEmail()` - User authentication lookup
  - `getFollowedMoviesByUserId()` - Cached retrieval of user's followed movies
  - `followMovie()` / `unfollowMovie()` - Movie follow management with cache invalidation

### TMDB Service (`services/tmdb.js`)
- **Purpose**: Fetches streaming release dates from The Movie Database API
- **Key Function**: `getStreamingReleaseDate()` - Gets digital/physical release dates

### Cache Service (`services/cache.js`)
- **Implementation**: NodeCache with 10-minute default TTL
- **Usage**: Primarily used to cache Airtable API responses for performance
- **Pattern**: Cache-aside with explicit cache invalidation on data mutations

## Authentication & Session Management

- **Type**: Session-based authentication using `express-session`
- **Session Data**: `userId`, `userName`, `userEmail` stored in session
- **Global Middleware**: Makes user data available to all EJS templates via `res.locals`
- **Protection**: Routes check `req.session.userId` for authentication

## Movie Follow System

Users can follow movies with two release types:
- **"theatrical"**: Theater releases
- **"streaming"**: Digital/streaming releases  
- **"both"**: Follow both release types

The system automatically fetches streaming dates from TMDB when following streaming releases.

## Frontend Architecture

- **Template Engine**: EJS with express-ejs-layouts
- **Client-side JS**: Vanilla JavaScript in `/public/js/`
- **Key Frontend Files**:
  - `follow.js` - Handles follow/unfollow interactions
  - `movie-cards.js` - Movie card functionality
  - `pagination.js` - Pagination controls

## Environment Variables Required

```
SESSION_SECRET=your-session-secret
AIRTABLE_API_KEY=your-airtable-pat
AIRTABLE_BASE_ID=your-base-id
TMDB_API_KEY=your-tmdb-api-key
PORT=3000 (optional)
```

## Database Schema (Airtable)

### Users Table
- Email (Email field)
- Name (Text)
- Password (Text, hashed with bcrypt)

### FollowedMovies Table  
- User (Link to Users table)
- UserID (Text, session userId)
- TMDB_ID (Number)
- Title (Text)
- PosterPath (Text)
- FollowType (Single select: "theatrical" or "streaming")
- ReleaseDate (Date)
- StreamingReleaseDate (Date, for streaming follows)
- StreamingDateAvailable (Checkbox)

## Caching Strategy

- **Cache Key Pattern**: `followedMovies_${userId}`
- **TTL**: 600 seconds (10 minutes) 
- **Invalidation**: Explicit cache clearing on follow/unfollow operations
- **Location**: All caching logic centralized in `services/cache.js`