# Movie Release Notification System - Implementation Guide

## 🎯 What You Need to Build

### Two Cron Jobs

1. **Release Date Discovery Job**
   - Finds missing release dates for followed movies
   - Updates your database with new dates
   - Emails users when dates are found

2. **Release Notification Job**
   - Detects movies released today
   - Sends "now available" emails to users
   - Tracks notifications to prevent duplicates

---

## 📊 Current Structure Analysis & Optimizations

### Current Strengths ✅
- **User-grouped emails**: Single email per user (not one per movie)
- **Batch/single logic**: Smart switching between batch and individual emails
- **Error isolation**: Failures don't crash the entire job
- **Rate limiting**: 1-second delays every 10 TMDB requests

### Optimization Opportunities 🚀

#### 1. **Database Query Optimization**
**Current issue**: Individual user lookups in loop
```javascript
// ❌ Current: N+1 query pattern
userIds.map(async (userId) => {
  const userRes = await airtableAxios.get(`${AIRTABLE_USERS_TABLE}/${userId}`);
});
```

**Optimization for Supabase**:
```javascript
// ✅ Optimized: Single query with join
const { data: moviesWithUsers } = await supabase
  .from('followed_movies')
  .select(`
    *,
    user:user_id (
      id,
      email,
      name
    )
  `)
  .is('theatrical_date', null);
```

#### 2. **TMDB API Deduplication**
**Current issue**: Processes same TMDB ID multiple times if multiple users follow it

**Optimization**:
```javascript
// ✅ Deduplicate by TMDB ID before fetching
const uniqueTmdbIds = [...new Set(movies.map(m => m.tmdb_id))];
const tmdbDataMap = new Map();

for (const tmdbId of uniqueTmdbIds) {
  const data = await fetchTMDB(tmdbId);
  tmdbDataMap.set(tmdbId, data);
  await sleep(250); // Rate limit once per unique movie
}

// Apply cached data to all user follows
movies.forEach(movie => {
  movie.dates = tmdbDataMap.get(movie.tmdb_id);
});
```

#### 3. **Notification Tracking**
**Current**: No duplicate prevention

**Optimization**: Add timestamp columns
```sql
ALTER TABLE followed_movies
ADD COLUMN theatrical_notified_at TIMESTAMPTZ,
ADD COLUMN streaming_notified_at TIMESTAMPTZ;
```

Query only unnotified releases:
```javascript
.is('theatrical_notified_at', null)
.eq('theatrical_date', today)
```

#### 4. **Batch Database Updates**
**Current**: Individual PATCH requests

**Optimization for Supabase**:
```javascript
// ✅ Batch update (single query)
await supabase
  .from('followed_movies')
  .upsert(updatedMovies, {
    onConflict: 'id',
    ignoreDuplicates: false
  });
```

---

## 🔧 Core Functions You Need

### 1. **Date Discovery Service**
```typescript
async function discoverMissingDates() {
  // 1. Get movies missing dates (with user data joined)
  const movies = await supabase
    .from('followed_movies')
    .select('*, user:user_id(id, email, name)')
    .or('theatrical_date.is.null,streaming_date.is.null');

  // 2. Deduplicate by TMDB ID
  const uniqueTmdbIds = [...new Set(movies.map(m => m.tmdb_id))];

  // 3. Fetch from TMDB (with rate limiting)
  const tmdbCache = new Map();
  for (const tmdbId of uniqueTmdbIds) {
    const dates = await getTMDBReleaseDates(tmdbId);
    tmdbCache.set(tmdbId, dates);
    await sleep(250);
  }

  // 4. Build updates array
  const updates = [];
  const emailQueue = [];

  movies.forEach(movie => {
    const dates = tmdbCache.get(movie.tmdb_id);
    const updates = {};

    if (!movie.theatrical_date && dates.theatrical) {
      updates.theatrical_date = dates.theatrical;
      emailQueue.push({ user: movie.user, movie, type: 'theatrical' });
    }

    if (!movie.streaming_date && dates.streaming) {
      updates.streaming_date = dates.streaming;
      emailQueue.push({ user: movie.user, movie, type: 'streaming' });
    }

    if (Object.keys(updates).length > 0) {
      updates.push({ id: movie.id, ...updates });
    }
  });

  // 5. Batch update database
  await supabase.from('followed_movies').upsert(updates);

  // 6. Send batched emails
  await sendBatchedDateEmails(emailQueue);
}
```

