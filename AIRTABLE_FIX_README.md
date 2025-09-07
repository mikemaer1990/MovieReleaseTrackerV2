# Airtable Date Correction Script

This script fixes existing movie records in Airtable that were created before the unified release date implementation. It updates theatrical and streaming dates to use the correct prioritized dates.

## What It Does

- Scans all records in the `FollowedMovies` Airtable table
- Groups records by `TMDB_ID` to avoid duplicate API calls
- Fetches unified release data for each movie from TMDB
- Compares stored dates with correct dates
- Updates records that have incorrect dates

## Date Correction Logic

- **Theatrical Date**: Uses US theatrical date if available, falls back to primary TMDB date
- **Streaming Date**: Uses TMDB digital/physical release date
- **Both Follows**: Updates both theatrical and streaming dates as needed

## Usage

### Dry Run (Recommended First)
```bash
node fix-airtable-dates.js --dry-run
```
This shows what changes would be made without actually updating anything.

### Live Update
```bash
node fix-airtable-dates.js
```
This applies the changes to your Airtable database.

### Limited Processing
```bash
# Process only first 10 movies for testing
node fix-airtable-dates.js --dry-run --limit=10

# Update only first 5 movies
node fix-airtable-dates.js --limit=5
```

## Required Environment Variables

Make sure these are set in your `.env` file:
- `AIRTABLE_API_KEY` - Your Airtable Personal Access Token
- `AIRTABLE_BASE_ID` - Your Airtable Base ID
- `AIRTABLE_FOLLOWED_MOVIES_TABLE` - Table name (usually "FollowedMovies")
- `TMDB_API_KEY` - Your TMDB API key

## Example Output

```
🔧 Airtable Date Correction Script
==================================
Mode: DRY RUN (no changes will be made)

📥 Fetching all records from Airtable...
   Found 127 total records
   Grouped into 45 unique movies
   Processing 45 movies...

[1/45] Processing: One Battle After Another (ID: 1054867)
   Current data from TMDB:
     US Theatrical: 2025-09-26
     Streaming: None
     Primary: 2025-09-24
     → Using Theatrical: 2025-09-26
   Record rec123 (theatrical): Theatrical 2025-09-24 → 2025-09-26
   🔍 Would update record rec123 (dry run)

📊 Summary
==========
Movies processed: 45
Records updated: 12
Errors: 0
Mode: DRY RUN - No actual changes made

💡 To apply these changes, run:
   node fix-airtable-dates.js
```

## Safety Features

- **Dry run mode**: Test before applying changes
- **Rate limiting**: 250ms delay between TMDB API calls
- **Error handling**: Continues processing even if individual movies fail
- **Detailed logging**: See exactly what changes are being made
- **Grouping**: Efficient processing by movie ID to avoid duplicate API calls

## When to Use

- After implementing unified release date functionality
- When you notice movies showing incorrect dates in "My Movies"
- After TMDB updates their release date data
- As periodic maintenance to ensure data accuracy

## Important Notes

⚠️ **Backup Recommended**: Consider backing up your Airtable data before running the live update.

⚠️ **API Limits**: The script respects TMDB API rate limits with built-in delays.

⚠️ **One-time Fix**: This is typically run once after implementing unified dates, not regularly.