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
├── app.js                      # Main Express application entry point
├── routes/                     # Express route handlers
│   ├── index.js               # Home page
│   ├── auth.js                # Login/register/logout
│   ├── api.js                 # Legacy API endpoints
│   ├── api/                   # Modern API endpoints
│   │   ├── follow.js         # Follow/unfollow API endpoints
│   │   └── load-more.js      # AJAX load-more endpoints
│   ├── search-results.js      # Movie search functionality
│   ├── upcoming.js            # Upcoming movie releases
│   ├── top-releases.js        # Top streaming releases
│   ├── my-movies.js           # User's followed movies
│   ├── movie-details.js       # Individual movie pages
│   ├── check-releases.js      # Release date checking cron
│   └── check-streaming-dates.js # Streaming date checking cron
├── services/                   # Business logic layer
│   ├── airtable.js            # Airtable database operations
│   ├── tmdb.js                # TMDB API integration
│   ├── cache.js               # NodeCache wrapper
│   ├── movie-processor.js     # Movie data processing and filtering
│   ├── send-email.js          # Email notification service
│   └── email-templates.js     # Email template generation
├── utils/                      # Utility functions
│   ├── date-helpers.js        # Date manipulation utilities
│   ├── search-helpers.js      # Search relevance and sorting
│   └── template-renderer.js   # EJS template rendering for APIs
├── views/                      # EJS templates
│   ├── layout.ejs             # Main layout template
│   └── partials/              # Reusable view components
└── public/                     # Static assets (CSS, JS, images)
    ├── css/                   # Stylesheets
    ├── js/                    # Client-side JavaScript
    │   ├── follow.js          # Follow/unfollow interactions
    │   ├── load-more.js       # AJAX pagination
    │   └── navigation.js      # Navigation utilities
    └── images/                # Static images
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

- **Purpose**: Fetches movie data from The Movie Database API
- **Key Functions**:
  - `searchMovies()` - Search for movies by query
  - `discoverMovies()` - Discover movies with filters
  - `getUpcomingMovies()` - Get upcoming movie releases
  - `getStreamingReleaseDate()` - Gets digital/physical release dates
  - `getMovieDetails()` - Fetch detailed movie information

### Movie Processor Service (`services/movie-processor.js`)

- **Purpose**: Centralized movie data processing and filtering
- **Key Functions**:
  - `processMoviesWithDates()` - Process TMDB movies with date calculations
  - `filterMovies()` - Filter movies based on type and criteria
  - `sortMovies()` - Sort movies by popularity, rating, or release date
  - `deduplicateMovies()` - Remove duplicate movies from arrays

### Cache Service (`services/cache.js`)

- **Implementation**: NodeCache with 10-minute default TTL
- **Usage**: Primarily used to cache Airtable API responses for performance
- **Pattern**: Cache-aside with explicit cache invalidation on data mutations

### Email Service (`services/send-email.js`)

- **Purpose**: Handles email notifications using Brevo API
- **Integration**: Works with `email-templates.js` for HTML email generation
- **Usage**: Sends release date notifications to users

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
  - `follow.js` - Handles follow/unfollow interactions with comprehensive error handling
  - `load-more.js` - Generic AJAX pagination system for all pages
  - `navigation.js` - Navigation utilities and search functionality
- **AJAX Load-More System**: Unified pagination system supporting:
  - Top Releases (`/load-more-releases`)
  - Search Results (`/load-more-search`) 
  - Upcoming Movies (`/load-more-upcoming`)
- **Follow System**: Event-delegated follow/unfollow with optimistic UI updates

## Environment Variables Required

