# TODO: Debug Streaming Date Issue (RESOLVED ✅)

## Issue Status: FIXED
~~User followed "Wake Up Dead Man: A Knives Out Mystery" for streaming only but streaming dates are not being captured from upcoming page.~~

**Resolution**: The issue was in `services/airtable.js` where the `followMovie` function was checking for `movieData.FollowType === "Streaming"` (capital S) but the API sends lowercase `"streaming"`. Also, it was incorrectly using `movieData.ReleaseDate` instead of `movieData.StreamingReleaseDate` for streaming dates.

## Changes Made (Now Working):
1. ✅ Fixed follow logic to not put streaming date in ReleaseDate field
2. ✅ Updated `_follow-button.ejs` to include `data-streaming-date` attribute 
3. ✅ Updated `follow.js` to send streaming date in API requests
4. ✅ Updated follow API to accept streaming date from frontend
5. ✅ **FIXED**: Updated `services/airtable.js` to properly handle lowercase follow types and use correct streaming date field

## Root Cause:
**File**: `services/airtable.js:95-101`
- Case sensitivity issue: `movieData.FollowType === "Streaming"` vs actual `"streaming"`
- Wrong field reference: Used `movieData.ReleaseDate` instead of `movieData.StreamingReleaseDate`

## Testing Completed:
1. ✅ Verified HTML generation includes `data-streaming-date="2025-12-12"` on upcoming page
2. ✅ Confirmed frontend JavaScript sends streamingDate in follow request
3. ✅ Verified API receives and processes streaming date parameter correctly
4. ✅ Successfully followed "Wake Up Dead Man" for streaming only with Dec 12, 2025 date

---

# Original TODO: Debug Streaming Date Issue

## Problem Summary
User followed "Wake Up Dead Man: A Knives Out Mystery" for streaming only with known December 12, 2025 Netflix release date, but the system didn't capture the streaming date in the database.

## Investigation Required

### 1. Environment Setup
- [x] Verify TMDB API key is properly configured in environment variables
- [x] Test basic TMDB API connectivity with a simple movie search
- [x] Confirm the development environment can make external API calls

### 2. Movie Identification
- [x] Search TMDB for "Wake Up Dead Man: A Knives Out Mystery" to get the exact movie ID
- [x] Verify this is the correct third Knives Out movie scheduled for Netflix release
- [x] Document the TMDB ID for future testing

### 3. Release Data Analysis
- [x] Call TMDB `/movie/{id}/release_dates` endpoint directly for this movie
- [x] Examine the raw JSON response structure
- [x] Check what release types are available (current code only looks for types 4 and 5)
- [x] Identify if Netflix exclusives use different type codes than standard digital releases

### 4. Code Investigation
- [x] Test the `getReleaseData()` function specifically with this movie ID
- [x] Add debug logging to see exactly what data TMDB returns
- [x] Verify the filtering logic in `services/tmdb.js` lines 59-66
- [x] Check if the issue is in data retrieval or data processing

### 5. Potential Root Causes
- [x] **Missing Release Types**: Netflix exclusives might use different TMDB release type codes
- [x] **Region Issues**: Movie might only have release data for non-US regions
- [x] **TMDB Data Gaps**: Streaming date might not be available in TMDB yet
- [x] **API Changes**: TMDB might have changed their data structure

### 6. Proposed Solutions

#### Option A: Expand Release Type Filtering
- [x] Research TMDB documentation for all possible release types
- [x] Add additional release types that streaming platforms might use
- [x] Update the filter: `[4, 5].includes(r.type)` to include more types

#### Option B: Fallback Logic
- [x] For streaming-only follows, use primary release date as fallback
- [x] Add logic to detect when a movie is streaming-exclusive
- [x] Implement graceful degradation when streaming dates are missing

#### Option C: Enhanced Data Collection
- [x] Look at release data from all regions, not just US
- [x] Add fallback to movie's primary release date for streaming follows
- [x] Implement better error handling and user feedback

### 7. Testing Plan
- [x] Create test cases with known streaming-only movies
- [x] Test with various Netflix exclusives and streaming platform releases
- [x] Verify the fix doesn't break existing theatrical date capture
- [x] Test edge cases (movies with both theatrical and streaming dates)

### 8. User Experience Improvements
- [ ] Add better error messaging when streaming dates can't be found
- [ ] Consider showing "Date TBD" or "Coming Soon" for missing dates
- [ ] Implement retry logic for the streaming date checker cron job

## Files to Review
- `services/tmdb.js` - Main TMDB API integration
- `routes/api/follow.js` - Movie following logic
- `routes/check-streaming-dates.js` - Streaming date discovery cron job
- `services/airtable.js` - Database operations

## Expected Outcome
- Streaming dates for Netflix exclusives and platform-specific releases are properly captured
- System provides clear feedback when dates aren't available
- Robust fallback mechanisms prevent silent failures

## Priority: High
This affects user experience when following streaming-only releases, which are becoming increasingly common with platform exclusives.

---

# Server Improvements & Security

## Priority: Medium

### Security Improvements
- [ ] Enable firewall with UFW (allow SSH, HTTP, HTTPS only)
- [ ] Secure environment file permissions (chmod 600 .env)
- [ ] Enable automatic security updates via unattended-upgrades

### Monitoring & Performance
- [ ] Install htop for resource monitoring
- [ ] Set up basic server monitoring with PM2 monit

### SSL Enhancement
- [ ] Upgrade Cloudflare SSL from Flexible to Full (strict) mode

### Commands Reference
```bash
# Firewall setup
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# File permissions
chmod 600 /var/www/movietracker/.env

# Auto updates
apt install unattended-upgrades
dpkg-reconfigure unattended-upgrades

# Monitoring tools
apt install htop
pm2 monit
```