### 2. **Release Notification Service**
```typescript
async function sendReleaseNotifications() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Get today's releases (with user data, only unnotified)
  const { data: releases } = await supabase
    .from('followed_movies')
    .select('*, user:user_id(id, email, name)')
    .or(`and(theatrical_date.eq.${today},theatrical_notified_at.is.null),and(streaming_date.eq.${today},streaming_notified_at.is.null)`);

  // 2. Group by user email
  const releasesByUser = releases.reduce((acc, release) => {
    const email = release.user.email;
    if (!acc[email]) acc[email] = [];
    acc[email].push(release);
    return acc;
  }, {});

  // 3. Send emails
  const notificationUpdates = [];

  for (const [email, userReleases] of Object.entries(releasesByUser)) {
    try {
      // Send single or batch email
      if (userReleases.length === 1) {
        await sendSingleReleaseEmail(email, userReleases[0]);
      } else {
        await sendBatchReleaseEmail(email, userReleases);
      }

      // Mark as notified
      userReleases.forEach(release => {
        const isTheatrical = release.theatrical_date === today;
        notificationUpdates.push({
          id: release.id,
          ...(isTheatrical
            ? { theatrical_notified_at: new Date() }
            : { streaming_notified_at: new Date() }
          )
        });
      });
    } catch (error) {
      console.error(`Email failed for ${email}:`, error);
    }
  }

  // 4. Update notification timestamps
  await supabase.from('followed_movies').upsert(notificationUpdates);
}
```

### 3. **Email Batching Helper**
```typescript
async function sendBatchedDateEmails(emailQueue: EmailQueueItem[]) {
  // Group by user email
  const grouped = emailQueue.reduce((acc, item) => {
    const email = item.user.email;
    if (!acc[email]) {
      acc[email] = { theatrical: [], streaming: [] };
    }
    acc[email][item.type].push(item.movie);
    return acc;
  }, {});

  // Send one email per user
  for (const [email, movies] of Object.entries(grouped)) {
    const totalCount = movies.theatrical.length + movies.streaming.length;

    if (totalCount === 1) {
      // Single movie email
      const movie = movies.theatrical[0] || movies.streaming[0];
      const type = movies.theatrical[0] ? 'theatrical' : 'streaming';
      await sendSingleDateEmail(email, movie, type);
    } else {
      // Batch email
      await sendBatchDateEmail(email, movies);
    }
  }
}
```

---

## 📧 Email HTML Templates

### Email Design System

**Colors**:
- Background: `#0a0a0a` (dark black)
- Card: `linear-gradient(135deg, #121212 0%, #1a1a1a 100%)`
- Header: `linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%)` (gold)
- Accent: `#f3d96b` (gold)
- Text: `#ccc` (light gray), `#1a1a1a` (dark on gold)

**Structure**:
- Max width: 600px
- Border radius: 12px
- Box shadow: `0 8px 32px rgba(0,0,0,0.6)`
- Poster size: 200x300px (single), 120x180px (batch)

### Template 1: Single Release Notification
```html
<!-- Gold gradient header with emoji -->
<td style="background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); padding: 40px 32px; text-align: center;">
  <span style="font-size: 32px;">🎬</span>
  <h1 style="font-size: 28px; color: #1a1a1a; margin: 0;">Release Day!</h1>
  <p style="font-size: 18px; color: #1a1a1a; margin: 12px 0 0 0;">Your followed movie is now available</p>
</td>

<!-- Movie card with poster -->
<td style="background: #1a1a1a; padding: 48px 32px;">
  <table style="background: linear-gradient(135deg, #1f1f1f 0%, #2b2b2b 100%); border: 1px solid #333; border-radius: 12px;">
    <tr>
      <td style="padding: 32px; text-align: center;">
        <img src="https://image.tmdb.org/t/p/w500{{posterPath}}" width="200" height="300" style="border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.6);" />
        <h2 style="font-size: 28px; color: #f3d96b; margin: 20px 0;">{{title}}</h2>

        <!-- Release info box -->
        <table style="background: linear-gradient(90deg, rgba(243,217,107,0.1), rgba(216,185,75,0.1)); border: 1px solid rgba(243,217,107,0.2); border-radius: 8px; margin: 24px 0;">
          <tr>
            <td style="padding: 20px;">
              <p style="font-size: 20px; color: #f3d96b; margin: 0;">{{releaseDate}}</p>
              <p style="font-size: 14px; color: #ccc; margin: 0;">{{releaseTypeText}}</p>
            </td>
          </tr>
        </table>

        <!-- CTA button -->
        <a href="{{appUrl}}/movie/{{tmdbId}}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(90deg, #f3d96b 0%, #d8b94b 50%, #f3d96b 100%); color: #1a1a1a; text-decoration: none; border-radius: 8px; font-weight: 600;">
          View Movie Details
        </a>
      </td>
    </tr>
  </table>
</td>
```