```
# Server Configuration
PORT=3000                                    # Server port (optional)
SESSION_SECRET=your-session-secret           # Session encryption secret

# Database Configuration
AIRTABLE_API_KEY=your-airtable-pat          # Airtable Personal Access Token
AIRTABLE_BASE_ID=your-base-id               # Airtable Base ID
AIRTABLE_USERS_TABLE=Users                  # Users table name
AIRTABLE_FOLLOWED_MOVIES_TABLE=FollowedMovies # FollowedMovies table name

# External APIs
TMDB_API_KEY=your-tmdb-api-key              # The Movie Database API key
BREVO_API_KEY=your-brevo-api-key            # Brevo (formerly Sendinblue) API key for emails

# Cron Job Security
CRON_SECRET=your-cron-secret                # Secret for cron job endpoints
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

## API Endpoints Reference

### Page Routes
- `GET /` - Home page with search functionality
- `GET /upcoming` - Upcoming movie releases page
- `GET /top-releases` - Top streaming releases page  
- `GET /search` - Movie search results page
- `GET /my-movies` - User's followed movies page
- `GET /movie/:id` - Individual movie details page

### Authentication Routes (`routes/auth.js`)
- `GET /auth/login` - Login page
- `POST /auth/login` - Process login
- `GET /auth/register` - Registration page
- `POST /auth/register` - Process registration
- `POST /auth/logout` - Logout user

### API Routes (`routes/api/`)
- `POST /follow` - Follow a movie (`routes/api/follow.js`)
- `POST /unfollow` - Unfollow a movie (`routes/api/follow.js`)

### AJAX Load-More Routes (`routes/api/load-more.js`)
- `GET /load-more-releases?page=N&sort=popularity&genre=` - Load more top releases
- `GET /load-more-search?page=N&query=term` - Load more search results  
- `GET /load-more-upcoming?page=N` - Load more upcoming movies

### Cron Job Routes (Protected by CRON_SECRET)
- `POST /check-releases` - Check for new release dates (`routes/check-releases.js`)
- `POST /check-streaming-dates` - Check for streaming dates (`routes/check-streaming-dates.js`)

### Legacy API Routes (`routes/api.js`)
- Various legacy endpoints (being phased out in favor of `routes/api/` structure)

## Visual Development & Testing

### Design System

The project follows S-Tier SaaS design standards inspired by Stripe, Airbnb, and Linear. All UI development must adhere to:

- **Design Principles**: `/context/design-principles.md` - Comprehensive checklist for world-class UI
- **Component Library**: NextUI with custom Tailwind configuration

### Quick Visual Check

IMMEDIATELY after implementing any front-end change:

- **Identify what changed** - Review the modified components/pages
- **Navigate to affected pages** - Use `mcp__playwright__browser_navigate` to visit each changed view
- **Verify design compliance** - Compare against `/context/design-principles.md`
- **Validate feature implementation** - Ensure the change fulfills the user's specific request
- **Check acceptance criteria** - Review any provided context files or requirements
- **Capture evidence** - Take full page screenshot at desktop viewport (1440px) of each changed view
- **Check for errors** - Run `mcp__playwright__browser_console_messages` ⚠️

This verification ensures changes meet design standards and user requirements.

### Comprehensive Design Review

For significant UI changes or before merging PRs, use the design review agent:

```bash
# Option 1: Use the slash command
/design-review

# Option 2: Invoke the agent directly
@agent-design-review
```

The design review agent will:

- Test all interactive states and user flows
- Verify responsiveness (desktop/tablet/mobile)
- Check accessibility (WCAG 2.1 AA compliance)
- Validate visual polish and consistency
- Test edge cases and error states
- Provide categorized feedback (Blockers/High/Medium/Nitpicks)

### Playwright MCP Integration

Essential Commands for UI Testing:

```javascript
// Navigation & Screenshots
mcp__playwright__browser_navigate(url); // Navigate to page
mcp__playwright__browser_take_screenshot(); // Capture visual evidence
mcp__playwright__browser_resize(width, height); // Test responsiveness

// Interaction Testing
mcp__playwright__browser_click(element); // Test clicks
mcp__playwright__browser_type(element, text); // Test input
mcp__playwright__browser_hover(element); // Test hover states

// Validation
mcp__playwright__browser_console_messages(); // Check for errors
mcp__playwright__browser_snapshot(); // Accessibility check
mcp__playwright__browser_wait_for(text / element); // Ensure loading
```

### Design Compliance Checklist

When implementing UI features, verify:

- ✅ **Visual Hierarchy**: Clear focus flow, appropriate spacing
- ✅ **Consistency**: Uses design tokens, follows patterns
- ✅ **Responsiveness**: Works on mobile (375px), tablet (768px), desktop (1440px)
- ✅ **Accessibility**: Keyboard navigable, proper contrast, semantic HTML
- ✅ **Performance**: Fast load times, smooth animations (150-300ms)
- ✅ **Error Handling**: Clear error states, helpful messages
- ✅ **Polish**: Micro-interactions, loading states, empty states

### When to Use Automated Visual Testing

**Use Quick Visual Check for:**

- Every front-end change, no matter how small
- After implementing new components or features
- When modifying existing UI elements
- After fixing visual bugs
- Before committing UI changes

**Use Comprehensive Design Review for:**

- Major feature implementations
- Before creating pull requests with UI changes
- When refactoring component architecture
- After significant design system updates
- When accessibility compliance is critical

**Skip Visual Testing for:**

- Backend-only changes (API, database)
- Configuration file updates
- Documentation changes
- Test file modifications
- Non-visual utility functions

## Test Credentials

- Email: your-email@example.com
- Password: your-password