### Template 2: Batch Release Notification
```html
<!-- Header with mixed emojis -->
<h1>{{headerEmojis}} Release Day!</h1>
<p>{{count}} of your followed movies are available today</p>

<!-- Theatrical section (if any) -->
<h2 style="color: #f3d96b; border-bottom: 1px solid #333; padding-bottom: 12px;">
  🎬 Now in Theaters ({{theatricalCount}})
</h2>
{{#theatricalMovies}}
  <table style="background: linear-gradient(135deg, #1f1f1f, #2b2b2b); border-radius: 12px; margin-bottom: 24px;">
    <tr>
      <td width="120">
        <img src="https://image.tmdb.org/t/p/w500{{posterPath}}" width="120" height="180" />
      </td>
      <td>
        <h3 style="color: #f3d96b;">{{title}}</h3>
        <div style="background: rgba(243,217,107,0.1); border-radius: 6px; padding: 12px; display: inline-block;">
          <p style="color: #f3d96b; margin: 0;">{{releaseDate}}</p>
          <p style="color: #ccc; font-size: 12px; margin: 0;">now in theaters</p>
        </div>
        <a href="{{appUrl}}/movie/{{tmdbId}}" style="display: inline-block; padding: 10px 20px; background: linear-gradient(90deg, #f3d96b, #d8b94b); color: #1a1a1a; border-radius: 6px;">View Details</a>
      </td>
    </tr>
  </table>
{{/theatricalMovies}}

<!-- Streaming section (if any) -->
<h2>📺 Available for Streaming ({{streamingCount}})</h2>
{{#streamingMovies}}
  <!-- Same card structure as theatrical -->
{{/streamingMovies}}
```

### Template 3: Date Discovery Notification
```html
<!-- Header -->
<h1>📅 New Dates Added!</h1>
<p>We found release dates for {{count}} movies</p>

<!-- Movie card with "we'll notify you" message -->
<h3 style="color: #f3d96b;">{{title}}</h3>
<div style="background: rgba(243,217,107,0.1); border-radius: 6px; padding: 12px;">
  <p style="color: #f3d96b;">{{theatricalDate}}</p>
  <p style="color: #ccc; font-size: 12px;">Theatrical release date</p>
</div>
<p style="color: #ccc; font-size: 14px;">
  We'll send you another notification when this movie hits theaters.
</p>
```

---

## ⚙️ Setup Instructions

### 1. Environment Variables
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TMDB_API_KEY=your_tmdb_api_key
BREVO_API_KEY=your_brevo_api_key
CRON_SECRET=random_secret_string
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 2. Database Schema (Supabase/PostgreSQL)
```sql
CREATE TABLE followed_movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,

  -- Release tracking
  follow_type TEXT CHECK (follow_type IN ('theatrical', 'streaming', 'both')),
  theatrical_date DATE,
  streaming_date DATE,

  -- Notification tracking (NEW)
  theatrical_notified_at TIMESTAMPTZ,
  streaming_notified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tmdb_id)
);

-- Indexes for cron queries
CREATE INDEX idx_missing_dates ON followed_movies(theatrical_date, streaming_date)
  WHERE theatrical_date IS NULL OR streaming_date IS NULL;

CREATE INDEX idx_unnotified_releases ON followed_movies(theatrical_date, streaming_date, theatrical_notified_at, streaming_notified_at);
```

### 3. Vercel Cron Config
```json
{
  "crons": [
    {
      "path": "/api/cron/discover-dates",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/send-notifications",
      "schedule": "0 8 * * *"
    }
  ]
}
```

### 4. API Route Structure (Next.js 15)
```
app/api/cron/
├── discover-dates/
│   └── route.ts          # Calls discoverMissingDates()
└── send-notifications/
    └── route.ts          # Calls sendReleaseNotifications()
```

---

## 📈 Key Performance Improvements

| Optimization | Current | Optimized | Improvement |
|-------------|---------|-----------|-------------|
| User queries | N queries | 1 query (join) | **N→1 queries** |
| TMDB deduplication | None | Map caching | **~50% fewer API calls** |
| DB updates | N PATCHes | 1 upsert | **N→1 queries** |
| Notification tracking | None | Timestamp columns | **No duplicate emails** |
| Rate limiting | 1s/10 movies | 250ms/unique movie | **More consistent** |
